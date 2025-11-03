import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import {
  ActivityIndicator as PaperActivityIndicator,
  Banner,
  Chip,
  ProgressBar,
  Portal,
  Dialog,
} from "react-native-paper";
import { getBookStatus, retryBookCreation, Book } from "../api/books";
import { useAuth } from "../context/AuthContext";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/types";
import ScreenWrapper from "../components/ScreenWrapper";
import { colors } from "../styles/theme";
import Button from "../components/Button";

const STATUS_MESSAGES: Record<string, string> = {
  creating: "🚀 Starting your book creation...",
  generating_story: "📖 Writing your magical story...",
  generating_images: "🎨 Creating beautiful illustrations...",
  composing: "📚 Putting your book together...",
  completed: "✅ Your book is ready!",
  failed: "❌ Something went wrong",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  creating: "Preparing your book creation process",
  generating_story:
    "Our AI storyteller is crafting a unique tale based on your character and preferences",
  generating_images:
    "Creating stunning illustrations for each page of your story",
  composing: "Combining text and images into a beautiful PDF book",
  completed: "Your book is complete and ready to read!",
  failed: "There was an error creating your book. You can try again.",
};

type BookStatusScreenProps = NativeStackScreenProps<
  AppStackParamList,
  "BookStatus"
>;

export default function BookStatusScreen({
  route,
  navigation,
}: BookStatusScreenProps) {
  const { bookId } = route.params;
  const { token } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryDialog, setRetryDialog] = useState(false);

  const loadBookStatus = async () => {
    if (!token) return;

    try {
      const bookData = await getBookStatus(token, bookId);
      setBook(bookData);

      // Auto-refresh if book is still in progress
      if (!["completed", "failed"].includes(bookData.status)) {
        setTimeout(loadBookStatus, 3000); // Poll every 3 seconds
      }
    } catch (error: any) {
      console.error("Error loading book status:", error);
      Alert.alert("Error", "Failed to load book status");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setRetryDialog(true);
  };

  const performRetry = async () => {
    if (!token || !book) return;
    setRetrying(true);
    try {
      await retryBookCreation(token, book.id);
      setRetryDialog(false);
      loadBookStatus();
    } catch (error: any) {
      setRetryDialog(false);
    } finally {
      setRetrying(false);
    }
  };

  const handleViewBook = () => {
    if (book) {
      navigation.navigate("BookViewer", { bookId: book.id });
    }
  };

  const handleBackToHome = () => {
    navigation.navigate("BookLibrary");
  };

  useEffect(() => {
    loadBookStatus();
  }, [bookId, token]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <PaperActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading book status...</Text>
      </View>
    );
  }

  if (!book) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Book not found</Text>
        <Button
          title="Go Back"
          onPress={handleBackToHome}
          variant="secondary"
        />
      </View>
    );
  }

  const getProgressColor = () => {
    if (book.status === "completed") return colors.success;
    if (book.status === "failed") return colors.danger;
    return colors.primary;
  };

  const getEstimatedTimeRemaining = () => {
    if (book.status === "completed") return null;
    if (book.status === "failed") return null;

    const progress = book.progress_percentage || 0;
    if (progress < 20) return "10-15 minutes";
    if (progress < 50) return "8-12 minutes";
    if (progress < 80) return "3-8 minutes";
    return "1-3 minutes";
  };

  return (
    <ScreenWrapper>
      <Portal>
        <Dialog visible={retryDialog} onDismiss={() => setRetryDialog(false)}>
          <Dialog.Title>Retry Book Creation?</Dialog.Title>
          <Dialog.Content>
            <Text>
              This will restart the book creation process from the beginning.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setRetryDialog(false)}
            />
            <Button title="Retry" onPress={performRetry} loading={retrying} />
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>📚 {book.title}</Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Chip style={{ alignSelf: "center" }}>
              {STATUS_MESSAGES[book.status] || book.status}
            </Chip>
            <Text style={styles.statusDescription}>
              {STATUS_DESCRIPTIONS[book.status] || "Processing your book..."}
            </Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <ProgressBar
              progress={(book.progress_percentage || 0) / 100}
              color={getProgressColor()}
            />
            <Text style={styles.progressText}>
              {Math.round(book.progress_percentage || 0)}% Complete
            </Text>
          </View>

          {/* Time Estimate */}
          {getEstimatedTimeRemaining() && (
            <View style={styles.timeEstimate}>
              <Text style={styles.timeEstimateText}>
                ⏱️ Estimated time remaining: {getEstimatedTimeRemaining()}
              </Text>
            </View>
          )}

          {/* Error Message */}
          {book.status === "failed" && book.error_message ? (
            <Banner visible icon="alert-circle">
              {book.error_message}
            </Banner>
          ) : null}

          {/* Book Details */}
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>📋 Book Details</Text>
            <Text style={styles.detailItem}>
              Story:{" "}
              {book.story_source === "template"
                ? `Template (${book.template_key || "prebuilt"})`
                : "Custom Story"}
            </Text>
            <Text style={styles.detailItem}>
              Age Group: {book.target_age || "n/a"} years
            </Text>
            <Text style={styles.detailItem}>Pages: {book.page_count}</Text>
            <Text style={styles.detailItem}>
              Created: {new Date(book.created_at).toLocaleDateString()}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {book.status === "completed" && (
              <Button
                title="📖 View Book"
                onPress={handleViewBook}
                variant="primary"
              />
            )}

            {book.status === "failed" && (
              <Button
                title="🔄 Try Again"
                onPress={handleRetry}
                variant="primary"
                loading={retrying}
                disabled={retrying}
              />
            )}

            <Button
              title="← Back to Library"
              onPress={handleBackToHome}
              variant="info"
            />
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 18,
    color: colors.danger,
    marginBottom: 20,
  },
  header: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.primaryDark,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 5,
  },
  statusCard: {
    margin: 15,
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusHeader: {
    marginBottom: 20,
  },
  statusDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  progressContainer: {
    marginBottom: 15,
  },
  progressText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    textAlign: "center",
  },
  timeEstimate: {
    backgroundColor: "#fef3c7",
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  timeEstimateText: {
    fontSize: 14,
    color: "#92400e",
    textAlign: "center",
  },
  detailsCard: {
    backgroundColor: "#FFF8E1",
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  detailItem: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  actionsContainer: {
    gap: 10,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: colors.success,
  },
  retryButton: {
    backgroundColor: colors.warning,
  },
  secondaryButton: {
    backgroundColor: colors.neutral400,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: "white",
    fontSize: 14,
  },
  infoCard: {
    margin: 15,
    padding: 20,
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.textPrimary,
    marginBottom: 15,
  },
  processStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  processIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 30,
  },
  processIconComplete: {
    opacity: 1,
  },
  processContent: {
    flex: 1,
  },
  processTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  processDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
