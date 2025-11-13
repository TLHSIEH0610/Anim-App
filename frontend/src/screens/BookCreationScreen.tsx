import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  TextInput as PaperTextInput,
  SegmentedButtons,
  TouchableRipple,
  IconButton,
  ActivityIndicator as PaperActivityIndicator,
  Snackbar,
  Portal,
  Dialog,
  RadioButton,
  Checkbox,
} from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import {
  CardField,
  useStripe,
  isStripeAvailable,
  PlatformPay,
} from "../lib/stripe";
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
  createFreeTrialSetupIntent,
  completeFreeTrialVerification,
  PricingQuote,
  PaymentResult,
  StripeIntentResponse,
} from "../api/billing";
import { useAuth } from "../context/AuthContext";
import { colors, radii, shadow, spacing, typography } from "../styles/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/types";
import ScreenWrapper from "../components/ScreenWrapper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import { captureException } from "../lib/capture";

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

const steps = ["Create Your Story", "Review", "Payment"];

const GENDER_OPTIONS: Array<{ value: "male" | "female"; label: string }> = [
  { value: "female", label: "Girl" },
  { value: "male", label: "Boy" },
];

type PaymentMode = "none" | "free_trial" | "credits" | "stripe_confirmed";

const buildAutoTitle = (
  storyLabel: string | undefined,
  characterName: string | undefined
) => {
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
  return Number.isInteger(numeric)
    ? numeric.toString()
    : numeric.toFixed(2).replace(/\.?0+$/, "");
};

type CardDetailsChange = {
  complete?: boolean;
};

const formatCurrency = (
  amount: number | null | undefined,
  currency: string | undefined
) => {
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

const injectCharacterName = (
  text: string | null | undefined,
  rawName: string
) => {
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
type BookCreationScreenProps = NativeStackScreenProps<
  AppStackParamList,
  "BookCreation"
>;

export default function BookCreationScreen({
  navigation,
  route,
}: BookCreationScreenProps) {
  const MERCHANT_COUNTRY = (
    process.env.EXPO_PUBLIC_STRIPE_MERCHANT_COUNTRY || "US"
  ).toUpperCase();
  const MERCHANT_DISPLAY_NAME =
    process.env.EXPO_PUBLIC_STRIPE_MERCHANT_NAME?.trim() || "Kid to Story";
  const GPAY_TEST_ENV =
    (
      process.env.EXPO_PUBLIC_STRIPE_GPAY_TEST_ENV?.trim() ??
      (__DEV__ ? "true" : "false")
    ).toLowerCase() === "true";
  const { token } = useAuth();
  const stripe = useStripe();
  const cardPaymentsSupported =
    isStripeAvailable &&
    !!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();

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
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: "" });
  const [creationDialog, setCreationDialog] = useState<{
    visible: boolean;
    bookId: number | null;
  }>({ visible: false, bookId: null });

  const [pricingQuote, setPricingQuote] = useState<PricingQuote | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const [paymentMode, setPaymentMode] = useState<PaymentMode>("none");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    "free_trial" | "credits" | "card" | "google_pay" | null
  >(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [cardDetailsComplete, setCardDetailsComplete] = useState(false);
  const [cardFieldError, setCardFieldError] = useState<string | null>(null);
  const [googlePaySupported, setGooglePaySupported] = useState<boolean>(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [autoTitle, setAutoTitle] = useState<string>("");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const insets = useSafeAreaInsets();
  const [faceCheckAvailable, setFaceCheckAvailable] = useState<boolean>(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [guardianAttested, setGuardianAttested] = useState(false);

  useEffect(() => {
    const onShow = (e: any) =>
      setKeyboardHeight(e?.endCoordinates?.height || 0);
    const onHide = () => setKeyboardHeight(0);
    const subShow = Keyboard.addListener("keyboardDidShow", onShow);
    const subHide = Keyboard.addListener("keyboardDidHide", onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  // When entering the Payment step with Card selected, clear card completion state
  useEffect(() => {
    if (currentStep === 2 && selectedPaymentMethod === "card") {
      setCardDetailsComplete(false);
      setCardFieldError(null);
    }
  }, [currentStep, selectedPaymentMethod]);

  // Upload constraints
  const MAX_FILES = 3;
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  const MAX_LONGEST_EDGE = 2048; // px
  // Removed minimum shortest-edge restriction to allow small images
  const MIN_SHORTEST_EDGE = 0; // px (no minimum)

  const processAssetWithinLimits = async (
    asset: ImagePicker.ImagePickerAsset
  ): Promise<string> => {
    try {
      const width = asset.width ?? 0;
      const height = asset.height ?? 0;
      // No minimum-size rejection; accept small images as-is

      let uri = asset.uri;
      let size = asset.fileSize;
      if (!size) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          size = info.size ?? undefined;
        } catch {}
      }

      const longest = Math.max(width || 0, height || 0);
      if (longest > MAX_LONGEST_EDGE || (size && size > MAX_FILE_SIZE_BYTES)) {
        // Try to downscale via expo-image-manipulator if available
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const ImageManipulator: any = require("expo-image-manipulator");
          const target =
            width >= height
              ? { width: MAX_LONGEST_EDGE }
              : { height: MAX_LONGEST_EDGE };
          const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: target }],
            {
              compress: 0.85,
              format:
                ImageManipulator.SaveFormat?.JPEG ??
                ImageManipulator.SaveFormat?.jpeg ??
                "jpeg",
            }
          );
          uri = result.uri;
          try {
            const info2 = await FileSystem.getInfoAsync(uri);
            size = info2.size ?? size;
          } catch {}
        } catch (e) {
          throw new Error(
            "Image is too large and could not be resized. Please choose an image under 2048px on the longest edge and under 10MB."
          );
        }
      }

      if (size && size > MAX_FILE_SIZE_BYTES) {
        const name = asset.fileName || "Selected image";
        throw new Error(
          `${name} exceeds ${Math.round(
            MAX_FILE_SIZE_BYTES / (1024 * 1024)
          )}MB after resizing. Please choose a smaller image.`
        );
      }

      return uri;
    } catch (err: any) {
      throw err;
    }
  };

  // Detect Google Pay support on Android when Stripe is available
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (Platform.OS !== "android" || !cardPaymentsSupported) {
          if (mounted) setGooglePaySupported(false);
          return;
        }
        let supported = false;
        if (PlatformPay?.isGooglePaySupported) {
          supported = !!(await PlatformPay.isGooglePaySupported({
            testEnv: GPAY_TEST_ENV,
          }));
        } else if ((stripe as any)?.isPlatformPaySupported) {
          supported = !!(await (stripe as any).isPlatformPaySupported({
            googlePay: true,
          }));
        }
        if (mounted) setGooglePaySupported(Boolean(supported));
      } catch {
        if (mounted) setGooglePaySupported(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [stripe, cardPaymentsSupported]);

  // Best-effort face detection using expo-face-detector (if present in this build)
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FD = require("expo-face-detector");
      if (FD && typeof FD.detectFacesAsync === "function") {
        setFaceCheckAvailable(true);
      }
    } catch (_) {
      setFaceCheckAvailable(false);
    }
  }, []);

  const detectFacesOnUri = async (uri: string): Promise<number | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FaceDetector: any = require("expo-face-detector");
      if (
        !FaceDetector ||
        typeof FaceDetector.detectFacesAsync !== "function"
      ) {
        return null; // Module not available
      }
      const options = {
        mode: FaceDetector.FaceDetectorMode?.fast ?? 1,
        detectLandmarks: FaceDetector.FaceDetectorLandmarks?.none ?? 0,
        runClassifications: FaceDetector.FaceDetectorClassifications?.none ?? 0,
      };
      const result = await FaceDetector.detectFacesAsync(uri, options);
      const faces = Array.isArray(result?.faces)
        ? result.faces.length
        : Array.isArray(result)
        ? result.length
        : 0;
      return faces;
    } catch (_) {
      return null; // On any error, don't block flow
    }
  };

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
    // const text =
    // selectedTemplate.storyText?.trim() ||
    // selectedTemplate.description?.trim()
    // selectedTemplate.storylinePages?.[0]?.imagePrompt?.trim();
    // return injectCharacterName(text, form.templateInput.name);
    return selectedTemplate.description?.trim();
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
        setPricingError(
          "Unable to fetch pricing. Pull to refresh or try again."
        );
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
          const chosen = mapped.find((t) => t.slug === initialSlug) || first;
          const templateKey = chosen?.slug ?? null;
          const generatedTitle = buildAutoTitle(
            first?.name,
            prev.templateInput.name
          );
          setAutoTitle(generatedTitle);
          setTitleManuallyEdited(false);
          return {
            ...prev,
            templateKey,
            pageCount: first?.page_count ?? prev.pageCount,
            title: generatedTitle,
          };
        });
        const priceSlug =
          route?.params?.templateSlug || mapped[0]?.slug || null;
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
    const generated = buildAutoTitle(
      selectedTemplate?.name,
      form.templateInput.name
    );
    setAutoTitle(generated);
    if (!titleManuallyEdited) {
      setForm((prev) =>
        prev.title === generated ? prev : { ...prev, title: generated }
      );
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
    const creditsAvailable =
      requiredForSelection > 0 && balanceForSelection >= requiredForSelection;
    const cardAvailable =
      cardPaymentsSupported &&
      pricingQuote.final_price > 0 &&
      pricingQuote.card_available !== false;
    const gpayAvailable =
      Platform.OS === "android" &&
      cardPaymentsSupported &&
      googlePaySupported &&
      pricingQuote.final_price > 0;

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
      if (prev === "google_pay" && gpayAvailable) {
        return prev;
      }
      // Intentionally avoid auto-selecting free trial to ensure
      // the user explicitly triggers verification.
      if (creditsAvailable) {
        return "credits";
      }
      if (gpayAvailable) {
        return "google_pay";
      }
      if (cardAvailable) {
        return "card";
      }
      return null;
    });
  }, [pricingQuote, cardPaymentsSupported, googlePaySupported]);

  const updateForm = <K extends keyof BookForm>(
    field: K,
    value: BookForm[K]
  ) => {
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
      // Clear any previous image-specific error when user starts a new selection
      setImageError(null);

      const availableSlots = Math.max(0, MAX_FILES - form.images.length);
      if (availableSlots <= 0) {
        setSnackbar({
          visible: true,
          message: `You can select up to ${MAX_FILES} images maximum`,
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: false,
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: availableSlots,
      });

      if (!result.canceled) {
        let selectedAssets = result.assets;
        if (selectedAssets.length > availableSlots) {
          setSnackbar({
            visible: true,
            message: `You can add up to ${availableSlots} more image${
              availableSlots > 1 ? "s" : ""
            }`,
          });
          selectedAssets = selectedAssets.slice(0, availableSlots);
        }

        // Enforce pixel/size limits with auto downscale when possible, then face-check (if available)
        const accepted: string[] = [];
        let droppedNoFace = 0;
        for (const asset of selectedAssets) {
          try {
            const finalUri = await processAssetWithinLimits(asset);
            const faces = await detectFacesOnUri(finalUri);
            if (faces === 0) {
              droppedNoFace += 1;
              continue; // skip this image
            }
            accepted.push(finalUri);
          } catch (e: any) {
            setImageError(
              e?.message || "Selected image did not meet requirements."
            );
            setSnackbar({
              visible: true,
              message:
                e?.message || "Selected image did not meet requirements.",
            });
            return; // abort all on first error for clarity
          }
        }

        if (accepted.length === 0) {
          const msg = faceCheckAvailable
            ? "No face detected in the selected image(s). Please choose a clear, front-facing photo."
            : "Selected image(s) did not meet requirements. Please choose a clear, front-facing photo.";
          setImageError(msg);
          setSnackbar({ visible: true, message: msg });
          return;
        }

        if (droppedNoFace > 0 && faceCheckAvailable) {
          setSnackbar({
            visible: true,
            message: `Skipped ${droppedNoFace} image${
              droppedNoFace > 1 ? "s" : ""
            } with no visible face.`,
          });
        }

        const merged = [...form.images, ...accepted];
        updateImages(merged);
      }
    } catch (error) {
      setSnackbar({ visible: true, message: "Failed to pick images" });
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

  const handleUseFreeTrial = async (): Promise<boolean> => {
      if (
        !pricingQuote ||
        !pricingQuote.free_trial_slug ||
        pricingQuote.free_trial_consumed
      ) {
        return;
      }
      try {
        if (!cardPaymentsSupported) {
          throw new Error("Card verification is unavailable in this build.");
        }
        setIsPaymentLoading(true);
        setPaymentError(null);
        // 1) Ask backend for a SetupIntent to perform $0 card verification
        let setup;
        try {
          setup = await createFreeTrialSetupIntent(
            selectedTemplate?.slug || pricingQuote?.free_trial_slug || undefined
          );
        } catch (e: any) {
          captureException(e, { stage: "free_trial_setup_intent" });
          throw new Error(
            e?.response?.data?.detail || "Unable to start the $0 verification."
          );
        }
        // 2) Initialize PaymentSheet with SetupIntent
        try {
          const init = await (stripe as any).initPaymentSheet?.({
            merchantDisplayName: MERCHANT_DISPLAY_NAME,
            setupIntentClientSecret: setup.client_secret,
          });
          if (init?.error) {
            throw new Error(
              init.error.message || "Unable to initialize verification."
            );
          }
        } catch (e: any) {
          captureException(e, { stage: "free_trial_sheet_init" });
          throw e;
        }
        // 3) Present PaymentSheet to collect card for $0 verify
        try {
          const present = await (stripe as any).presentPaymentSheet?.();
          if (present?.error) {
            throw new Error(
              present.error.message || "Verification was cancelled or failed."
            );
          }
        } catch (e: any) {
          captureException(e, { stage: "free_trial_sheet_present" });
          throw e;
        }
        // 4) Notify backend to finalize (detach PM, mark verified)
        try {
          await completeFreeTrialVerification();
        } catch (e: any) {
          captureException(e, { stage: "free_trial_finalize" });
          throw new Error(
            e?.response?.data?.detail ||
              "Verification completed but we could not finalize it. Please try again."
          );
        }
        // 5) Mark selection as free_trial
        setSelectedPaymentMethod("free_trial");
        setPaymentMode("free_trial");
        setPaymentId(null);
        setCardDetailsComplete(false);
        setCardFieldError(null);
        return true;
      } catch (e: any) {
        const msg = e?.message || "Unable to complete $0 verification.";
        setPaymentError(msg);
        setSelectedPaymentMethod(null);
        captureException(e, { flow: "free_trial" });
        return false;
      } finally {
        setIsPaymentLoading(false);
      }
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
      setPaymentError(
        "Card payments are currently disabled. Please choose another option."
      );
      return;
    }
    setSelectedPaymentMethod("card");
    setPaymentMode("none");
    setPaymentId(null);
    setPaymentError(null);
    setCardDetailsComplete(false);
    setCardFieldError(null);
  };

  const handlePayWithGooglePay = () => {
    if (!pricingQuote || pricingQuote.final_price <= 0) {
      return;
    }
    if (!cardPaymentsSupported) {
      setPaymentError("Google Pay is unavailable in this build.");
      return;
    }
    if (!googlePaySupported) {
      setPaymentError("Google Pay is not supported on this device.");
      return;
    }
    setSelectedPaymentMethod("google_pay");
    setPaymentMode("none");
    setPaymentId(null);
    setPaymentError(null);
    setCardDetailsComplete(false);
    setCardFieldError(null);
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0:
        return (
          form.images.length > 0 &&
          !!selectedTemplate &&
          !!form.templateInput.name.trim() &&
          guardianAttested
        );
      case 1:
        return !!form.title.trim();
      case 2:
        if (!pricingQuote || pricingLoading) {
          return false;
        }
        if (
          pricingQuote.final_price <= 0 &&
          (!pricingQuote.free_trial_slug || pricingQuote.free_trial_consumed)
        ) {
          return true;
        }
        return selectedPaymentMethod !== null;
      default:
        return true;
    }
  };

  const ensureFormReady = (): {
    template: TemplateDisplay;
    quote: PricingQuote;
  } | null => {
    if (!form.images.length) {
      setImageError("Upload at least one character image to continue.");
      setSnackbar({ visible: true, message: "Please select at least 1 image" });
      return null;
    }
    if (!form.title.trim()) {
      setSnackbar({ visible: true, message: "Please enter a book title" });
      return null;
    }
    if (!form.templateInput.name.trim()) {
      setNameError("Character name is required.");
      setSnackbar({
        visible: true,
        message: "Please provide a character name",
      });
      return null;
    }
    if (!selectedTemplate) {
      setSnackbar({ visible: true, message: "Please select a story template" });
      return null;
    }
    if (!pricingQuote) {
      setSnackbar({
        visible: true,
        message: "Pricing information is unavailable. Please try again.",
      });
      return null;
    }
    return { template: selectedTemplate, quote: pricingQuote };
  };

  const createChildBook = async (overrides?: {
    paymentModeOverride?: PaymentMode;
    paymentIdOverride?: number | null;
  }) => {
    const effectivePaymentMode = overrides?.paymentModeOverride ?? paymentMode;
    const effectivePaymentId =
      overrides &&
      Object.prototype.hasOwnProperty.call(overrides, "paymentIdOverride")
        ? overrides.paymentIdOverride ?? null
        : paymentId;

    const preflight = ensureFormReady();
    if (!preflight) {
      setSnackbar({
        visible: true,
        message: "Please complete required fields before continuing.",
      });
      return;
    }
    const { template, quote } = preflight;

    if (!token) {
      setSnackbar({
        visible: true,
        message: "Please sign in again to create your book.",
      });
      return;
    }

    if (!isPaymentComplete(effectivePaymentMode, effectivePaymentId, quote)) {
      setSnackbar({
        visible: true,
        message: "Please complete the payment step before creating your book.",
      });
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
      console.error(
        "Book creation error:",
        error?.response?.data || error.message
      );
      let errorMessage = "Failed to create book. Please try again.";
      if (error.response?.status === 402) {
        errorMessage =
          error.response.data?.detail || "Payment verification failed.";
      } else if (error.response?.status === 400) {
        errorMessage =
          error.response.data?.detail ||
          "Invalid input. Please check your form.";
      }
      setSnackbar({ visible: true, message: errorMessage });
    } finally {
      setIsCreating(false);
    }
  };

  const renderTemplateCard = (template: TemplateDisplay) => {
    const isActive = template.slug === selectedTemplate?.slug;
    const quote =
      pricingQuote && template.slug === selectedTemplate?.slug
        ? pricingQuote
        : null;
    return (
      <TouchableRipple
        key={template.slug}
        style={[styles.templateCard, isActive && styles.templateCardActive]}
        onPress={() => handleSelectTemplate(template)}
      >
        <View>
          <Text style={styles.templateTitle}>{template.name}</Text>
          {template.description ? (
            <Text style={styles.templateDescription}>
              {template.description}
            </Text>
          ) : null}
          <Text style={styles.templateMeta}>
            Suggested Age: {template.age || "n/a"} - {template.page_count || 0}{" "}
            pages
          </Text>
          {quote ? (
            <View style={styles.pricingRow}>
              <Text style={styles.priceValue}>
                {formatCurrency(quote.final_price, quote.currency)}
              </Text>
              {quote.promotion_label ? (
                <View style={styles.promotionBadge}>
                  <Text style={styles.promotionText}>
                    {quote.promotion_label.toUpperCase()}
                  </Text>
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
          throw new Error(
            "Free trial is no longer available for this template."
          );
        }
        // Ensure verification is completed before proceeding. If not yet
        // verified in this session, trigger the $0 verification now.
        if (paymentMode !== "free_trial") {
          const ok = await handleUseFreeTrial();
          if (!ok) {
            // Verification failed or cancelled
            throw new Error("Please complete card verification to use a free trial.");
          }
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

        const intent: StripeIntentResponse = await createStripeIntent(
          template.slug
        );
        const { error: stripeError } = await stripe.confirmPayment(
          intent.client_secret,
          {
            paymentMethodType: "Card",
            paymentMethodData: {
              billingDetails: {
                name: form.templateInput.name?.trim() || undefined,
              },
            },
          }
        );

        if (stripeError) {
          throw new Error(
            stripeError.message ?? "Unable to confirm card payment."
          );
        }

        const confirmation = await confirmStripePayment(intent.payment_id);
        nextMode = "stripe_confirmed";
        nextPaymentId = confirmation.payment_id;
      } else if (selectedPaymentMethod === "google_pay") {
        if (!cardPaymentsSupported) {
          throw new Error("Google Pay is unavailable in this build.");
        }
        if (!googlePaySupported) {
          throw new Error("Google Pay is not supported on this device.");
        }

        const intent: StripeIntentResponse = await createStripeIntent(
          template.slug
        );

        // Initialize PaymentSheet with Google Pay enabled
        const init = await (stripe as any).initPaymentSheet?.({
          merchantDisplayName: MERCHANT_DISPLAY_NAME,
          paymentIntentClientSecret: intent.client_secret,
          googlePay: {
            merchantCountryCode: MERCHANT_COUNTRY,
            testEnv: GPAY_TEST_ENV,
          },
        });
        if (init?.error) {
          throw new Error(
            init.error.message || "Unable to initialize Google Pay."
          );
        }
        const present = await (stripe as any).presentPaymentSheet?.();
        if (present?.error) {
          throw new Error(
            present.error.message || "Google Pay was cancelled or failed."
          );
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
      console.error(
        "Payment confirmation failed",
        error?.response?.data || error
      );
      const message =
        error?.response?.data?.detail ||
        error?.message ||
        "Unable to complete payment.";
      setPaymentError(message);
      captureException(error, {
        flow: "confirm_payment_and_create",
        method: selectedPaymentMethod,
      });
      const detail: string | undefined = error?.response?.data?.detail;
      if (
        detail &&
        detail.toLowerCase().includes("stripe secret key not configured")
      ) {
        setPricingQuote((prev) =>
          prev ? { ...prev, card_available: false } : prev
        );
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
        <Text style={styles.stepTitle}>Create Your Hero</Text>
        <View style={styles.heroCard}>
          <Text style={styles.stepDescription}>
            Select 1-3 images of your kid for better consistency throughout the
            book.
          </Text>

          {/* Guardian attestation moved to bottom of the form */}

          <View style={styles.imageCountBadge}>
            <Text style={styles.imageCountText}>
              {form.images.length}/3 images selected
            </Text>
          </View>

          {form.images.length ? (
            <View>
              <View style={styles.imageGallery}>
                {form.images.map((uri, index) => (
                  <View key={index} style={styles.imageWrapper}>
                    <Image source={{ uri }} style={styles.galleryImage} />
                    <IconButton
                      icon="close"
                      size={18}
                      style={styles.removeImageButton}
                      onPress={() => removeImage(index)}
                    />
                  </View>
                ))}
              </View>
              {form.images.length < 3 && (
                <Button
                  title="+ Add More Images"
                  onPress={pickImage}
                  variant="secondary"
                />
              )}
            </View>
          ) : (
            <Button
              title="Select Images (1-3)"
              onPress={pickImage}
              variant="primary"
            />
          )}

          {imageError ? (
            <Text style={styles.errorTextInline}>{imageError}</Text>
          ) : null}

          <Text style={styles.helpText}>
            Tip: Multiple images help us understand your hero better! Choose
            clear photos with good lighting.{" "}
            <Text style={{ color: colors.primary }}>
              Please use single-person photos only.
            </Text>
          </Text>
          <Text style={[styles.noteText, { marginTop: spacing(1) }]}>
            Photos are used only to create your book; you can delete them
            anytime.
          </Text>
        </View>
        {/* Moved photo usage note to bottom below the checkbox */}

        <View style={styles.sectionDivider} />

        <View style={styles.stepTitleRow}>
          <Text style={styles.stepTitle}>Hero's Info</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Character Name *</Text>
            <PaperTextInput
              mode="outlined"
              style={styles.textInput}
              outlineStyle={{ borderRadius: radii.md }}
              outlineColor={"rgba(37, 99, 235, 0.25)"}
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
            {nameError ? (
              <Text style={styles.errorTextInline}>{nameError}</Text>
            ) : null}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Character Pronouns</Text>
            <SegmentedButtons
              value={form.templateInput.gender}
              onValueChange={(val: string) =>
                updateTemplateInput("gender", val)
              }
              density="small"
              style={styles.segmented}
              buttons={GENDER_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
            />
          </View>
        </View>
        {/* Guardian attestation moved to bottom */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: spacing(3),
          }}
        >
          <Checkbox
            status={guardianAttested ? "checked" : "unchecked"}
            onPress={() => setGuardianAttested((v) => !v)}
          />
          <Text style={{ ...typography.body, flex: 1 }}>
            I am a parent/guardian and 13+ and I have permission to upload
            photos of the child for the purpose of creating this book.
          </Text>
        </View>
      </View>
    );
  };
  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Review Your Story</Text>

      {form.images.length > 0 && (
        <View style={styles.reviewImageGallery}>
          {form.images.map((uri, index) => (
            <Image key={index} source={{ uri }} style={styles.reviewImage} />
          ))}
        </View>
      )}

      <View style={styles.reviewDetails}>
        <Text style={styles.reviewTitle}>"{form.title}"</Text>
        <Text style={styles.reviewDetail}>Page Number: {form.pageCount}</Text>
        <Text style={styles.reviewDetail}>
          Images: {form.images.length} reference image(s)
        </Text>
        {form.templateInput.name.trim() ? (
          <Text style={styles.reviewDetail}>
            {(() => {
              const raw = (form.templateInput.gender || "")
                .trim()
                .toLowerCase();
              const genderLabel =
                raw === "male" ? "boy" : raw === "female" ? "girl" : "child";
              return (
                <>
                  Lead Character: {form.templateInput.name.trim()},{" "}
                  {genderLabel}
                </>
              );
            })()}
          </Text>
        ) : null}
        {storylinePreview ? (
          <View style={styles.reviewStorylineWrapper}>
            <Text style={styles.reviewStorylineHeading}>Plot</Text>
            <Text style={styles.reviewStoryline}>{storylinePreview}</Text>
          </View>
        ) : null}
        {/* {storylinePagesDetailed.length > 0 ? (
          <View
            style={[
              styles.reviewStorylineWrapper,
              styles.storylinePagesContainer,
            ]}
          >
            <Text style={styles.reviewStorylineHeading}>Full Storyline</Text>
            {storylinePagesDetailed.map((page) => (
              <View key={page.pageNumber} style={styles.storylinePageRow}>
                <Text style={styles.storylinePageNumber}>
                  Page {page.pageNumber}
                </Text>
                <Text style={styles.storylinePageText}>{page.text}</Text>
              </View>
            ))}
          </View>
        ) : null} */}
      </View>

      <View style={styles.reviewPricingCard}>
        <Text style={styles.reviewPricingHeading}>Pricing & Payment</Text>
        {pricingLoading ? (
          <PaperActivityIndicator />
        ) : pricingQuote ? (
          <View>
            <View style={styles.pricingRowBetween}>
              <Text style={styles.pricingLabel}>Available credits</Text>
              <Text style={styles.pricingValue}>
                {formatCredits(pricingQuote.credits_balance ?? 0)}
              </Text>
            </View>
            <View style={styles.pricingRowBetween}>
              <Text style={styles.pricingLabel}>Base price</Text>
              <Text style={styles.pricingValue}>
                {formatCurrency(pricingQuote.base_price, pricingQuote.currency)}
              </Text>
            </View>
            {pricingQuote.discount_price !== null &&
            pricingQuote.discount_price < pricingQuote.base_price ? (
              <View style={styles.pricingRowBetween}>
                <Text style={styles.pricingLabel}>Discounted price</Text>
                <Text style={styles.pricingValue}>
                  {formatCurrency(
                    pricingQuote.discount_price,
                    pricingQuote.currency
                  )}
                </Text>
              </View>
            ) : null}
            {pricingQuote.free_trial_slug ? (
              <View style={styles.pricingRowBetween}>
                <Text style={styles.pricingLabel}>Free trial</Text>
                <Text style={styles.pricingValue}>
                  {pricingQuote.free_trial_consumed
                    ? "Not Available"
                    : "Available"}
                </Text>
              </View>
            ) : null}
            <View style={styles.pricingRowBetween}>
              <Text style={[styles.pricingLabel, styles.pricingLabelStrong]}>
                Total due
              </Text>
              <Text style={[styles.pricingValue, styles.pricingValueStrong]}>
                {formatCurrency(
                  pricingQuote.final_price,
                  pricingQuote.currency
                )}
              </Text>
            </View>
            {renderReviewPaymentDetails()}
          </View>
        ) : (
          <Text style={styles.errorTextInline}>
            {pricingError || "Pricing unavailable"}
          </Text>
        )}
      </View>

      <View style={styles.paymentOptionsContainer}>
        {renderPaymentOptionsRadios()}
      </View>
    </View>
  );

  const renderPaymentOptionsRadios = () => {
    if (!pricingQuote) {
      return (
        <Text style={styles.errorTextInline}>
          Pricing not loaded. Please go back and retry.
        </Text>
      );
    }

    const freeTrialAvailable = Boolean(
      pricingQuote.free_trial_slug && !pricingQuote.free_trial_consumed
    );
    const creditsRequired = pricingQuote.credits_required ?? 0;
    const creditsBalanceValue = pricingQuote.credits_balance ?? 0;
    const creditsDisabled = !(
      creditsRequired > 0 && creditsBalanceValue >= creditsRequired
    );
    const cardAvailable =
      cardPaymentsSupported &&
      pricingQuote.card_available !== false &&
      pricingQuote.final_price > 0;
    const cardDisabled = !cardAvailable;
    const gpayAvailable =
      Platform.OS === "android" &&
      cardPaymentsSupported &&
      googlePaySupported &&
      pricingQuote.final_price > 0;

    const onChange = (val: string) => {
      if (val === "free_trial") return handleUseFreeTrial();
      if (val === "credits") return handlePayWithCredits();
      if (val === "card") return handlePayWithCard();
      if (val === "google_pay") return handlePayWithGooglePay();
    };

    const radioValue = selectedPaymentMethod ?? "";

    const items: React.ReactNode[] = [];
    if (freeTrialAvailable) {
      items.push(
        <RadioButton.Item
          key="free_trial"
          value="free_trial"
          label="Free Trial — require card verification"
          disabled={isPaymentLoading}
          position="leading"
          mode="android"
        />
      );
      items.push(
        <Text key="free_trial_note" style={styles.helperText}>
          No charge. We don’t store your card. This is just a quick verification
          to keep trials fair.
        </Text>
      );
    }

    // Always show Credits when a positive credit amount is required; disable if balance insufficient
    if (creditsRequired > 0) {
      const creditsLabel = `Use Credits (${formatCredits(creditsRequired)})`;
      items.push(
        <RadioButton.Item
          key="credits"
          value="credits"
          label={creditsLabel}
          disabled={isPaymentLoading || creditsDisabled}
          position="leading"
          mode="android"
        />
      );
    }

    if (gpayAvailable) {
      items.push(
        <RadioButton.Item
          key="google_pay"
          value="google_pay"
          label="Google Pay"
          disabled={isPaymentLoading}
          position="leading"
          mode="android"
        />
      );
    }

    if (pricingQuote.final_price > 0) {
      items.push(
        <RadioButton.Item
          key="card"
          value="card"
          label="Pay with Card"
          disabled={isPaymentLoading || cardDisabled}
          position="leading"
          mode="android"
        />
      );
      if (
        cardDisabled &&
        cardPaymentsSupported &&
        pricingQuote.card_available === false
      ) {
        items.push(
          <Text key="card-disabled-note" style={styles.helperText}>
            Card payments are currently unavailable.
          </Text>
        );
      }
    }

    if (items.length === 0) {
      return (
        <Text style={styles.helperText}>
          No payment required for this selection.
        </Text>
      );
    }

    return (
      <View style={styles.heroCard}>
        <RadioButton.Group onValueChange={onChange} value={radioValue}>
          {items}
        </RadioButton.Group>
      </View>
    );
  };

  const renderReviewPaymentDetails = () => {
    if (!pricingQuote) {
      return null;
    }
    const creditsRequired = pricingQuote.credits_required ?? 0;
    const creditsBalanceValue = pricingQuote.credits_balance ?? 0;
    const selectionLabel = (() => {
      if (selectedPaymentMethod === "free_trial") {
        return "Free Trial — verified";
      }
      if (selectedPaymentMethod === "credits") {
        return creditsRequired > 0
          ? `Credits (${formatCredits(creditsRequired)})`
          : "Credits";
      }
      if (selectedPaymentMethod === "card") {
        return "Card";
      }
      if (selectedPaymentMethod === "google_pay") {
        return "Google Pay";
      }
      return pricingQuote.final_price > 0
        ? "Not selected"
        : "No payment needed";
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
              <Text style={styles.pricingValue}>
                {formatCredits(creditsRequired)}
              </Text>
            </View>
            <View style={styles.pricingRowBetween}>
              <Text style={styles.pricingLabel}>Current balance</Text>
              <Text style={styles.pricingValue}>
                {formatCredits(creditsBalanceValue)}
              </Text>
            </View>
          </>
        ) : null}
        {selectedPaymentMethod === "card" &&
        pricingQuote.card_available === false ? (
          <Text style={styles.helperText}>
            Card payments are currently disabled. Please choose credits or a
            free trial.
          </Text>
        ) : null}
        {selectedPaymentMethod === "card" &&
        pricingQuote.card_available !== false &&
        pricingQuote.final_price > 0 ? (
          <Text style={styles.helperText}>
            Enter your card details in the next step to complete payment.
          </Text>
        ) : null}
        {selectedPaymentMethod === null && pricingQuote.final_price > 0 ? (
          <Text style={styles.helperText}>
            Choose a payment method below to continue.
          </Text>
        ) : null}
        {pricingQuote.final_price <= 0 ? (
          <Text style={styles.helperText}>
            No payment is required for this selection.
          </Text>
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
          Confirm your payment choice to start generating your personalized
          children's book.
        </Text>

        {pricingLoading ? (
          <PaperActivityIndicator />
        ) : pricingQuote ? (
          <View style={styles.paymentInfoCard}>
            <View style={styles.pricingRowBetween}>
              <Text style={styles.pricingLabel}>Total due</Text>
              <Text style={[styles.pricingValue, styles.pricingValueStrong]}>
                {formatCurrency(
                  pricingQuote.final_price,
                  pricingQuote.currency
                )}
              </Text>
            </View>
            {selectedPaymentMethod === "credits" ? (
              <View>
                <View style={styles.pricingRowBetween}>
                  <Text style={styles.pricingLabel}>Credits to deduct</Text>
                  <Text style={styles.pricingValue}>
                    {formatCredits(pricingQuote.credits_required ?? 0)}
                  </Text>
                </View>
                <View style={styles.pricingRowBetween}>
                  <Text style={styles.pricingLabel}>Current balance</Text>
                  <Text style={styles.pricingValue}>
                    {formatCredits(pricingQuote.credits_balance ?? 0)}
                  </Text>
                </View>
                <Text style={styles.helperText}>
                  Your credits will be deducted once you confirm this payment.
                </Text>
              </View>
            ) : null}
            {selectedPaymentMethod === "card" ? (
              pricingQuote.card_available === false ? (
                <Text style={styles.helperText}>
                  Card payments are currently disabled. Please choose credits or
                  a free trial.
                </Text>
              ) : (
                <Text style={styles.helperText}>
                  Enter your card details below. Your card will only be charged
                  after you tap Confirm & Pay.
                </Text>
              )
            ) : null}
            {selectedPaymentMethod === "free_trial" ? (
              <Text style={styles.helperText}>
                This book will be unlocked using your available free trial. No
                payment required.
              </Text>
            ) : null}
            {selectedPaymentMethod === "google_pay" ? (
              <Text style={styles.helperText}>
                You will complete payment using Google Pay on the next step.
              </Text>
            ) : null}
            {!selectedPaymentMethod && paymentRequired ? (
              <Text style={styles.helperText}>
                Go back to the review step to choose a payment option before
                confirming.
              </Text>
            ) : null}
            {!paymentRequired ? (
              <Text style={styles.helperText}>
                No payment is required for this selection. Confirm to start your
                book creation.
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.errorTextInline}>
            {pricingError || "Pricing unavailable."}
          </Text>
        )}

        {selectedPaymentMethod === "card" &&
        pricingQuote?.card_available !== false &&
        cardPaymentsSupported ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={insets.top + 72}
          >
            <View style={styles.cardFieldContainer}>
              <CardField
                postalCodeEnabled={false}
                placeholders={{ number: "4242 4242 4242 4242" }}
                cardStyle={{
                  // Use hex to avoid Android parseColor("rgba(...)") errors
                  backgroundColor: "#FFFFFF",
                  textColor: colors.textPrimary,
                  placeholderColor: colors.textMuted,
                  borderRadius: radii.md,
                  fontSize: 16,
                }}
                style={styles.cardField}
                onCardChange={(details: CardDetailsChange) => {
                  const complete = details?.complete ?? false;
                  setCardDetailsComplete(complete);
                  setCardFieldError(
                    complete ? null : "Enter full card details to continue."
                  );
                }}
              />
              {cardFieldError ? (
                <Text style={styles.errorTextInline}>{cardFieldError}</Text>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        ) : null}

        {paymentError ? (
          <Text style={styles.errorTextInline}>{paymentError}</Text>
        ) : null}

        <Button
          title="Confirm & Pay"
          onPress={handleConfirmPaymentAndCreate}
          disabled={confirmDisabled}
          loading={isPaymentLoading || isCreating}
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
        <Dialog
          visible={creationDialog.visible}
          onDismiss={() => setCreationDialog({ visible: false, bookId: null })}
        >
          <Dialog.Title>Book Creation Started</Dialog.Title>
          <Dialog.Content>
            <Text>
              Your book is being created. This may take several minutes.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              title="View Progress"
              onPress={() => {
                if (creationDialog.bookId)
                  navigation.navigate("BookStatus", {
                    bookId: creationDialog.bookId,
                  });
                setCreationDialog({ visible: false, bookId: null });
              }}
            />
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingBottom:
            keyboardHeight > 0
              ? keyboardHeight + spacing(6)
              : spacing(8) + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <TouchableRipple
              onPress={() => navigation.navigate("BookLibrary")}
              style={styles.backArrow}
              borderless
            >
              <MaterialCommunityIcons
                name="arrow-left-bold"
                size={24}
                color={colors.primaryDark}
              />
            </TouchableRipple>
            <Text style={styles.title}>Create Children-s Book</Text>
          </View>
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

        <View
          style={[
            styles.navigationRow,
            { paddingBottom: spacing(1) + insets.bottom },
          ]}
        >
          {currentStep > 0 ? (
            <Button
              title=""
              onPress={goToPrevStep}
              variant="primary"
              style={styles.navButton}
              size="sm"
              leftIcon={
                <MaterialCommunityIcons
                  name="arrow-left"
                  size={22}
                  color={colors.surface}
                />
              }
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
              rightIcon={
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={22}
                  color={
                    canProceedToNext() ? colors.surface : colors.neutral500
                  }
                />
              }
            />
          ) : (
            <View style={styles.navSpacer} />
          )}
        </View>

        <Button
          title="Cancel"
          onPress={() => navigation.navigate("BookLibrary")}
          variant="secondary"
          style={[
            styles.cancelButton,
            styles.cancelStandalone,
            { marginBottom: spacing(8) + insets.bottom },
          ]}
        />
      </ScrollView>
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: "" })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {},
  header: {
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(6),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  backArrow: {
    marginRight: spacing(3),
    padding: 0,
  },
  title: {
    ...typography.headingXL,
    textAlign: "left",
    color: colors.primaryDark,
    fontWeight: "800",
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
    backgroundColor: "rgba(135, 206, 235, 0.18)",
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
    backgroundColor: "rgba(135, 206, 235, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing(1.5),
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
  },
  stepCircleCompleted: {
    backgroundColor: "rgba(37, 99, 235, 0.45)",
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
    width: "100%",
  },
  stepTitle: {
    ...typography.headingL,
    marginBottom: spacing(4),
  },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: spacing(2) as any,
    marginBottom: spacing(4),
  },
  inlineHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing(2),
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
  heroCard: {
    backgroundColor: "rgba(0,0,0,0.04)",
    padding: spacing(3),
    borderRadius: radii.lg,
    marginBottom: spacing(3),
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
    marginBottom: spacing(3),
    // marginTop: spacing(1),
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing(1.5),
  },
  textInput: {
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    borderRadius: radii.md,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    fontSize: 15,
  },
  segmented: {
    backgroundColor: "rgba(135, 206, 235, 0.12)",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.2)",
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
    borderColor: "rgba(37, 99, 235, 0.2)",
    borderRadius: radii.pill,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
    backgroundColor: "rgba(255, 255, 255, 0.85)",
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
    backgroundColor: "rgba(135, 206, 235, 0.18)",
    marginBottom: spacing(3),
    ...shadow.subtle,
  },
  templateCardActive: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
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
    backgroundColor: "transparent",
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
    backgroundColor: "rgba(37, 99, 235, 0.12)",
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
    backgroundColor: "transparent",
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
  noteText: {
    ...typography.caption,
    color: colors.neutral400,
  },
  warningText: {
    color: "#991B1B",
  },
  paymentOptionsContainer: {
    marginBottom: spacing(4),
  },
  paymentInfoCard: {
    backgroundColor: "rgba(135, 206, 235, 0.18)",
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
    paddingHorizontal: spacing(1),
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
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 0,
  },
  nextButton: {},
  cancelStandalone: {
    marginHorizontal: spacing(3),
    marginBottom: spacing(8),
  },
});
