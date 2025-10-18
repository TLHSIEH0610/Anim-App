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

const DEFAULT_TEMPLATES = [
  {
    key: "space_explorer",
    label: "🚀 Space Explorer",
    description: "Cosmic adventure with friendly planets and zero-gravity playtime.",
    defaultAge: "6-8",
    pageCount: 8,
  },
  {
    key: "forest_friends",
    label: "🌲 Forest Friends",
    description: "Gentle woodland kindness with cuddly animal companions.",
    defaultAge: "3-5",
    pageCount: 8,
  },
  {
    key: "magic_school",
    label: "✨ Magic School Day",
    description: "A whimsical day at a floating academy full of sparkly lessons.",
    defaultAge: "6-8",
    pageCount: 8,
  },
  {
    key: "pirate_adventure",
    label: "🏴‍☠️ Pirate Treasure",
    description: "Brave voyages, clever riddles, and sharing treasure with new friends.",
    defaultAge: "6-8",
    pageCount: 8,
  },
  {
    key: "bedtime_lullaby",
    label: "🌙 Bedtime Lullaby",
    description: "A dreamy glide toward sleep with moonlight and lullabies.",
    defaultAge: "3-5",
    pageCount: 8,
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
    return `${cleanStory} + ${cleanName}`;
  }

  return `${cleanStory} + Character Name`;
};

export default function BookCreationScreen({ navigation }) {
  const { token } = useAuth();
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
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

  useEffect(() => {
    let isMounted = true;

    const loadTemplates = async () => {
      try {
        const response = await getStoryTemplates();
        if (!isMounted) return;
        if (response.stories && response.stories.length) {
          const mapped = response.stories.map((story) => ({
            key: story.slug,
            label: story.name || story.slug,
            description:
              story.description ||
              `${story.page_count || 0} pages${story.default_age ? ` · Ages ${story.default_age}` : ""}`,
            defaultAge: story.default_age || DEFAULT_TEMPLATES[0].defaultAge,
            pageCount: story.page_count || DEFAULT_TEMPLATES[0].pageCount,
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
        {selectedTemplate?.description ? (
          <Text style={styles.reviewStoryline}>{selectedTemplate.description}</Text>
        ) : null}
      </View>

      <View style={styles.costInfo}>
        <Text style={styles.costTitle}>💰 Cost Information</Text>
        <Text style={styles.costDetail}>• First book each month: FREE</Text>
        <Text style={styles.costDetail}>• Additional books: 3 credits each</Text>
        <Text style={styles.costDetail}>• Creation time: 5-15 minutes</Text>
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
    backgroundColor: "#f8f9ff",
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e7ff",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e40af",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 5,
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 20,
    backgroundColor: "white",
    marginBottom: 10,
  },
  stepContainer: {
    alignItems: "center",
    flex: 1,
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  stepCircleActive: {
    backgroundColor: "#3b82f6",
  },
  stepCircleCompleted: {
    backgroundColor: "#10b981",
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#9ca3af",
  },
  stepNumberActive: {
    color: "white",
  },
  stepLabel: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
  },
  stepLabelActive: {
    color: "#1e3a8a",
  },
  stepContent: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 16,
  },
  stepDescription: {
    fontSize: 15,
    color: "#4b5563",
    marginBottom: 18,
    lineHeight: 22,
  },
  imageCountBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  imageCountText: {
    color: "#0369a1",
    fontWeight: "600",
  },
  uploadButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  uploadButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  helpText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 20,
  },
  imageGallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  imageWrapper: {
    position: "relative",
  },
  galleryImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  removeImageButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  removeImageText: {
    color: "white",
    fontWeight: "bold",
  },
  addMoreButton: {
    backgroundColor: "#e0e7ff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  addMoreText: {
    color: "#4338ca",
    fontWeight: "600",
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "white",
    fontSize: 15,
  },
  optionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "white",
  },
  optionPillActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  optionRadio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#93c5fd",
    marginRight: 8,
  },
  optionRadioActive: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },
  optionLabel: {
    fontSize: 14,
    color: "#1f2937",
    fontWeight: "500",
  },
  optionLabelActive: {
    color: "#1d4ed8",
    fontWeight: "600",
  },
  templateIntro: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 12,
  },
  templateList: {
    marginBottom: 4,
  },
  templateCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f8fafc",
    marginBottom: 12,
  },
  templateCardActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 6,
  },
  templateDescription: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 6,
    lineHeight: 21,
  },
  templateMeta: {
    fontSize: 12,
    color: "#1d4ed8",
    fontWeight: "600",
  },
  reviewImageGallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  reviewImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
  },
  reviewDetails: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  reviewDetail: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 4,
  },
  reviewStoryline: {
    marginTop: 8,
    fontSize: 14,
    color: "#1f2937",
    lineHeight: 20,
  },
  costInfo: {
    backgroundColor: "#e0f2fe",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  costTitle: {
    fontWeight: "600",
    color: "#0c4a6e",
    marginBottom: 6,
  },
  costDetail: {
    color: "#075985",
    fontSize: 14,
  },
  createButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 30,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  reviewBackButton: {
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "white",
    alignItems: "center",
  },
  reviewBackButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  cancelButton: {
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  navButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "white",
  },
  navButtonPrimary: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4b5563",
  },
  navButtonTextPrimary: {
    color: "white",
  },
});
