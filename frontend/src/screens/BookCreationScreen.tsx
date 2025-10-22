import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useStripe, isStripeAvailable } from "../lib/stripe";
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

interface TemplateDisplay extends StoryTemplateSummary {
  description?: string | null;
  defaultAge?: string | null;
  storyText?: string;
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

const steps = ["Upload Images", "Story Setup", "Review", "Payment"];

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
export default function BookCreationScreen({ navigation }) {
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

  const [pricingQuote, setPricingQuote] = useState<PricingQuote | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const [paymentMode, setPaymentMode] = useState<PaymentMode>("none");
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);

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
    const characterName = form.templateInput.name.trim() || "your character";
    const text = selectedTemplate.storyText?.trim() || selectedTemplate.description?.trim();
    if (!text) {
      return "";
    }
    return text
      .replace(/\{\{\s*name\s*\}\}/gi, characterName)
      .replace(/\{name\}/gi, characterName)
      .replace(/\[name\]/gi, characterName)
      .replace(/<name>/gi, characterName);
  }, [selectedTemplate, form.templateInput.name]);

  const resetPaymentState = useCallback(() => {
    setPaymentMode("none");
    setPaymentId(null);
    setPaymentError(null);
    setCreditsBalance(null);
  }, []);
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
        const mapped: TemplateDisplay[] = response.stories.map((story) => ({
          ...story,
          storyText: story.description || undefined,
        }));
        setTemplates(mapped);
        setForm((prev) => {
          const first = mapped[0];
          const templateKey = first?.slug ?? null;
          return {
            ...prev,
            templateKey,
            pageCount: first?.page_count ?? prev.pageCount,
            title: buildAutoTitle(first?.name, prev.templateInput.name),
          };
        });
        if (mapped[0]) {
          await loadPricing(mapped[0].slug);
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
    const templateLabel = selectedTemplate?.name;
    setForm((prev) => ({
      ...prev,
      title: buildAutoTitle(templateLabel, prev.templateInput.name),
    }));
  }, [selectedTemplate]);

  useEffect(() => {
    if (selectedTemplate) {
      loadPricing(selectedTemplate.slug);
    }
  }, [selectedTemplate?.slug, loadPricing]);

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
      const templateLabel = selectedTemplate?.name;
      updateForm("title", buildAutoTitle(templateLabel, value));
    }
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
          Alert.alert("Too Many Images", "You can select up to 4 images maximum");
          return;
        }

        for (const asset of selectedAssets) {
          if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
            Alert.alert(
              "File Too Large",
              `${asset.fileName || "An image"} is larger than 10MB. Please select smaller images.`
            );
            return;
          }
        }

        const imageUris = selectedAssets.map((asset) => asset.uri);
        updateForm("images", imageUris);

        if (currentStep === 0) {
          setCurrentStep(1);
        }
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick images");
    }
  };

  const removeImage = (index: number) => {
    const newImages = form.images.filter((_, i) => i !== index);
    updateForm("images", newImages);
  };

  const handleSelectTemplate = (template: TemplateDisplay) => {
    updateForm("templateKey", template.slug);
  };

  const handleUseFreeTrial = () => {
    if (!pricingQuote || !pricingQuote.free_trial_slug || pricingQuote.free_trial_consumed) {
      return;
    }
    setPaymentMode("free_trial");
    setPaymentId(null);
    setPaymentError(null);
  };

  const handlePayWithCredits = async () => {
    if (!selectedTemplate) {
      return;
    }
    if (!pricingQuote || pricingQuote.final_price <= 0) {
      return;
    }
    if ((pricingQuote.credits_required ?? 0) <= 0) {
      return;
    }
    if (!cardPaymentsSupported) {
      setPaymentError("Card payments are unavailable in this build.");
      return;
    }
    setIsPaymentLoading(true);
    setPaymentError(null);
    try {
      const result: PaymentResult = await payWithCredits(selectedTemplate.slug);
      setPaymentId(result.payment_id);
      setPaymentMode("credits");
      setPricingQuote(result.quote);
      setCreditsBalance(result.quote.credits_balance ?? null);
      Alert.alert("Credits Applied", "Your credits have been deducted for this book.");
    } catch (error: any) {
      console.error("Credit payment failed", error?.response?.data || error);
      setPaymentError(error?.response?.data?.detail || "Unable to use credits.");
    } finally {
      setIsPaymentLoading(false);
    }
  };

  const handlePayWithCard = async () => {
    if (!selectedTemplate || !pricingQuote || pricingQuote.final_price <= 0) {
      return;
    }
    if (!cardPaymentsSupported) {
      setPaymentError("Card payments are unavailable in this build.");
      return;
    }
    setIsPaymentLoading(true);
    setPaymentError(null);
    try {
      const intent: StripeIntentResponse = await createStripeIntent(selectedTemplate.slug);
      const sheetInit = await stripe.initPaymentSheet({
        merchantDisplayName: "AnimApp",
        paymentIntentClientSecret: intent.client_secret,
      });
      if (sheetInit.error) {
        throw new Error(sheetInit.error.message ?? "Unable to initialize payment sheet");
      }
      const sheetPresent = await stripe.presentPaymentSheet();
      if (sheetPresent.error) {
        throw new Error(sheetPresent.error.message ?? "Payment cancelled");
      }
      const confirmation = await confirmStripePayment(intent.payment_id);
      setPaymentId(confirmation.payment_id);
      setPaymentMode("stripe_confirmed");
      Alert.alert("Payment Successful", "Your payment has been confirmed.");
      await loadPricing(selectedTemplate.slug);
    } catch (error: any) {
      console.error("Stripe payment failed", error);
      setPaymentError(error?.message || "Unable to complete card payment.");
    } finally {
      setIsPaymentLoading(false);
    }
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0:
        return form.images.length > 0;
      case 1:
        return !!selectedTemplate;
      case 2:
        return !!pricingQuote && !pricingLoading;
      default:
        return true;
    }
  };

  const isPaymentSatisfied = useMemo(() => {
    if (!pricingQuote) {
      return false;
    }
    if (pricingQuote.final_price <= 0) {
      if (pricingQuote.free_trial_slug && !pricingQuote.free_trial_consumed) {
        return paymentMode === "free_trial";
      }
      return true;
    }
    return paymentMode === "credits" || (paymentMode === "stripe_confirmed" && paymentId !== null);
  }, [pricingQuote, paymentMode, paymentId]);
  const createChildBook = async () => {
    if (!form.images.length) {
      Alert.alert("Missing Images", "Please select at least 1 image");
      return;
    }
    if (!form.title.trim()) {
      Alert.alert("Missing Title", "Please enter a book title");
      return;
    }
    if (!selectedTemplate) {
      Alert.alert("Template Required", "Please select a story template");
      return;
    }
    if (!pricingQuote) {
      Alert.alert("Pricing Required", "Pricing information is unavailable. Please try again.");
      return;
    }
    if (!isPaymentSatisfied) {
      Alert.alert("Complete Payment", "Please complete the payment step before creating your book.");
      return;
    }

    const payload: BookCreationData = {
      files: form.images,
      title: form.title.trim(),
      page_count: form.pageCount,
      story_source: "template",
      template_key: selectedTemplate.slug,
      template_params: {
        name: form.templateInput.name.trim() || undefined,
        gender: form.templateInput.gender,
      },
    };

    if (paymentId) {
      payload.paymentId = paymentId;
    }
    if (paymentMode === "free_trial") {
      payload.applyFreeTrial = true;
    }

    setIsCreating(true);

    try {
      const response = await createBook(token, payload);
      Alert.alert(
        "Book Creation Started",
        `Your book "${response.title}" is being created. This may take several minutes.`,
        [
          {
            text: "View Progress",
            onPress: () => navigation.navigate("BookStatus", { bookId: response.id }),
          },
        ]
      );
    } catch (error: any) {
      console.error("Book creation error:", error?.response?.data || error.message);
      let errorMessage = "Failed to create book. Please try again.";
      if (error.response?.status === 402) {
        errorMessage = error.response.data?.detail || "Payment verification failed.";
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data?.detail || "Invalid input. Please check your form.";
      }
      Alert.alert("Creation Failed", errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const renderTemplateCard = (template: TemplateDisplay) => {
    const isActive = template.slug === selectedTemplate?.slug;
    const quote = pricingQuote && template.slug === selectedTemplate?.slug ? pricingQuote : null;
    return (
      <TouchableOpacity
        key={template.slug}
        style={[styles.templateCard, isActive && styles.templateCardActive]}
        onPress={() => handleSelectTemplate(template)}
      >
        <Text style={styles.templateTitle}>{template.name}</Text>
        {template.description ? (
          <Text style={styles.templateDescription}>{template.description}</Text>
        ) : null}
        <Text style={styles.templateMeta}>
          Suggested Age: {template.default_age || "n/a"} - {template.page_count || 0} pages
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
      </TouchableOpacity>
    );
  };

  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Upload Character Images</Text>
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
                <TouchableOpacity style={styles.removeImageButton} onPress={() => removeImage(index)}>
                  <Text style={styles.removeImageText}>-</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          {form.images.length < 4 && (
            <TouchableOpacity style={styles.addMoreButton} onPress={pickImage}>
              <Text style={styles.addMoreText}>+ Add More Images</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
          <Text style={styles.uploadButtonText}>Select Images (1-4)</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.helpText}>
        Tip: Multiple images help AI understand your character better! Choose clear images with good lighting.
      </Text>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Story Setup</Text>

      {isLoadingTemplates ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loaderText}>Loading templates-</Text>
        </View>
      ) : null}

      {templatesError ? (
        <Text style={styles.errorTextInline}>{templatesError}</Text>
      ) : null}

      <View style={styles.templateList}>
        {templates.map((template) => renderTemplateCard(template))}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Character Name</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter a character name"
          value={form.templateInput.name}
          onChangeText={(text) => updateTemplateInput("name", text)}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Character Pronouns</Text>
        <View style={styles.optionGroup}>
          {GENDER_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionPill,
                form.templateInput.gender === option.value && styles.optionPillActive,
              ]}
              onPress={() => updateTemplateInput("gender", option.value)}
            >
              <View
                style={[
                  styles.optionRadio,
                  form.templateInput.gender === option.value && styles.optionRadioActive,
                ]}
              />
              <Text
                style={[
                  styles.optionLabel,
                  form.templateInput.gender === option.value && styles.optionLabelActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
  const renderStep2 = () => (
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
      </View>

      <View style={styles.reviewPricingCard}>
        <Text style={styles.reviewPricingHeading}>Pricing Summary</Text>
        {pricingLoading ? (
          <ActivityIndicator color={colors.primary} />
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
          </View>
        ) : (
          <Text style={styles.errorTextInline}>{pricingError || "Pricing unavailable"}</Text>
        )}
      </View>

      <TouchableOpacity style={styles.reviewBackButton} onPress={() => setCurrentStep(1)}>
        <Text style={styles.reviewBackButtonText}>- Back to Story Setup</Text>
      </TouchableOpacity>
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
        <TouchableOpacity
          key="free"
          style={[
            styles.paymentButton,
            paymentMode === "free_trial" && styles.paymentButtonActive,
          ]}
          onPress={handleUseFreeTrial}
          disabled={isPaymentLoading || !cardPaymentsSupported}
        >
          <Text style={styles.paymentButtonTitle}>Use Free Trial</Text>
          <Text style={styles.paymentButtonCaption}>
            Unlock this template for free and keep your credits.
          </Text>
        </TouchableOpacity>
      );
    }

    const creditsRequired = pricingQuote.credits_required ?? 0;
    if (creditsRequired > 0 && (pricingQuote.credits_balance ?? 0) >= creditsRequired) {
      controls.push(
        <TouchableOpacity
          key="credits"
          style={[
            styles.paymentButton,
            paymentMode === "credits" && styles.paymentButtonActive,
          ]}
          onPress={handlePayWithCredits}
          disabled={isPaymentLoading || !cardPaymentsSupported}
        >
          <Text style={styles.paymentButtonTitle}>Use Credits ({creditsRequired})</Text>
          <Text style={styles.paymentButtonCaption}>
            Balance: {pricingQuote.credits_balance ?? 0} credits remaining.
          </Text>
        </TouchableOpacity>
      );
    }

    if (pricingQuote.final_price > 0) {
      controls.push(
        <TouchableOpacity
          key="card"
          style={[
            styles.paymentButton,
            paymentMode === "stripe_confirmed" && styles.paymentButtonActive,
          ]}
          onPress={handlePayWithCard}
          disabled={isPaymentLoading || !cardPaymentsSupported}
        >
          <Text style={styles.paymentButtonTitle}>Pay with Card</Text>
          <Text style={styles.paymentButtonCaption}>
            {cardPaymentsSupported
              ? `${formatCurrency(pricingQuote.final_price, pricingQuote.currency)} charged securely via Stripe.`
              : "Card payments are unavailable in this build."}
          </Text>
        </TouchableOpacity>
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

  const renderPaymentSummary = () => {
    if (!pricingQuote) {
      return null;
    }
    return (
      <View style={styles.paymentSummaryCard}>
        <Text style={styles.paymentSummaryHeading}>Payment Status</Text>
        <View style={styles.pricingRowBetween}>
          <Text style={styles.pricingLabel}>Selected option</Text>
          <Text style={styles.pricingValue}>
            {paymentMode === "free_trial" && "Free trial"}
            {paymentMode === "credits" && "Credits"}
            {paymentMode === "stripe_confirmed" && "Card"}
            {paymentMode === "none" && "Not selected"}
          </Text>
        </View>
        {paymentId ? (
          <View style={styles.pricingRowBetween}>
            <Text style={styles.pricingLabel}>Payment ID</Text>
            <Text style={styles.pricingValue}>#{paymentId}</Text>
          </View>
        ) : null}
        {creditsBalance !== null ? (
          <View style={styles.pricingRowBetween}>
            <Text style={styles.pricingLabel}>Credits balance</Text>
            <Text style={styles.pricingValue}>{creditsBalance}</Text>
          </View>
        ) : null}
        <View style={styles.pricingRowBetween}>
          <Text style={[styles.pricingLabel, styles.pricingLabelStrong]}>Amount due</Text>
          <Text style={[styles.pricingValue, styles.pricingValueStrong]}>
            {formatCurrency(pricingQuote.final_price, pricingQuote.currency)}
          </Text>
        </View>
        {paymentError ? <Text style={styles.errorTextInline}>{paymentError}</Text> : null}
      </View>
    );
  };

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Payment</Text>
      <Text style={styles.stepDescription}>
        Complete payment to start generating your personalized children-s book.
      </Text>

      {pricingLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : pricingQuote ? (
        <View style={styles.paymentInfoCard}>
          <View style={styles.pricingRowBetween}>
            <Text style={styles.pricingLabel}>Base price</Text>
            <Text style={styles.pricingValue}>{formatCurrency(pricingQuote.base_price, pricingQuote.currency)}</Text>
          </View>
          {pricingQuote.discount_price !== null && pricingQuote.discount_price < pricingQuote.base_price ? (
            <View style={styles.pricingRowBetween}>
              <Text style={styles.pricingLabel}>Discount</Text>
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
            <Text style={[styles.pricingLabel, styles.pricingLabelStrong]}>Total</Text>
            <Text style={[styles.pricingValue, styles.pricingValueStrong]}>
              {formatCurrency(pricingQuote.final_price, pricingQuote.currency)}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.errorTextInline}>{pricingError || "Pricing unavailable."}</Text>
      )}

      <View style={styles.paymentOptionsContainer}>{renderPaymentActions()}</View>

      {renderPaymentSummary()}

      <TouchableOpacity style={styles.reviewBackButton} onPress={() => setCurrentStep(2)}>
        <Text style={styles.reviewBackButtonText}>- Back to Review</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.createButton, (!isPaymentSatisfied || isCreating) && styles.createButtonDisabled]}
        onPress={createChildBook}
        disabled={!isPaymentSatisfied || isCreating}
      >
        {isCreating ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.createButtonText}>Create My Book</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderStep0();
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return renderStep0();
    }
  };

  const goToNextStep = () => {
    if (currentStep < steps.length - 1 && canProceedToNext()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };
  return (
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
                {index < currentStep ? "?" : index + 1}
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

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => navigation.navigate("BookLibrary")}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>

      <View style={styles.navigation}>
        {currentStep > 0 && currentStep < steps.length - 1 && (
          <TouchableOpacity style={styles.navButton} onPress={goToPrevStep}>
            <Text style={styles.navButtonText}>- Back</Text>
          </TouchableOpacity>
        )}

        {currentStep < steps.length - 1 && (
          <TouchableOpacity
            style={[
              styles.navButton,
              styles.navButtonPrimary,
              !canProceedToNext() && styles.navButtonDisabled,
            ]}
            onPress={goToNextStep}
            disabled={!canProceedToNext()}
          >
            <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>
              {currentStep === steps.length - 2 ? "Continue" : "Next -"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing(6),
    paddingTop: spacing(14),
    paddingBottom: spacing(6),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
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
    paddingVertical: spacing(5),
    paddingHorizontal: spacing(5),
    backgroundColor: colors.surface,
    marginBottom: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
  },
  stepContainer: {
    alignItems: "center",
    flex: 1,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.neutral200,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing(1.5),
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
  },
  stepCircleCompleted: {
    backgroundColor: colors.success,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  stepNumberActive: {
    color: colors.surface,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
  },
  stepLabelActive: {
    color: colors.primaryDark,
  },
  stepContent: {
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(8),
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
  uploadButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radii.lg,
    alignItems: "center",
    ...shadow.subtle,
  },
  uploadButtonText: {
    color: colors.surface,
    fontSize: 16,
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
  addMoreButton: {
    backgroundColor: colors.primarySoft,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(4),
    borderRadius: radii.md,
    alignSelf: "flex-start",
  },
  addMoreText: {
    color: colors.primaryDark,
    fontWeight: "600",
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
    borderColor: colors.neutral200,
    borderRadius: radii.md,
    padding: spacing(3),
    backgroundColor: colors.surface,
    fontSize: 15,
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
    borderColor: colors.neutral200,
    borderRadius: radii.pill,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
    backgroundColor: colors.surface,
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
    borderColor: "#93c5fd",
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
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.surface,
    marginBottom: spacing(3),
    ...shadow.card,
  },
  templateCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
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
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing(4),
    marginBottom: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    ...shadow.subtle,
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
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#c7d2fe",
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
  reviewBackButton: {
    marginBottom: spacing(4),
    paddingVertical: spacing(3),
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  reviewBackButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  reviewPricingCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    marginBottom: spacing(4),
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
  paymentInfoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    marginBottom: spacing(4),
  },
  paymentOptionsContainer: {
    gap: spacing(3),
    marginBottom: spacing(4),
  },
  paymentButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.neutral200,
    borderRadius: radii.lg,
    padding: spacing(4),
    ...shadow.subtle,
  },
  paymentButtonActive: {
    borderColor: colors.success,
    backgroundColor: "#ecfdf3",
  },
  paymentButtonTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing(1),
  },
  paymentButtonCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  paymentSummaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    marginBottom: spacing(4),
  },
  paymentSummaryHeading: {
    ...typography.headingM,
    marginBottom: spacing(2),
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
  cancelButton: {
    marginHorizontal: spacing(6),
    marginBottom: spacing(4),
    paddingVertical: spacing(3),
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.neutral100,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(8),
  },
  navButton: {
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(5),
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.surface,
  },
  navButtonPrimary: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  navButtonTextPrimary: {
    color: colors.surface,
  },
});



















