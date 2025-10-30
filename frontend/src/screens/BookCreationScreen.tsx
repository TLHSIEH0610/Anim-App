import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, Image } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TextInput as PaperTextInput, SegmentedButtons, TouchableRipple, IconButton, ActivityIndicator as PaperActivityIndicator, Snackbar, Portal, Dialog } from 'react-native-paper';
import * as ImagePicker from "expo-image-picker";
import { CardField, useStripe, isStripeAvailable } from "../lib/stripe";
import {
  createBook,
  BookCreationData,
  getStoryTemplates,
  StoryTemplateSummary,
} from "../api/books";
import {
  fetchPricing,
  payWithCredits,
  createStripeIntent,
  confirmStripePayment,
  PricingQuote,
  PaymentResult,
  StripeIntentResponse,
} from "../api/billing";
import { useAuth } from "../context/AuthContext";
import { colors, radii, shadow, spacing, typography } from "../styles/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/types";
import ScreenWrapper from "../components/ScreenWrapper";
import Button from "../components/Button";

interface TemplateStorylinePage {
  pageNumber: number;
  imagePrompt: string;
}

interface TemplateDisplay extends StoryTemplateSummary {
  description?: string | null;
  defaultAge?: string | null;
  storyText?: string;
  storylinePages: TemplateStorylinePage[];
}

interface TemplateInput {
  name: string;
  gender: "male" | "female";
}

interface BookForm {
  title: string;
  pageCount: number;
  images: string[];
  templateKey: string | null;
  templateInput: TemplateInput;
}

const steps = ["Story Setup", "Review", "Payment"];

const GENDER_OPTIONS: Array<{ value: "male" | "female"; label: string }> = [
  { value: "female", label: "Girl" },
  { value: "male", label: "Boy" },
];

type PaymentMode = "none" | "free_trial" | "credits" | "stripe_confirmed";

const buildAutoTitle = (storyLabel: string | undefined, characterName: string | undefined) => {
  const cleanStory = (storyLabel || "Story").trim();
  const cleanName = (characterName || "").trim();
  if (cleanName.length) {
    return `${cleanStory} - ${cleanName}`;
  }
  return `${cleanStory} - Character Name`;
};

const formatCredits = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "0";
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "0";
  }
  return Number.isInteger(numeric) ? numeric.toString() : numeric.toFixed(2).replace(/\.?0+$/, "");
};

type CardDetailsChange = {
  complete?: boolean;
};



const formatCurrency = (amount: number | null | undefined, currency: string | undefined) => {
  if (amount === null || amount === undefined) {
    return "--";
  }
  const normalized = Number.isNaN(amount) ? 0 : amount;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "AUD").toUpperCase(),
      minimumFractionDigits: 2,
    }).format(normalized);
  } catch {
    const fallbackCurrency = (currency || "AUD").toUpperCase();
    const safeAmount = Number.isFinite(normalized) ? normalized : 0;
    return `${fallbackCurrency} ${safeAmount.toFixed(2)}`;
  }
};

const injectCharacterName = (text: string | null | undefined, rawName: string) => {
  if (!text) {
    return "";
  }
  const fallbackName = rawName.trim() || "your character";
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, fallbackName)
    .replace(/\{name\}/gi, fallbackName)
    .replace(/\[name\]/gi, fallbackName)
    .replace(/<name>/gi, fallbackName);
};
type BookCreationScreenProps = NativeStackScreenProps<AppStackParamList, "BookCreation">;

export default function BookCreationScreen({ navigation, route }: BookCreationScreenProps) {
  const { token } = useAuth();
  const stripe = useStripe();
  const cardPaymentsSupported = isStripeAvailable && !!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();

  const [templates, setTemplates] = useState<TemplateDisplay[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [form, setForm] = useState<BookForm>({
    title: "",
    pageCount: 8,
    images: [],
    templateKey: null,
    templateInput: {
      name: "",
      gender: "female",
    },
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const [creationDialog, setCreationDialog] = useState<{ visible: boolean; bookId: number | null }>({ visible: false, bookId: null });

  const [pricingQuote, setPricingQuote] = useState<PricingQuote | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const [paymentMode, setPaymentMode] = useState<PaymentMode>("none");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"free_trial" | "credits" | "card" | null>(
    null
  );
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [cardDetailsComplete, setCardDetailsComplete] = useState(false);
  const [cardFieldError, setCardFieldError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [autoTitle, setAutoTitle] = useState<string>("");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);

  const selectedTemplate = useMemo(() => {
    if (!form.templateKey) {
      return templates.length ? templates[0] : null;
    }
    return templates.find((tpl) => tpl.slug === form.templateKey) || null;
  }, [templates, form.templateKey]);

  const storylinePreview = useMemo(() => {
    if (!selectedTemplate) {
      return "";
    }
    const text =
      selectedTemplate.storyText?.trim() ||
      selectedTemplate.description?.trim() ||
      selectedTemplate.storylinePages?.[0]?.imagePrompt?.trim();
    return injectCharacterName(text, form.templateInput.name);
  }, [selectedTemplate, form.templateInput.name]);

  const storylinePagesDetailed = useMemo(() => {
    if (!selectedTemplate?.storylinePages?.length) {
      return [];
    }
    return selectedTemplate.storylinePages.map((page) => ({
      pageNumber: page.pageNumber,
      text: injectCharacterName(page.imagePrompt, form.templateInput.name),
    }));
  }, [selectedTemplate, form.templateInput.name]);

  const resetPaymentState = useCallback(() => {
    setPaymentMode("none");
    setSelectedPaymentMethod(null);
    setPaymentId(null);
    setPaymentError(null);
    setCreditsBalance(null);
    setCardDetailsComplete(false);
    setCardFieldError(null);
  }, []);

  const isPaymentComplete = useCallback(
    (mode: PaymentMode, id: number | null, quote: PricingQuote | null) => {
      if (!quote) {
        return false;
      }
      if (quote.final_price <= 0) {
        if (quote.free_trial_slug && !quote.free_trial_consumed) {
          return mode === "free_trial";
        }
        return true;
      }

      if (mode === "credits") {
        return true;
      }
      if (mode === "stripe_confirmed" && id !== null) {
        return true;
      }
      if (mode === "free_trial") {
        return Boolean(quote.free_trial_slug) && !quote.free_trial_consumed;
      }
      return false;
    },
    []
  );
  const loadPricing = useCallback(
    async (templateSlug: string | null) => {
      if (!templateSlug) {
        setPricingQuote(null);
        resetPaymentState();
        return;
      }
      setPricingLoading(true);
      setPricingError(null);
      resetPaymentState();
      try {
        const quote = await fetchPricing(templateSlug);
        setPricingQuote(quote);
        setCreditsBalance(quote.credits_balance ?? null);
      } catch (error: any) {
        console.error("Failed to load pricing", error?.response?.data || error);
        setPricingQuote(null);
        setPricingError("Unable to fetch pricing. Pull to refresh or try again.");
      } finally {
        setPricingLoading(false);
      }
    },
    [resetPaymentState]
  );

  const initializeTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    setTemplatesError(null);
    try {
      const response = await getStoryTemplates();
      if (response.stories && response.stories.length) {
        const mapped: TemplateDisplay[] = response.stories.map((story) => {
          const { storyline_pages, ...rest } = story;
          return {
            ...rest,
            storyText: rest.description || undefined,
            storylinePages:
              storyline_pages?.map((page) => ({
                pageNumber: page.page_number,
                imagePrompt: page.image_prompt,
              })) ?? [],
          };
        });
        setTemplates(mapped);
        setForm((prev) => {
          const initialSlug = route?.params?.templateSlug;
          const first = mapped[0];
          const chosen = mapped.find(t => t.slug === initialSlug) || first;
          const templateKey = chosen?.slug ?? null;
          const generatedTitle = buildAutoTitle(first?.name, prev.templateInput.name);
          setAutoTitle(generatedTitle);
          setTitleManuallyEdited(false);
          return {
            ...prev,
            templateKey,
            pageCount: first?.page_count ?? prev.pageCount,
            title: generatedTitle,
          };
        });
        const priceSlug = route?.params?.templateSlug || mapped[0]?.slug || null;
        if (priceSlug) {
          await loadPricing(priceSlug);
        }
      } else {
        setTemplates([]);
        setTemplatesError("No story templates available.");
      }
    } catch (error) {
      console.error("Unable to fetch story templates", error);
      setTemplatesError("Failed to load story templates.");
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [loadPricing]);

  useEffect(() => {
    initializeTemplates();
  }, [initializeTemplates]);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      pageCount: selectedTemplate.page_count ?? prev.pageCount,
    }));
  }, [selectedTemplate]);

  useEffect(() => {
    const generated = buildAutoTitle(selectedTemplate?.name, form.templateInput.name);
    setAutoTitle(generated);
    if (!titleManuallyEdited) {
      setForm((prev) => (prev.title === generated ? prev : { ...prev, title: generated }));
    }
  }, [selectedTemplate?.name, form.templateInput.name, titleManuallyEdited]);

  useEffect(() => {
    if (selectedTemplate) {
      loadPricing(selectedTemplate.slug);
    }
  }, [selectedTemplate?.slug, loadPricing]);

  useEffect(() => {
    if (!pricingQuote) {
      return;
    }
    const freeTrialAvailable = Boolean(
      pricingQuote.free_trial_slug && !pricingQuote.free_trial_consumed
    );
    const balanceForSelection = pricingQuote.credits_balance ?? 0;
    const requiredForSelection = pricingQuote.credits_required ?? 0;
    const creditsAvailable = requiredForSelection > 0 && balanceForSelection >= requiredForSelection;
    const cardAvailable =
      cardPaymentsSupported && pricingQuote.final_price > 0 && pricingQuote.card_available !== false;

    setSelectedPaymentMethod((prev) => {
      if (prev === "free_trial" && freeTrialAvailable) {
        return prev;
      }
      if (prev === "credits" && creditsAvailable) {
        return prev;
      }
      if (prev === "card" && cardAvailable) {
        return prev;
      }
      if (freeTrialAvailable) {
        return "free_trial";
      }
      if (creditsAvailable) {
        return "credits";
      }
      if (cardAvailable) {
        return "card";
      }
      return null;
    });
  }, [pricingQuote, cardPaymentsSupported]);

  const updateForm = <K extends keyof BookForm>(field: K, value: BookForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateTemplateInput = (field: keyof TemplateInput, value: string) => {
    setForm((prev) => ({
      ...prev,
      templateInput: {
        ...prev.templateInput,
        [field]: value,
      },
    }));
    if (field === "name") {
      if (value.trim().length > 0) {
        setNameError(null);
      }
      const templateLabel = selectedTemplate?.name;
      const generated = buildAutoTitle(templateLabel, value);
      setAutoTitle(generated);
      if (!titleManuallyEdited) {
        updateForm("title", generated);
      }
    }
  };

  const updateImages = (images: string[]) => {
    setForm((prev) => ({ ...prev, images }));
    if (images.length > 0) {
      setImageError(null);
    }
  };

  const handleTitleChange = (value: string) => {
    if (value.trim().length === 0) {
      setTitleManuallyEdited(false);
      updateForm("title", value);
      return;
    }
    setTitleManuallyEdited(true);
    updateForm("title", value);
  };
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: false,
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: 4,
      });

      if (!result.canceled) {
        const selectedAssets = result.assets;
        if (selectedAssets.length > 4) {
          setSnackbar({ visible: true, message: 'You can select up to 4 images maximum' });
          return;
        }

        for (const asset of selectedAssets) {
          if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
            setSnackbar({ visible: true, message: `${asset.fileName || 'An image'} is larger than 10MB.` });
            return;
          }
        }

        const imageUris = selectedAssets.map((asset) => asset.uri);
        updateImages(imageUris);

      }
    } catch (error) {
      setSnackbar({ visible: true, message: 'Failed to pick images' });
    }
  };

  const removeImage = (index: number) => {
    const newImages = form.images.filter((_, i) => i !== index);
    updateImages(newImages);
    if (newImages.length === 0) {
      setImageError("At least one character image is required.");
    }
  };

  const handleSelectTemplate = (template: TemplateDisplay) => {
    updateForm("templateKey", template.slug);
  };

  const handleUseFreeTrial = () => {
    if (!pricingQuote || !pricingQuote.free_trial_slug || pricingQuote.free_trial_consumed) {
      return;
    }
    setSelectedPaymentMethod("free_trial");
    setPaymentMode("none");
    setPaymentId(null);
    setPaymentError(null);
    setCardDetailsComplete(false);
    setCardFieldError(null);
  };

  const handlePayWithCredits = () => {
    if (!pricingQuote) {
      return;
    }
    const required = pricingQuote.credits_required ?? 0;
    const balance = pricingQuote.credits_balance ?? 0;
    if (required <= 0 || balance < required) {
      return;
    }
    setSelectedPaymentMethod("credits");
    setPaymentMode("none");
    setPaymentId(null);
    setPaymentError(null);
    setCardDetailsComplete(false);
    setCardFieldError(null);
  };

  const handlePayWithCard = () => {
    if (!pricingQuote || pricingQuote.final_price <= 0) {
      return;
    }
    if (!cardPaymentsSupported) {
      setPaymentError("Card payments are unavailable in this build.");
      return;
    }
    if (pricingQuote.card_available === false) {
      setPaymentError("Card payments are currently disabled. Please choose another option.");
      return;
    }
    setSelectedPaymentMethod("card");
    setPaymentMode("none");
    setPaymentId(null);
    setPaymentError(null);
    setCardDetailsComplete(false);
    setCardFieldError(null);
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0:
        return form.images.length > 0 && !!selectedTemplate && !!form.templateInput.name.trim();
      case 1:
        return !!form.title.trim();
      case 2:
        if (!pricingQuote || pricingLoading) {
          return false;
        }
        if (pricingQuote.final_price <= 0 && (!pricingQuote.free_trial_slug || pricingQuote.free_trial_consumed)) {
          return true;
        }
        return selectedPaymentMethod !== null;
      default:
        return true;
    }
  };

  const ensureFormReady = (): { template: TemplateDisplay; quote: PricingQuote } | null => {
    if (!form.images.length) {
      setImageError("Upload at least one character image to continue.");
      setSnackbar({ visible: true, message: 'Please select at least 1 image' });
      return null;
    }
    if (!form.title.trim()) {
      setSnackbar({ visible: true, message: 'Please enter a book title' });
      return null;
    }
    if (!form.templateInput.name.trim()) {
      setNameError("Character name is required.");
      setSnackbar({ visible: true, message: 'Please provide a character name' });
      return null;
    }
    if (!selectedTemplate) {
      setSnackbar({ visible: true, message: 'Please select a story template' });
      return null;
    }
    if (!pricingQuote) {
      setSnackbar({ visible: true, message: 'Pricing information is unavailable. Please try again.' });
      return null;
    }
    return { template: selectedTemplate, quote: pricingQuote };
  };

  const createChildBook = async (
    overrides?: { paymentModeOverride?: PaymentMode; paymentIdOverride?: number | null }
  ) => {
    const effectivePaymentMode = overrides?.paymentModeOverride ?? paymentMode;
    const effectivePaymentId =
      overrides && Object.prototype.hasOwnProperty.call(overrides, "paymentIdOverride")
        ? overrides.paymentIdOverride ?? null
        : paymentId;

    const preflight = ensureFormReady();
    if (!preflight) {
      setSnackbar({ visible: true, message: 'Please complete required fields before continuing.' });
      return;
    }
    const { template, quote } = preflight;

    if (!token) {
      setSnackbar({ visible: true, message: 'Please sign in again to create your book.' });
      return;
    }

    if (!isPaymentComplete(effectivePaymentMode, effectivePaymentId, quote)) {
      setSnackbar({ visible: true, message: 'Please complete the payment step before creating your book.' });
      return;
    }

    const payload: BookCreationData = {
      files: form.images,
      title: form.title.trim(),
      page_count: form.pageCount,
      story_source: "template",
      template_key: template.slug,
      template_params: {
        name: form.templateInput.name.trim() || undefined,
        gender: form.templateInput.gender,
      },
    };

    if (effectivePaymentId) {
      payload.paymentId = effectivePaymentId;
    }
    if (effectivePaymentMode === "free_trial") {
      payload.applyFreeTrial = true;
    }

    setIsCreating(true);

    try {
      const response = await createBook(token, payload);
      setCreationDialog({ visible: true, bookId: response.id });
      resetPaymentState();
    } catch (error: any) {
      console.error("Book creation error:", error?.response?.data || error.message);
      let errorMessage = "Failed to create book. Please try again.";
      if (error.response?.status === 402) {
        errorMessage = error.response.data?.detail || "Payment verification failed.";
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data?.detail || "Invalid input. Please check your form.";
      }
      setSnackbar({ visible: true, message: errorMessage });
    } finally {
      setIsCreating(false);
    }
  };

  const renderTemplateCard = (template: TemplateDisplay) => {
    const isActive = template.slug === selectedTemplate?.slug;
    const quote = pricingQuote && template.slug === selectedTemplate?.slug ? pricingQuote : null;
    return (
      <TouchableRipple
        key={template.slug}
        style={[styles.templateCard, isActive && styles.templateCardActive]}
        onPress={() => handleSelectTemplate(template)}
      >
        <View>
          <Text style={styles.templateTitle}>{template.name}</Text>
          {template.description ? (
            <Text style={styles.templateDescription}>{template.description}</Text>
          ) : null}
          <Text style={styles.templateMeta}>
            Suggested Age: {template.age || "n/a"} - {template.page_count || 0} pages
          </Text>
          {quote ? (
            <View style={styles.pricingRow}>
              <Text style={styles.priceValue}>{formatCurrency(quote.final_price, quote.currency)}</Text>
              {quote.promotion_label ? (
                <View style={styles.promotionBadge}>
                  <Text style={styles.promotionText}>{quote.promotion_label.toUpperCase()}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </TouchableRipple>
    );
  };

  const handleConfirmPaymentAndCreate = async () => {
    const preflight = ensureFormReady();
    if (!preflight) {
      return;
    }
    const { template, quote } = preflight;
    const paymentRequired =
      quote.final_price > 0 ||
      (!!quote.free_trial_slug && !quote.free_trial_consumed);

    if (!selectedPaymentMethod && paymentRequired) {
      setPaymentError("Please choose a payment method in the review step.");
      setCurrentStep(1);
      return;
    }

    setPaymentError(null);
    setIsPaymentLoading(true);

    let nextMode: PaymentMode = "none";
    let nextPaymentId: number | null = null;

    try {
      if (!paymentRequired) {
        nextMode = "none";
      } else if (selectedPaymentMethod === "free_trial") {
        if (!quote.free_trial_slug || quote.free_trial_consumed) {
          throw new Error("Free trial is no longer available for this template.");
        }
        nextMode = "free_trial";
      } else if (selectedPaymentMethod === "credits") {
        const required = quote.credits_required ?? 0;
        const balance = quote.credits_balance ?? 0;
        if (required > 0 && balance < required) {
          throw new Error("Not enough credits to complete this purchase.");
        }
        if (required > 0) {
          const result: PaymentResult = await payWithCredits(template.slug);
          nextMode = "credits";
          nextPaymentId = result.payment_id;
          setPricingQuote(result.quote);
          setCreditsBalance(result.quote.credits_balance ?? null);
        } else {
          nextMode = "credits";
        }
      } else if (selectedPaymentMethod === "card") {
        if (!cardPaymentsSupported) {
          throw new Error("Card payments are unavailable in this build.");
        }
        if (quote.card_available === false) {
          throw new Error("Card payments are currently disabled.");
        }
        if (quote.final_price <= 0) {
          throw new Error("Card payment is not required for this selection.");
        }
        if (!cardDetailsComplete) {
          setCardFieldError("Enter a valid card before confirming.");
          throw new Error("Enter a valid card before confirming.");
        }

        const intent: StripeIntentResponse = await createStripeIntent(template.slug);
        const { error: stripeError } = await stripe.confirmPayment(intent.client_secret, {
          paymentMethodType: "Card",
          paymentMethodData: {
            billingDetails: {
              name: form.templateInput.name?.trim() || undefined,
            },
          },
        });

        if (stripeError) {
          throw new Error(stripeError.message ?? "Unable to confirm card payment.");
        }

        const confirmation = await confirmStripePayment(intent.payment_id);
        nextMode = "stripe_confirmed";
        nextPaymentId = confirmation.payment_id;
      }

      setPaymentMode(nextMode);
      setPaymentId(nextPaymentId);

      await createChildBook({
        paymentModeOverride: nextMode,
        paymentIdOverride: nextPaymentId,
      });
    } catch (error: any) {
      console.error("Payment confirmation failed", error?.response?.data || error);
      const message =
        error?.response?.data?.detail || error?.message || "Unable to complete payment.";
      setPaymentError(message);
      const detail: string | undefined = error?.response?.data?.detail;
      if (detail && detail.toLowerCase().includes("stripe secret key not configured")) {
        setPricingQuote((prev) => (prev ? { ...prev, card_available: false } : prev));
        setSelectedPaymentMethod(null);
        setCurrentStep(1);
      }
    } finally {
      setIsPaymentLoading(false);
    }
  };

  const renderStep0 = () => {
    const readonlyTemplate = Boolean(route?.params?.templateSlug);
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Upload Character Images *</Text>
        <Text style={styles.stepDescription}>
          Select 1-4 images of your character for better consistency throughout the book.
        </Text>

        <View style={styles.imageCountBadge}>
          <Text style={styles.imageCountText}>{form.images.length}/4 images selected</Text>
        </View>

        {form.images.length ? (
          <View>
            <View style={styles.imageGallery}>
              {form.images.map((uri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri }} style={styles.galleryImage} />
                  <IconButton icon="close" size={18} style={styles.removeImageButton} onPress={() => removeImage(index)} />
                </View>
              ))}
            </View>
            {form.images.length < 4 && (
              <Button title="+ Add More Images" onPress={pickImage} variant="secondary" />
            )}
          </View>
        ) : (
          <Button title="Select Images (1-4)" onPress={pickImage} variant="primary" />
        )}

        <Text style={styles.helpText}>
          Tip: Multiple images help AI understand your character better! Choose clear images with good lighting.
        </Text>
        {imageError ? <Text style={styles.errorTextInline}>{imageError}</Text> : null}

        <View style={styles.sectionDivider} />

        <Text style={styles.stepTitle}>Story Setup</Text>

        {isLoadingTemplates ? (
          <View style={styles.loaderRow}>
            <PaperActivityIndicator />
            <Text style={styles.loaderText}>Loading templates...</Text>
          </View>
        ) : null}

        {templatesError ? (
          <Text style={styles.errorTextInline}>{templatesError}</Text>
        ) : null}

        {readonlyTemplate ? (
          <Text style={styles.helperText}>
            This story template is pre-selected for this book. You can review the details on the next step.
          </Text>
        ) : (
          <View style={styles.templateList}>
            {templates.map((template) => renderTemplateCard(template))}
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Character Name *</Text>
          <PaperTextInput
            mode="outlined"
            style={styles.textInput}
            outlineStyle={{ borderRadius: radii.md }}
            outlineColor={'rgba(37, 99, 235, 0.25)'}
            activeOutlineColor={colors.primary}
            placeholder="Enter a character name"
            value={form.templateInput.name}
            onChangeText={(text: string) => updateTemplateInput("name", text)}
            onBlur={() => {
              if (!form.templateInput.name.trim()) {
                setNameError("Character name is required.");
              }
            }}
          />
          {nameError ? <Text style={styles.errorTextInline}>{nameError}</Text> : null}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Character Pronouns</Text>
          <SegmentedButtons
            value={form.templateInput.gender}
            onValueChange={(val: string) => updateTemplateInput('gender', val)}
            density="small"
            style={styles.segmented}
            buttons={GENDER_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
          />
        </View>
      </View>
    );
  };
  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Review & Personalize</Text>

      {form.images.length > 0 && (
        <View style={styles.reviewImageGallery}>
          {form.images.map((uri, index) => (
            <Image key={index} source={{ uri }} style={styles.reviewImage} />
          ))}
        </View>
      )}

      <View style={styles.reviewDetails}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Book Title</Text>
          <PaperTextInput
            mode="outlined"
            style={styles.textInput}
            outlineStyle={{ borderRadius: radii.md }}
            outlineColor={'rgba(37, 99, 235, 0.25)'}
            activeOutlineColor={colors.primary}
            value={form.title}
            placeholder={autoTitle || "Story Title"}
            onChangeText={handleTitleChange}
          />
          {!form.title.trim() ? (
            <Text style={styles.errorTextInline}>Book title is required.</Text>
          ) : null}
        </View>
        <Text style={styles.reviewTitle}>"{form.title}"</Text>
        <Text style={styles.reviewDetail}>
          Template: {selectedTemplate?.name ?? "Custom"} - {form.pageCount} pages
        </Text>
        <Text style={styles.reviewDetail}>Images: {form.images.length} reference image(s)</Text>
        {form.templateInput.name.trim() ? (
          <Text style={styles.reviewDetail}>Lead Character: {form.templateInput.name.trim()}</Text>
        ) : null}
        {storylinePreview ? (
          <View style={styles.reviewStorylineWrapper}>
            <Text style={styles.reviewStorylineHeading}>Storyline Preview</Text>
            <Text style={styles.reviewStoryline}>{storylinePreview}</Text>
          </View>
        ) : null}
        {storylinePagesDetailed.length > 0 ? (
          <View style={[styles.reviewStorylineWrapper, styles.storylinePagesContainer]}>
            <Text style={styles.reviewStorylineHeading}>Full Storyline</Text>
            {storylinePagesDetailed.map((page) => (
              <View key={page.pageNumber} style={styles.storylinePageRow}>
                <Text style={styles.storylinePageNumber}>Page {page.pageNumber}</Text>
                <Text style={styles.storylinePageText}>{page.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.reviewPricingCard}>
        <Text style={styles.reviewPricingHeading}>Pricing & Payment</Text>
        {pricingLoading ? (
          <PaperActivityIndicator />
        ) : pricingQuote ? (
          <View>
            <View style={styles.pricingRowBetween}>
              <Text style={styles.pricingLabel}>Base price</Text>
              <Text style={styles.pricingValue}>{formatCurrency(pricingQuote.base_price, pricingQuote.currency)}</Text>
            </View>
            {pricingQuote.discount_price !== null && pricingQuote.discount_price < pricingQuote.base_price ? (
              <View style={styles.pricingRowBetween}>
                <Text style={styles.pricingLabel}>Discounted price</Text>
                <Text style={styles.pricingValue}>{formatCurrency(pricingQuote.discount_price, pricingQuote.currency)}</Text>
              </View>
            ) : null}
            {pricingQuote.free_trial_slug ? (
              <View style={styles.pricingRowBetween}>
                <Text style={styles.pricingLabel}>Free trial</Text>
                <Text style={styles.pricingValue}>
                  {pricingQuote.free_trial_consumed ? "Already used" : "Available"}
                </Text>
              </View>
            ) : null}
            <View style={styles.pricingRowBetween}>
              <Text style={[styles.pricingLabel, styles.pricingLabelStrong]}>Total due</Text>
              <Text style={[styles.pricingValue, styles.pricingValueStrong]}>
                {formatCurrency(pricingQuote.final_price, pricingQuote.currency)}
              </Text>
            </View>
            {renderReviewPaymentDetails()}
          </View>
        ) : (
          <Text style={styles.errorTextInline}>{pricingError || "Pricing unavailable"}</Text>
        )}
      </View>

      <View style={styles.paymentOptionsContainer}>{renderPaymentActions()}</View>
    </View>
  );

  const renderPaymentActions = () => {
    if (!pricingQuote) {
      return (
        <Text style={styles.errorTextInline}>Pricing not loaded. Please go back and retry.</Text>
      );
    }
    const controls: Array<React.ReactNode> = [];

    const freeTrialAvailable = Boolean(
      pricingQuote.free_trial_slug && !pricingQuote.free_trial_consumed
    );
    if (freeTrialAvailable) {
      controls.push(
        <Button
          key="free"
          title="Use Free Trial"
          onPress={handleUseFreeTrial}
          disabled={isPaymentLoading}
          variant={selectedPaymentMethod === "free_trial" ? 'primary' : 'secondary'}
        />
      );
    }

    const creditsRequired = pricingQuote.credits_required ?? 0;
    const creditsBalanceValue = pricingQuote.credits_balance ?? 0;
    const creditsLabel = formatCredits(creditsRequired);
    if (creditsRequired > 0 && creditsBalanceValue >= creditsRequired) {
      controls.push(
        <Button
          key="credits"
          title={`Use Credits (${creditsLabel})`}
          onPress={handlePayWithCredits}
          disabled={isPaymentLoading}
          variant={selectedPaymentMethod === "credits" ? 'primary' : 'secondary'}
        />
      );
    }

    const cardAvailable =
      cardPaymentsSupported && pricingQuote.card_available !== false && pricingQuote.final_price > 0;

    if (pricingQuote.final_price > 0 && cardPaymentsSupported && pricingQuote.card_available === false) {
      controls.push(
        <Text key="card-disabled" style={styles.helperText}>
          Card payments are currently unavailable. Please choose credits or a free trial.
        </Text>
      );
    }

    if (pricingQuote.final_price > 0 && cardAvailable) {
      controls.push(
        <Button
          key="card"
          title="Pay with Card"
          onPress={handlePayWithCard}
          disabled={isPaymentLoading || !cardPaymentsSupported}
          variant={selectedPaymentMethod === "card" ? 'primary' : 'secondary'}
        />
      );
    }

    if (!controls.length) {
      controls.push(
        <Text key="no-payment" style={styles.helperText}>
          No payment required for this selection.
        </Text>
      );
    }

    return controls;
  };

  const renderReviewPaymentDetails = () => {
    if (!pricingQuote) {
      return null;
    }
    const creditsRequired = pricingQuote.credits_required ?? 0;
    const creditsBalanceValue = pricingQuote.credits_balance ?? 0;
    const selectionLabel = (() => {
      if (selectedPaymentMethod === "free_trial") {
        return "Free trial";
      }
      if (selectedPaymentMethod === "credits") {
        return creditsRequired > 0 ? `Credits (${formatCredits(creditsRequired)})` : "Credits";
      }
      if (selectedPaymentMethod === "card") {
        return "Card";
      }
      return pricingQuote.final_price > 0 ? "Not selected" : "No payment needed";
    })();

    return (
      <>
        <View style={styles.reviewDivider} />
        <View style={styles.pricingRowBetween}>
          <Text style={styles.pricingLabel}>Selected option</Text>
          <Text style={styles.pricingValue}>{selectionLabel}</Text>
        </View>
        {selectedPaymentMethod === "credits" && pricingQuote.final_price > 0 ? (
          <>
            <View style={styles.pricingRowBetween}>
              <Text style={styles.pricingLabel}>Credits to use</Text>
              <Text style={styles.pricingValue}>{formatCredits(creditsRequired)}</Text>
            </View>
            <View style={styles.pricingRowBetween}>
              <Text style={styles.pricingLabel}>Current balance</Text>
              <Text style={styles.pricingValue}>{formatCredits(creditsBalanceValue)}</Text>
            </View>
          </>
        ) : null}
        {selectedPaymentMethod === "card" && pricingQuote.card_available === false ? (
          <Text style={styles.helperText}>
            Card payments are currently disabled. Please choose credits or a free trial.
          </Text>
        ) : null}
        {selectedPaymentMethod === "card" && pricingQuote.card_available !== false && pricingQuote.final_price > 0 ? (
          <Text style={styles.helperText}>
            Enter your card details in the next step to complete payment.
          </Text>
        ) : null}
        {selectedPaymentMethod === null && pricingQuote.final_price > 0 ? (
          <Text style={styles.helperText}>Choose a payment method below to continue.</Text>
        ) : null}
        {pricingQuote.final_price <= 0 ? (
          <Text style={styles.helperText}>No payment is required for this selection.</Text>
        ) : null}
      </>
    );
  };

  const renderStep2 = () => {
    const paymentRequired = pricingQuote
      ? pricingQuote.final_price > 0 ||
        (pricingQuote.free_trial_slug && !pricingQuote.free_trial_consumed)
      : true;

    const cardDetailsRequired =
      paymentRequired &&
      selectedPaymentMethod === "card" &&
      pricingQuote?.card_available !== false &&
      cardPaymentsSupported &&
      !cardDetailsComplete;

    const confirmDisabled = Boolean(
      isPaymentLoading ||
      isCreating ||
      (paymentRequired && !selectedPaymentMethod) ||
      cardDetailsRequired
    );

    return (
      <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Payment</Text>
      <Text style={styles.stepDescription}>
        Confirm your payment choice to start generating your personalized children's book.
      </Text>

      {pricingLoading ? (
        <PaperActivityIndicator />
      ) : pricingQuote ? (
        <View style={styles.paymentInfoCard}>
          <View style={styles.pricingRowBetween}>
            <Text style={styles.pricingLabel}>Total due</Text>
            <Text style={[styles.pricingValue, styles.pricingValueStrong]}>
              {formatCurrency(pricingQuote.final_price, pricingQuote.currency)}
            </Text>
          </View>
          {selectedPaymentMethod === "credits" ? (
            <View>
              <View style={styles.pricingRowBetween}>
                <Text style={styles.pricingLabel}>Credits to deduct</Text>
                <Text style={styles.pricingValue}>{formatCredits(pricingQuote.credits_required ?? 0)}</Text>
              </View>
              <View style={styles.pricingRowBetween}>
                <Text style={styles.pricingLabel}>Current balance</Text>
                <Text style={styles.pricingValue}>{formatCredits(pricingQuote.credits_balance ?? 0)}</Text>
              </View>
              <Text style={styles.helperText}>
                Your credits will be deducted once you confirm this payment.
              </Text>
            </View>
          ) : null}
          {selectedPaymentMethod === "card" ? (
            pricingQuote.card_available === false ? (
              <Text style={styles.helperText}>
                Card payments are currently disabled. Please choose credits or a free trial.
              </Text>
            ) : (
              <Text style={styles.helperText}>
                Enter your card details below. Your card will only be charged after you tap Confirm & Pay.
              </Text>
            )
          ) : null}
          {selectedPaymentMethod === "free_trial" ? (
            <Text style={styles.helperText}>
              This book will be unlocked using your available free trial. No payment required.
            </Text>
          ) : null}
          {!selectedPaymentMethod && paymentRequired ? (
            <Text style={styles.helperText}>
              Go back to the review step to choose a payment option before confirming.
            </Text>
          ) : null}
          {!paymentRequired ? (
            <Text style={styles.helperText}>
              No payment is required for this selection. Confirm to start your book creation.
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.errorTextInline}>{pricingError || "Pricing unavailable."}</Text>
      )}

      {selectedPaymentMethod === "card" && pricingQuote?.card_available !== false && cardPaymentsSupported ? (
        <View style={styles.cardFieldContainer}>
          <CardField
            postalCodeEnabled={false}
            placeholders={{ number: "4242 4242 4242 4242" }}
            cardStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.88)',
              textColor: colors.textPrimary,
              placeholderColor: colors.textMuted,
              borderRadius: radii.md,
              fontSize: 16,
            }}
            style={styles.cardField}
            onCardChange={(details: CardDetailsChange) => {
              const complete = details?.complete ?? false;
              setCardDetailsComplete(complete);
              setCardFieldError(complete ? null : "Enter full card details to continue.");
            }}
          />
          {cardFieldError ? <Text style={styles.errorTextInline}>{cardFieldError}</Text> : null}
        </View>
      ) : null}

      {paymentError ? <Text style={styles.errorTextInline}>{paymentError}</Text> : null}

      <Button
        title="Confirm & Pay"
        onPress={handleConfirmPaymentAndCreate}
        disabled={confirmDisabled}
        variant="primary"
      />
    </View>
    );
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderStep0();
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      default:
        return renderStep0();
    }
  };

  const goToNextStep = () => {
    if (currentStep < steps.length - 1 && canProceedToNext()) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === 0) {
      if (!form.templateInput.name.trim()) {
        setNameError("Character name is required.");
      }
      if (!form.images.length) {
        setImageError("Upload at least one character image to continue.");
      }
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };
  return (
    <ScreenWrapper>
    <Portal>
      <Dialog visible={creationDialog.visible} onDismiss={() => setCreationDialog({ visible: false, bookId: null })}>
        <Dialog.Title>Book Creation Started</Dialog.Title>
        <Dialog.Content>
          <Text>Your book is being created. This may take several minutes.</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button title="View Progress" onPress={() => { if (creationDialog.bookId) navigation.navigate('BookStatus', { bookId: creationDialog.bookId }); setCreationDialog({ visible: false, bookId: null }); }} />
        </Dialog.Actions>
      </Dialog>
    </Portal>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Children-s Book</Text>
        <Text style={styles.subtitle}>Pick a story template and bring it to life with your photos.</Text>
      </View>

      <View style={styles.stepIndicator}>
        {steps.map((step, index) => (
          <View key={index} style={styles.stepContainer}>
            <View
              style={[
                styles.stepCircle,
                index === currentStep && styles.stepCircleActive,
                index < currentStep && styles.stepCircleCompleted,
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  index <= currentStep && styles.stepNumberActive,
                ]}
              >
                {index + 1}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                index === currentStep && styles.stepLabelActive,
              ]}
            >
              {step}
            </Text>
          </View>
        ))}
      </View>

      {renderStepContent()}

      <View style={styles.navigationRow}>
        {currentStep > 0 && currentStep < steps.length - 1 ? (
          <Button
            title=""
            onPress={goToPrevStep}
            variant="secondary"
            style={styles.navButton}
            size="sm"
            leftIcon={<MaterialCommunityIcons name="arrow-left" size={20} color={colors.textPrimary} />}
          />
        ) : (
          <View style={styles.navSpacer} />
        )}

        {currentStep < steps.length - 1 ? (
          <Button
            title=""
            onPress={goToNextStep}
            disabled={!canProceedToNext()}
            variant="primary"
            style={[styles.navButton, styles.nextButton]}
             size="sm"
            rightIcon={<MaterialCommunityIcons name="arrow-right" size={20} color={canProceedToNext() ? colors.surface : colors.neutral500} />}
          />
        ) : (
          <View style={styles.navSpacer} />
        )}
      </View>

      <Button
        title="Cancel"
        onPress={() => navigation.navigate("BookLibrary")}
        variant="secondary"
        style={[styles.cancelButton, styles.cancelStandalone]}
      />
    </ScrollView>
    <Snackbar visible={snackbar.visible} onDismiss={() => setSnackbar({ visible: false, message: '' })} duration={3000}>
      {snackbar.message}
    </Snackbar>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
  },
  header: {
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(6),
  },
  title: {
    ...typography.headingXL,
    textAlign: "center",
    color: colors.primaryDark,
  },
  subtitle: {
    ...typography.body,
    textAlign: "center",
    marginTop: spacing(1),
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(5),
    backgroundColor: 'rgba(135, 206, 235, 0.18)',
    borderRadius: radii.lg,
    marginHorizontal: spacing(4),
    marginBottom: spacing(4),
  },
  stepContainer: {
    alignItems: "center",
    flex: 1,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(135, 206, 235, 0.25)',
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing(1.5),
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
  },
  stepCircleCompleted: {
    backgroundColor: 'rgba(37, 99, 235, 0.45)',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  stepNumberActive: {
    color: colors.surface,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  stepLabelActive: {
    color: colors.primaryDark,
    fontWeight: "600",
  },
  stepContent: {
    paddingHorizontal: spacing(2),
    paddingBottom: spacing(8),
  },
  sectionDivider: {
    height: spacing(5),
    width: '100%',
  },
  stepTitle: {
    ...typography.headingL,
    marginBottom: spacing(4),
  },
  stepDescription: {
    ...typography.body,
    lineHeight: 22,
    marginBottom: spacing(4.5),
  },
  imageCountBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: radii.pill,
    marginBottom: spacing(3),
  },
  imageCountText: {
    color: colors.primaryDark,
    fontWeight: "600",
  },
  helpText: {
    marginTop: spacing(3),
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  imageGallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(3),
    marginBottom: spacing(3),
  },
  imageWrapper: {
    position: "relative",
  },
  galleryImage: {
    width: 100,
    height: 100,
    borderRadius: radii.md,
  },
  removeImageButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: radii.pill,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  removeImageText: {
    color: colors.surface,
    fontWeight: "700",
    fontSize: 16,
    lineHeight: 16,
  },
  formGroup: {
    marginBottom: spacing(5),
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing(1.5),
  },
  textInput: {
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.15)',
    borderRadius: radii.md,
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(2.5),
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
  },
  segmented: {
    backgroundColor: 'rgba(135, 206, 235, 0.12)',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  optionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(2.5),
  },
  optionPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
    borderRadius: radii.pill,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  optionPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionRadio: {
    width: 14,
    height: 14,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.primarySoft,
    marginRight: spacing(2),
  },
  optionRadioActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  optionLabelActive: {
    color: colors.primaryDark,
    fontWeight: "600",
  },
  templateList: {
    marginBottom: spacing(1),
  },
  templateCard: {
    padding: spacing(4),
    borderRadius: radii.lg,
    borderWidth: 0,
    backgroundColor: 'rgba(135, 206, 235, 0.18)',
    marginBottom: spacing(3),
    ...shadow.subtle,
  },
  templateCardActive: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  templateTitle: {
    ...typography.headingM,
    marginBottom: spacing(2),
  },
  templateDescription: {
    ...typography.body,
    marginBottom: spacing(2),
    lineHeight: 21,
  },
  templateMeta: {
    fontSize: 12,
    color: colors.primaryDark,
    fontWeight: "600",
  },
  pricingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    marginTop: spacing(2),
  },
  priceValue: {
    ...typography.headingM,
    color: colors.primaryDark,
  },
  promotionBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: radii.pill,
  },
  promotionText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "600",
  },
  reviewImageGallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(3),
    marginBottom: spacing(4),
  },
  reviewImage: {
    width: 90,
    height: 90,
    borderRadius: radii.md,
  },
  reviewDetails: {
    backgroundColor: 'transparent',
    borderRadius: radii.lg,
    padding: 0,
    marginBottom: spacing(4),
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing(2),
  },
  reviewDetail: {
    ...typography.body,
    marginBottom: spacing(2),
  },
  reviewStorylineWrapper: {
    marginTop: spacing(3),
    padding: spacing(3.5),
    borderRadius: radii.lg,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderWidth: 0,
  },
  reviewStorylineHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primaryDark,
    marginBottom: spacing(2),
  },
  reviewStoryline: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  storylinePagesContainer: {
    marginTop: spacing(3),
  },
  storylinePageRow: {
    marginTop: spacing(2),
    paddingBottom: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.primarySoft,
  },
  storylinePageNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primaryDark,
    marginBottom: spacing(1),
  },
  storylinePageText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  reviewPricingCard: {
    backgroundColor: 'transparent',
    borderRadius: radii.lg,
    padding: 0,
    borderWidth: 0,
    marginBottom: spacing(4),
  },
  reviewDivider: {
    marginVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
  },
  reviewPricingHeading: {
    ...typography.headingM,
    marginBottom: spacing(3),
  },
  pricingRowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing(2),
  },
  pricingLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  pricingLabelStrong: {
    fontWeight: "700",
    color: colors.primaryDark,
  },
  pricingValue: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  pricingValueStrong: {
    fontSize: 16,
    color: colors.primaryDark,
  },
  errorTextInline: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing(2),
  },
  loaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    marginBottom: spacing(2),
  },
  loaderText: {
    ...typography.body,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  paymentOptionsContainer: {
    marginBottom: spacing(4),
  },
  paymentInfoCard: {
    backgroundColor: 'rgba(135, 206, 235, 0.18)',
    borderRadius: radii.lg,
    padding: spacing(4),
    borderWidth: 0,
    marginBottom: spacing(4),
    ...shadow.subtle,
  },
  cardFieldContainer: {
    marginTop: spacing(4),
    marginBottom: spacing(4),
  },
  cardField: {
    width: "100%",
    height: 52,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radii.lg,
    alignItems: "center",
    marginBottom: spacing(8),
    ...shadow.card,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: "600",
  },
  navigationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(8),
    gap: spacing(4),
  },
  navButton: {
    flex: 1,
    marginHorizontal: spacing(1),
  },
  navSpacer: {
    flex: 1,
    marginHorizontal: spacing(1),
    opacity: 0,
  },
  cancelButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 0,
  },
  nextButton: {
  },
  cancelStandalone: {
    marginHorizontal: spacing(6),
    marginBottom: spacing(8),
  },
});
