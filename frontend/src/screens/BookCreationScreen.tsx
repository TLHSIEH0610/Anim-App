import React, { useState } from "react";
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
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from "expo-image-picker";
import { createBook } from "../api/books";
import { useAuth } from "../context/AuthContext";

interface BookForm {
  title: string;
  theme: string;
  targetAge: string;
  pageCount: number;
  characterDescription: string;
  positivePrompt: string;
  negativePrompt: string;
  image: string | null;
}

const THEMES = [
  { value: "adventure", label: "🗺️ Adventure" },
  { value: "friendship", label: "👫 Friendship" }, 
  { value: "learning", label: "📚 Learning" },
  { value: "bedtime", label: "🌙 Bedtime" },
  { value: "fantasy", label: "✨ Fantasy" },
  { value: "family", label: "👨‍👩‍👧‍👦 Family" },
];

const AGE_GROUPS = [
  { value: "3-5", label: "3-5 years (Preschool)" },
  { value: "6-8", label: "6-8 years (Early Elementary)" },
  { value: "9-12", label: "9-12 years (Elementary)" },
];

const PAGE_COUNTS = [1, 4, 6, 8, 10, 12, 16];

export default function BookCreationScreen({ navigation }) {
  const { token } = useAuth();
  const [form, setForm] = useState<BookForm>({
    title: "",
    theme: "adventure",
    targetAge: "6-8", 
    pageCount: 8,
    characterDescription: "",
    positivePrompt: "",
    negativePrompt: "",
    image: null,
  });
  
  const [isCreating, setIsCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    "Upload Image",
    "Book Details", 
    "Story Elements",
    "Review & Create"
  ];

  const updateForm = (field: keyof BookForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        
        // Validate file size (10MB limit)
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          Alert.alert("File Too Large", "Please select an image smaller than 10MB");
          return;
        }
        
        updateForm('image', asset.uri);
        
        // Auto-advance to next step
        if (currentStep === 0) {
          setCurrentStep(1);
        }
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const createChildBook = async () => {
    if (!form.image) {
      Alert.alert("Missing Image", "Please select an image first");
      return;
    }
    
    if (!form.title.trim()) {
      Alert.alert("Missing Title", "Please enter a book title");
      return;
    }
    
    if (!form.characterDescription.trim()) {
      Alert.alert("Missing Character", "Please describe the main character");
      return;
    }

    setIsCreating(true);
    
    try {
      const response = await createBook(token, {
        file: form.image,
        title: form.title.trim(),
        theme: form.theme,
        target_age: form.targetAge,
        page_count: form.pageCount,
        character_description: form.characterDescription.trim(),
        positive_prompt: form.positivePrompt.trim(),
        negative_prompt: form.negativePrompt.trim(),
      });

      Alert.alert(
        "Book Creation Started! 📚",
        `Your book "${form.title}" is being created. This may take several minutes.`,
        [
          {
            text: "View Progress", 
            onPress: () => navigation.navigate('BookStatus', { bookId: response.id })
          }
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

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {steps.map((step, index) => (
        <View key={index} style={styles.stepContainer}>
          <View style={[
            styles.stepCircle,
            index <= currentStep && styles.stepCircleActive,
            index < currentStep && styles.stepCircleCompleted
          ]}>
            <Text style={[
              styles.stepNumber,
              index <= currentStep && styles.stepNumberActive
            ]}>
              {index < currentStep ? "✓" : index + 1}
            </Text>
          </View>
          <Text style={[
            styles.stepLabel,
            index <= currentStep && styles.stepLabelActive
          ]}>
            {step}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>📷 Upload Character Image</Text>
      <Text style={styles.stepDescription}>
        Choose an image that will be the main character of your story
      </Text>
      
      {form.image ? (
        <View style={styles.imageContainer}>
          <Image source={{ uri: form.image }} style={styles.selectedImage} />
          <TouchableOpacity style={styles.changeImageButton} onPress={pickImage}>
            <Text style={styles.changeImageText}>Change Image</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
          <Text style={styles.uploadButtonText}>📱 Select Image</Text>
        </TouchableOpacity>
      )}
      
      <Text style={styles.helpText}>
        💡 Tip: Choose a clear image with good lighting. This character will appear throughout your book!
      </Text>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>📖 Book Details</Text>
      
      <View style={styles.formGroup}>
        <Text style={styles.label}>Book Title *</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter your book title..."
          value={form.title}
          onChangeText={(text) => updateForm('title', text)}
          maxLength={100}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Story Theme</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={form.theme}
            onValueChange={(value) => updateForm('theme', value)}
            style={styles.picker}
          >
            {THEMES.map((theme) => (
              <Picker.Item key={theme.value} label={theme.label} value={theme.value} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Target Age</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={form.targetAge}
            onValueChange={(value) => updateForm('targetAge', value)}
            style={styles.picker}
          >
            {AGE_GROUPS.map((age) => (
              <Picker.Item key={age.value} label={age.label} value={age.value} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Number of Pages</Text>
        <View style={styles.pageCountContainer}>
          {PAGE_COUNTS.map((count) => (
            <TouchableOpacity
              key={count}
              style={[
                styles.pageCountButton,
                form.pageCount === count && styles.pageCountButtonActive
              ]}
              onPress={() => updateForm('pageCount', count)}
            >
              <Text style={[
                styles.pageCountText,
                form.pageCount === count && styles.pageCountTextActive
              ]}>
                {count}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>✨ Story Elements</Text>
      
      <View style={styles.formGroup}>
        <Text style={styles.label}>Character Description *</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Describe the main character from your image (personality, appearance, etc.)..."
          value={form.characterDescription}
          onChangeText={(text) => updateForm('characterDescription', text)}
          multiline
          numberOfLines={3}
          maxLength={200}
        />
        <Text style={styles.charCount}>{form.characterDescription.length}/200</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Story Elements (Optional)</Text>
        <TextInput
          style={styles.textArea}
          placeholder="What elements would you like in your story? (magical forest, friendly animals, rainbow, etc.)"
          value={form.positivePrompt}
          onChangeText={(text) => updateForm('positivePrompt', text)}
          multiline
          numberOfLines={2}
          maxLength={150}
        />
        <Text style={styles.charCount}>{form.positivePrompt.length}/150</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Things to Avoid (Optional)</Text>
        <TextInput
          style={styles.textArea}
          placeholder="What should NOT be in your story? (scary animals, dark places, etc.)"
          value={form.negativePrompt}
          onChangeText={(text) => updateForm('negativePrompt', text)}
          multiline
          numberOfLines={2}
          maxLength={150}
        />
        <Text style={styles.charCount}>{form.negativePrompt.length}/150</Text>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>📋 Review & Create</Text>
      
      <View style={styles.reviewContainer}>
        {form.image && (
          <Image source={{ uri: form.image }} style={styles.reviewImage} />
        )}
        
        <View style={styles.reviewDetails}>
          <Text style={styles.reviewTitle}>"{form.title}"</Text>
          <Text style={styles.reviewDetail}>Theme: {THEMES.find(t => t.value === form.theme)?.label}</Text>
          <Text style={styles.reviewDetail}>Age: {form.targetAge} years</Text>
          <Text style={styles.reviewDetail}>Pages: {form.pageCount}</Text>
          <Text style={styles.reviewDetail}>Character: {form.characterDescription.substring(0, 50)}...</Text>
        </View>
      </View>

      <View style={styles.costInfo}>
        <Text style={styles.costTitle}>💰 Cost Information</Text>
        <Text style={styles.costDetail}>• First book each month: FREE</Text>
        <Text style={styles.costDetail}>• Additional books: 3 credits each</Text>
        <Text style={styles.costDetail}>• Creation time: 5-15 minutes</Text>
      </View>

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
      case 0: return renderStep0();
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      default: return renderStep0();
    }
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0: return !!form.image;
      case 1: return !!form.title.trim();
      case 2: return !!form.characterDescription.trim();
      case 3: return true;
      default: return false;
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Children's Book</Text>
        <Text style={styles.subtitle}>Turn your photo into a magical story!</Text>
      </View>

      {renderStepIndicator()}
      {renderStepContent()}

      {currentStep < 3 && (
        <View style={styles.navigation}>
          {currentStep > 0 && (
            <TouchableOpacity 
              style={styles.navButton} 
              onPress={() => setCurrentStep(currentStep - 1)}
            >
              <Text style={styles.navButtonText}>← Back</Text>
            </TouchableOpacity>
          )}
          
          {currentStep < 3 && (
            <TouchableOpacity 
              style={[styles.navButton, styles.navButtonPrimary, !canProceedToNext() && styles.navButtonDisabled]}
              onPress={() => setCurrentStep(currentStep + 1)}
              disabled={!canProceedToNext()}
            >
              <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>
                Next →
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e7ff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e40af',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 5,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  stepContainer: {
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  stepCircleActive: {
    backgroundColor: '#3b82f6',
  },
  stepCircleCompleted: {
    backgroundColor: '#10b981',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9ca3af',
  },
  stepNumberActive: {
    color: 'white',
  },
  stepLabel: {
    fontSize: 10,
    textAlign: 'center',
    color: '#9ca3af',
  },
  stepLabelActive: {
    color: '#1f2937',
    fontWeight: '600',
  },
  stepContent: {
    padding: 20,
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  stepDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  uploadButton: {
    backgroundColor: '#3b82f6',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  selectedImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 10,
  },
  changeImageButton: {
    backgroundColor: '#6b7280',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  changeImageText: {
    color: 'white',
    fontSize: 14,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: 'white',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: 'white',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: 'white',
  },
  picker: {
    height: 50,
  },
  pageCountContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pageCountButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: 'white',
  },
  pageCountButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  pageCountText: {
    fontSize: 14,
    color: '#6b7280',
  },
  pageCountTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  charCount: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },
  reviewContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  reviewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 15,
  },
  reviewDetails: {
    flex: 1,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  reviewDetail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  costInfo: {
    backgroundColor: '#fef3c7',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  costTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 5,
  },
  costDetail: {
    fontSize: 14,
    color: '#92400e',
    marginBottom: 2,
  },
  createButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  createButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  createButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  navButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: 'white',
  },
  navButtonPrimary: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  navButtonDisabled: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  navButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  navButtonTextPrimary: {
    color: 'white',
    fontWeight: '600',
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});