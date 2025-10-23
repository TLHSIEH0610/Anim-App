import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { getBookStatus, retryBookCreation, Book } from '../api/books';
import { useAuth } from '../context/AuthContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../navigation/types';

const STATUS_MESSAGES: Record<string, string> = {
  creating: "🚀 Starting your book creation...",
  generating_story: "📖 Writing your magical story...",
  generating_images: "🎨 Creating beautiful illustrations...", 
  composing: "📚 Putting your book together...",
  completed: "✅ Your book is ready!",
  failed: "❌ Something went wrong"
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  creating: "Preparing your book creation process",
  generating_story: "Our AI storyteller is crafting a unique tale based on your character and preferences",
  generating_images: "Creating stunning illustrations for each page of your story",
  composing: "Combining text and images into a beautiful PDF book",
  completed: "Your book is complete and ready to read!",
  failed: "There was an error creating your book. You can try again."
};

type BookStatusScreenProps = NativeStackScreenProps<AppStackParamList, 'BookStatus'>;

export default function BookStatusScreen({ route, navigation }: BookStatusScreenProps) {
  const { bookId } = route.params;
  const { token } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const loadBookStatus = async () => {
    if (!token) return;
    
    try {
      const bookData = await getBookStatus(token, bookId);
      setBook(bookData);
      
      // Auto-refresh if book is still in progress
      if (!['completed', 'failed'].includes(bookData.status)) {
        setTimeout(loadBookStatus, 3000); // Poll every 3 seconds
      }
      
    } catch (error: any) {
      console.error('Error loading book status:', error);
      Alert.alert('Error', 'Failed to load book status');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!token || !book) return;
    
    Alert.alert(
      'Retry Book Creation?',
      'This will restart the book creation process from the beginning.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Retry', 
          style: 'default',
          onPress: async () => {
            setRetrying(true);
            try {
              await retryBookCreation(token, book.id);
              Alert.alert('Success', 'Book creation has been restarted');
              loadBookStatus(); // Refresh status
            } catch (error: any) {
              Alert.alert('Error', 'Failed to retry book creation');
            } finally {
              setRetrying(false);
            }
          }
        }
      ]
    );
  };

  const handleViewBook = () => {
    if (book) {
      navigation.navigate('BookViewer', { bookId: book.id });
    }
  };

  const handleBackToHome = () => {
    navigation.navigate('BookLibrary');
  };

  useEffect(() => {
    loadBookStatus();
  }, [bookId, token]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading book status...</Text>
      </View>
    );
  }

  if (!book) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Book not found</Text>
        <TouchableOpacity style={styles.button} onPress={handleBackToHome}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getProgressColor = () => {
    if (book.status === 'completed') return '#10b981';
    if (book.status === 'failed') return '#ef4444';
    return '#3b82f6';
  };

  const getEstimatedTimeRemaining = () => {
    if (book.status === 'completed') return null;
    if (book.status === 'failed') return null;
    
    const progress = book.progress_percentage || 0;
    if (progress < 20) return '10-15 minutes';
    if (progress < 50) return '8-12 minutes';
    if (progress < 80) return '3-8 minutes';
    return '1-3 minutes';
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📚 {book.title}</Text>
        <Text style={styles.subtitle}>Book Creation Progress</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusMessage}>
            {STATUS_MESSAGES[book.status] || book.status}
          </Text>
          <Text style={styles.statusDescription}>
            {STATUS_DESCRIPTIONS[book.status] || 'Processing your book...'}
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBackground}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${book.progress_percentage || 0}%`,
                  backgroundColor: getProgressColor()
                }
              ]} 
            />
          </View>
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
        {book.status === 'failed' && book.error_message && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Error Details:</Text>
            <Text style={styles.errorMessage}>{book.error_message}</Text>
          </View>
        )}

        {/* Book Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>📋 Book Details</Text>
          <Text style={styles.detailItem}>
            Story: {book.story_source === 'template' ? `Template (${book.template_key || 'prebuilt'})` : 'Custom Story'}
          </Text>
          <Text style={styles.detailItem}>Age Group: {book.target_age || 'n/a'} years</Text>
          <Text style={styles.detailItem}>Pages: {book.page_count}</Text>
          <Text style={styles.detailItem}>
            Created: {new Date(book.created_at).toLocaleDateString()}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {book.status === 'completed' && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.primaryButton]} 
              onPress={handleViewBook}
            >
              <Text style={styles.primaryButtonText}>📖 View Book</Text>
            </TouchableOpacity>
          )}
          
          {book.status === 'failed' && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.retryButton]} 
              onPress={handleRetry}
              disabled={retrying}
            >
              {retrying ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryButtonText}>🔄 Try Again</Text>
              )}
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.secondaryButton]} 
            onPress={handleBackToHome}
          >
            <Text style={styles.secondaryButtonText}>← Back to Library</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Creation Process Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>🔍 What's Happening?</Text>
        
        <View style={styles.processStep}>
          <Text style={[styles.processIcon, book.progress_percentage >= 20 && styles.processIconComplete]}>
            {book.progress_percentage >= 20 ? '✅' : '📖'}
          </Text>
          <View style={styles.processContent}>
            <Text style={styles.processTitle}>Story Generation</Text>
            <Text style={styles.processDescription}>
              AI creates a unique story based on your character and preferences
            </Text>
          </View>
        </View>

        <View style={styles.processStep}>
          <Text style={[styles.processIcon, book.progress_percentage >= 80 && styles.processIconComplete]}>
            {book.progress_percentage >= 80 ? '✅' : '🎨'}
          </Text>
          <View style={styles.processContent}>
            <Text style={styles.processTitle}>Illustration Creation</Text>
            <Text style={styles.processDescription}>
              ComfyUI generates beautiful artwork for each page
            </Text>
          </View>
        </View>

        <View style={styles.processStep}>
          <Text style={[styles.processIcon, book.status === 'completed' && styles.processIconComplete]}>
            {book.status === 'completed' ? '✅' : '📚'}
          </Text>
          <View style={styles.processContent}>
            <Text style={styles.processTitle}>Book Assembly</Text>
            <Text style={styles.processDescription}>
              Combining text and images into a professional PDF
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9ff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9ff',
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    marginBottom: 20,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e7ff',
  },
  title: {
    fontSize: 24,
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
  statusCard: {
    margin: 15,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusHeader: {
    marginBottom: 20,
  },
  statusMessage: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    marginBottom: 15,
  },
  progressBackground: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  timeEstimate: {
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  timeEstimateText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 5,
  },
  errorMessage: {
    fontSize: 14,
    color: '#dc2626',
  },
  detailsCard: {
    backgroundColor: '#f9fafb',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  detailItem: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 4,
  },
  actionsContainer: {
    gap: 10,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#10b981',
  },
  retryButton: {
    backgroundColor: '#f59e0b',
  },
  secondaryButton: {
    backgroundColor: '#6b7280',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: 'white',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    margin: 15,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 15,
  },
  processStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  processDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 18,
  },
});
