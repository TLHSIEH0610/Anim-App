import React, { useMemo, useState, useEffect } from "react";
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
import { createBook, BookCreationData, getStoryTemplates } from "../api/books";
import { useAuth } from "../context/AuthContext";
import { colors, radii, shadow, spacing, typography } from "../styles/theme";

interface TemplateDisplay {
  key: string;
  label: string;
  description: string;
  defaultAge: string;
  pageCount: number;
  storyText?: string;
}

const DEFAULT_TEMPLATES: TemplateDisplay[] = [
  {
    key: "space_explorer",
    label: "🚀 Space Explorer",
    description: "Cosmic adventure with friendly planets and zero-gravity playtime.",
    defaultAge: "6-8",
    pageCount: 8,
    storyText: "An exciting journey through the cosmos with friendly planets and daring discoveries.",
  },
  {
    key: "forest_friends",
    label: "🌲 Forest Friends",
    description: "Gentle woodland kindness with cuddly animal companions.",
    defaultAge: "3-5",
    pageCount: 8,
    storyText: "A cozy walk through the forest where kindness grows with every furry friend met.",
  },
  {
    key: "magic_school",
    label: "✨ Magic School Day",
    description: "A whimsical day at a floating academy full of sparkly lessons.",
    defaultAge: "6-8",
    pageCount: 8,
    storyText: "Lessons sparkle and broomsticks zoom during a day at the floating magic academy.",
  },
  {
    key: "pirate_adventure",
    label: "🏴‍☠️ Pirate Treasure",
    description: "Brave voyages, clever riddles, and sharing treasure with new friends.",
    defaultAge: "6-8",
    pageCount: 8,
    storyText: "A treasure hunt full of riddles, roaring waves, and pirate crews that share their loot.",
  },
  {
    key: "bedtime_lullaby",
    label: "🌙 Bedtime Lullaby",
    description: "A dreamy glide toward sleep with moonlight and lullabies.",
    defaultAge: "3-5",
    pageCount: 8,
    storyText: "Moonbeams and whispers guide a gentle journey toward the coziest dreams.",
  },
];

const GENDER_OPTIONS: Array<{ value: "male" | "female"; label: string }> = [
  { value: "female", label: "Girl" },
  { value: "male", label: "Boy" },
];

interface TemplateInput {
  name: string;
  gender: "male" | "female";
}

interface BookForm {
  title: string;
  pageCount: number;
  images: string[];
  templateKey: string;
  templateInput: TemplateInput;
}

const steps = ["Upload Images", "Story Setup", "Review"];

const buildAutoTitle = (storyLabel: string | undefined, characterName: string | undefined) => {
  const cleanStory = (storyLabel || "Story").trim();
  const cleanName = (characterName || "").trim();

  if (cleanName) {
    return `${cleanStory} - ${cleanName}`;
  }

  return `${cleanStory} - Character Name`;
};

export default function BookCreationScreen({ navigation }) {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<TemplateDisplay[]>(DEFAULT_TEMPLATES);
  const [form, setForm] = useState<BookForm>({
    title: buildAutoTitle(DEFAULT_TEMPLATES[0].label, ""),
    pageCount: DEFAULT_TEMPLATES[0].pageCount,
    images: [],
    templateKey: DEFAULT_TEMPLATES[0].key,
    templateInput: {
      name: "",
      gender: "female",
    },
  });

  const [isCreating, setIsCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const selectedTemplate = useMemo(() => {
    const found = templates.find((tpl) => tpl.key === form.templateKey);
    return found || templates[0];
  }, [templates, form.templateKey]);

  const storylinePreview = useMemo(() => {
    if (!selectedTemplate) {
      return "";
    }

    const characterName = form.templateInput.name.trim() || "your character";
    const baseStory = selectedTemplate.storyText?.trim()
      ? selectedTemplate.storyText
      : selectedTemplate.description;

    if (!baseStory) {
      return "";
    }

    return baseStory
      .replace(/\{\{\s*name\s*\}\}/gi, characterName)
      .replace(/\{name\}/gi, characterName)
      .replace(/\[name\]/gi, characterName)
      .replace(/<name>/gi, characterName);
  }, [selectedTemplate, form.templateInput.name]);

  useEffect(() => {
    let isMounted = true;

    const loadTemplates = async () => {
      try {
        const response = await getStoryTemplates();
        if (!isMounted) return;
        if (response.stories && response.stories.length) {
          const mapped: TemplateDisplay[] = response.stories.map((story) => ({
            key: story.slug,
            label: story.name || story.slug,
            description:
              story.description ||
              `${story.page_count || 0} pages${story.default_age ? ` · Ages ${story.default_age}` : ""}`,
            defaultAge: story.default_age || DEFAULT_TEMPLATES[0].defaultAge,
            pageCount: story.page_count || DEFAULT_TEMPLATES[0].pageCount,
            storyText: story.story_text || "",
          }));

          setTemplates(mapped);
          const currentExists = mapped.some((tpl) => tpl.key === form.templateKey);
          if (!currentExists) {
            setForm((prev) => ({
              ...prev,
              templateKey: mapped[0].key,
              pageCount: mapped[0].pageCount,
            }));
          }
        }
      } catch (error) {
        console.warn("Unable to fetch story templates, using defaults", error);
      }
    };

    loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    setForm((prev) => {
      const nextPages = selectedTemplate.pageCount || prev.pageCount;

      if (prev.pageCount === nextPages) {
        return prev;
      }

      return {
        ...prev,
        pageCount: nextPages,
      };
    });
  }, [selectedTemplate]);

  useEffect(() => {
    const templateLabel = selectedTemplate?.label;
    const nextTitle = buildAutoTitle(templateLabel, form.templateInput.name);

    setForm((prev) => {
      if (prev.title === nextTitle) {
        return prev;
      }

      return {
        ...prev,
        title: nextTitle,
      };
    });
  }, [selectedTemplate, form.templateInput.name]);

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

  const createChildBook = async () => {
    if (!form.images.length) {
      Alert.alert("Missing Images", "Please select at least 1 image");
      return;
    }

    if (!form.title.trim()) {
      Alert.alert("Missing Title", "Please enter a book title");
      return;
    }

    const payload: BookCreationData = {
      files: form.images,
      title: form.title.trim(),
      page_count: form.pageCount,
      story_source: "template",
      template_key: form.templateKey,
      template_params: {
        name: form.templateInput.name.trim() || undefined,
        gender: form.templateInput.gender,
      },
    };

    setIsCreating(true);

    try {
      const response = await createBook(token, payload);
      Alert.alert(
        "Book Creation Started! 📚",
        `Your book "${form.title}" is being created. This may take several minutes.`,
        [
          {
            text: "View Progress",
            onPress: () => navigation.navigate("BookStatus", { bookId: response.id }),
          },
        ]
      );
    } catch (error: any) {
      console.error("Book creation error:", error);
      let errorMessage = "Failed to create book. Please try again.";
      if (error.response?.status === 402) {
        errorMessage = "Insufficient credits. You need 3 credits to create a book after your first free book.";
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data?.detail || "Invalid input. Please check your form.";
      }
      Alert.alert("Creation Failed", errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0:
        return form.images.length > 0;
      case 1:
        return !!form.title.trim();
      case 2:
        return true;
      default:
        return false;
    }
  };

  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>📷 Upload Character Images</Text>
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
                  <Text style={styles.removeImageText}>✕</Text>
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
          <Text style={styles.uploadButtonText}>📱 Select Images (1-4)</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.helpText}>
        💡 Tip: Multiple images help AI understand your character better! Choose clear images with good lighting.
      </Text>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>📖 Story Setup</Text>

      <Text style={styles.templateIntro}>Select a ready-made story to customize quickly.</Text>
      <View style={styles.templateList}>
        {templates.map((template) => (
          <TouchableOpacity
            key={template.key}
            style={[
              styles.templateCard,
              form.templateKey === template.key && styles.templateCardActive,
            ]}
            onPress={() => updateForm("templateKey", template.key)}
          >
            <Text style={styles.templateTitle}>{template.label}</Text>
            <Text style={styles.templateDescription}>{template.description}</Text>
            <Text style={styles.templateMeta}>
              Suggested Age: {template.defaultAge} · {template.pageCount} pages
            </Text>
          </TouchableOpacity>
        ))}
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
      <Text style={styles.stepTitle}>📋 Review & Create</Text>

      {form.images.length > 0 && (
        <View style={styles.reviewImageGallery}>
          {form.images.map((uri, index) => (
            <Image key={index} source={{ uri }} style={styles.reviewImage} />
          ))}
        </View>
      )}

      <View style={styles.reviewDetails}>
        <Text style={styles.reviewTitle}>"{form.title}"</Text>
        <Text style={styles.reviewDetail}>Template: {selectedTemplate?.label ?? "Custom"}</Text>
        <Text style={styles.reviewDetail}>Pages: {form.pageCount}</Text>
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

      <TouchableOpacity style={styles.reviewBackButton} onPress={() => setCurrentStep(1)}>
        <Text style={styles.reviewBackButtonText}>← Back to Story Setup</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.createButton, isCreating && styles.createButtonDisabled]}
        onPress={createChildBook}
        disabled={isCreating}
      >
        {isCreating ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.createButtonText}>🚀 Create My Book!</Text>
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
      default:
        return renderStep0();
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Children's Book</Text>
        <Text style={styles.subtitle}>Pick a story template and bring it to life with your photos.</Text>
      </View>

      <View style={styles.stepIndicator}>
        {steps.map((step, index) => (
          <View key={index} style={styles.stepContainer}>
            <View
              style={[
                styles.stepCircle,
                index <= currentStep && styles.stepCircleActive,
                index < currentStep && styles.stepCircleCompleted,
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  index <= currentStep && styles.stepNumberActive,
                ]}
              >
                {index < currentStep ? "✓" : index + 1}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                index <= currentStep && styles.stepLabelActive,
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

      {currentStep < steps.length - 1 && (
        <View style={styles.navigation}>
          {currentStep > 0 && (
            <TouchableOpacity style={styles.navButton} onPress={() => setCurrentStep(currentStep - 1)}>
              <Text style={styles.navButtonText}>← Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.navButton,
              styles.navButtonPrimary,
              !canProceedToNext() && styles.navButtonDisabled,
            ]}
            onPress={() => setCurrentStep(currentStep + 1)}
            disabled={!canProceedToNext()}
          >
            <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>Next →</Text>
          </TouchableOpacity>
        </View>
      )}
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
    textAlign: 'center',
    color: colors.primaryDark,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing(1),
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing(5),
    paddingHorizontal: spacing(5),
    backgroundColor: colors.surface,
    marginBottom: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
  },
  stepContainer: {
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.neutral200,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontWeight: '600',
    color: colors.textMuted,
  },
  stepNumberActive: {
    color: colors.surface,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
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
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: radii.pill,
    marginBottom: spacing(3),
  },
  imageCountText: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radii.lg,
    alignItems: 'center',
    ...shadow.subtle,
  },
  uploadButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    marginTop: spacing(3),
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  imageGallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(3),
    marginBottom: spacing(3),
  },
  imageWrapper: {
    position: 'relative',
  },
  galleryImage: {
    width: 100,
    height: 100,
    borderRadius: radii.md,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: radii.pill,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: {
    color: colors.surface,
    fontWeight: '700',
  },
  addMoreButton: {
    backgroundColor: colors.primarySoft,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(4),
    borderRadius: radii.md,
    alignSelf: 'flex-start',
  },
  addMoreText: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: spacing(5),
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(2.5),
  },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderColor: '#93c5fd',
    marginRight: spacing(2),
  },
  optionRadioActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  optionLabelActive: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  templateIntro: {
    ...typography.body,
    marginBottom: spacing(3),
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
    fontWeight: '600',
  },
  reviewImageGallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    fontWeight: '700',
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
    borderColor: '#c7d2fe',
  },
  reviewStorylineHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: spacing(2),
  },
  reviewStoryline: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radii.lg,
    alignItems: 'center',
    marginBottom: spacing(8),
    ...shadow.card,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '600',
  },
  reviewBackButton: {
    marginBottom: spacing(4),
    paddingVertical: spacing(3),
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  reviewBackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cancelButton: {
    marginHorizontal: spacing(6),
    marginBottom: spacing(4),
    paddingVertical: spacing(3),
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.neutral100,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    fontWeight: '600',
    color: colors.textSecondary,
  },
  navButtonTextPrimary: {
    color: colors.surface,
  },
});
