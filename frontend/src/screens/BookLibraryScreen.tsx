import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { getBookList, deleteBook, adminRegenerateBook, Book } from '../api/books';
import { useAuth } from '../context/AuthContext';
import { colors, radii, shadow, spacing, statusColors, typography } from '../styles/theme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../navigation/types';
import ScreenWrapper from '../components/ScreenWrapper';
import BottomNav from '../components/BottomNav';
import Card from '../components/Card';

const STATUS_COLORS: Record<string, string> = {
  ...statusColors,
  generating_images: '#8b5cf6',
};

const STATUS_LABELS: Record<string, string> = {
  creating: '🚀 Starting...',
  generating_story: '📖 Writing story...',
  generating_images: '🎨 Creating art...',
  composing: '📚 Assembling...',
  completed: '✅ Ready!',
  failed: '❌ Failed',
};

type BookLibraryScreenProps = NativeStackScreenProps<AppStackParamList, 'BookLibrary'>;

export default function BookLibraryScreen({ navigation }: BookLibraryScreenProps) {
  const { user, token, logout } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBooks = async (isRefresh = false) => {
    if (!token) return;
    
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const response = await getBookList(token);
      setBooks(response.books || []);
    } catch (error) {
      console.error('Error loading books:', error);
      Alert.alert('Error', 'Failed to load your books');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Creation now starts from Books list

  const handleBookPress = (book: Book) => {
    if (book.status === 'completed') {
      navigation.navigate('BookViewer', { bookId: book.id });
    } else {
      navigation.navigate('BookStatus', { bookId: book.id });
    }
  };

  const handleDeleteBook = (book: Book) => {
    Alert.alert(
      'Delete Book',
      `Are you sure you want to delete "${book.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!token) {
                Alert.alert('Error', 'Session expired. Please log in again.');
                return;
              }
              await deleteBook(token, book.id);
              Alert.alert('Success', 'Book deleted successfully');
              loadBooks(); // Refresh the list
            } catch (error) {
              Alert.alert('Error', 'Failed to delete book');
            }
          },
        },
      ]
    );
  };

  const handleRegenerateBook = (book: Book) => {
    Alert.alert(
      'Regenerate Book',
      `This will completely regenerate "${book.title}" with new story and images. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!token) {
                Alert.alert('Error', 'Session expired. Please log in again.');
                return;
              }
              await adminRegenerateBook(token, book.id);
              Alert.alert('Success', 'Book regeneration started! Check the status page to monitor progress.');
              loadBooks(); // Refresh the list
            } catch (error) {
              Alert.alert('Error', 'Failed to regenerate book');
            }
          },
        },
      ]
    );
  };

  // Logout moved to Account tab

  // Billing moved to Account screen

  const renderBookItem = ({ item: book }: { item: Book }) => (
    <Card style={styles.bookItem}>
        <TouchableOpacity onPress={() => handleBookPress(book)}>
            <View style={styles.bookHeader}>
                <View style={styles.bookTitleContainer}>
                <Text style={styles.bookTitle}>{book.title}</Text>
                <Text style={styles.bookDetails}>
                    {book.story_source === 'template' ? `Template (${book.template_key || 'story'})` : 'Custom Story'} • {book.target_age || 'n/a'} years • {book.page_count} pages
                </Text>
                </View>
                
                <TouchableOpacity
                style={styles.regenerateButton}
                onPress={() => handleRegenerateBook(book)}
                >
                <Text style={styles.regenerateButtonText}>🔄</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteBook(book)}
                >
                <Text style={styles.deleteButtonText}>🗑️</Text>
                </TouchableOpacity>
            </View>
            
            <View style={styles.bookStatus}>
                <View style={[
                styles.statusBadge, 
                { backgroundColor: STATUS_COLORS[book.status] || '#6b7280' }
                ]}>
                <Text style={styles.statusText}>
                    {STATUS_LABELS[book.status] || book.status}
                </Text>
                </View>
                
                {book.status !== 'completed' && book.status !== 'failed' && (
                <View style={styles.progressBar}>
                    <View 
                    style={[
                        styles.progressFill, 
                        { 
                        width: `${book.progress_percentage || 0}%`,
                        backgroundColor: STATUS_COLORS[book.status] || '#6b7280'
                        }
                    ]} 
                    />
                </View>
                )}
            </View>
            
            <Text style={styles.bookDate}>
                Created: {new Date(book.created_at).toLocaleDateString()}
            </Text>
            
            {book.status === 'completed' && (
                <View style={styles.completedIndicator}>
                <Text style={styles.completedText}>📖 Tap to read</Text>
                </View>
            )}
            
            {book.status === 'failed' && book.error_message && (
                <Text style={styles.errorText} numberOfLines={2}>
                Error: {book.error_message}
                </Text>
            )}
        </TouchableOpacity>
    </Card>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📚</Text>
      <Text style={styles.emptyTitle}>No Books Yet</Text>
      <Text style={styles.emptySubtitle}>
        Your purchased books will appear here once created.
      </Text>
    </View>
  );

  useEffect(() => {
    loadBooks();
    
    const interval = setInterval(() => {
      const hasInProgressBooks = books.some(book => 
        !['completed', 'failed'].includes(book.status)
      );
      
      if (hasInProgressBooks) {
        loadBooks(true); // Refresh in background
      }
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }, [token]);

  if (loading && books.length === 0) {
    return (
        <ScreenWrapper>
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Loading your library...</Text>
            </View>
        </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>

        <View style={styles.titleSection}>
          <Text style={styles.libraryTitle}>📚 My Books</Text>
          <Text style={styles.librarySubtitle}>
            Your collection of magical stories
          </Text>
        </View>

      <FlatList
        data={books}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderBookItem}
        contentContainerStyle={books.length === 0 ? styles.emptyListContainer : styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadBooks(true)}
            colors={['#3b82f6']}
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
      <BottomNav active="purchased" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing(2.5),
    ...typography.body,
    textAlign: 'center',
    color: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing(4),
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(3),
  },
  avatarText: {
    color: '#333',
    fontSize: 18,
    fontWeight: '600',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: spacing(1),
  },
  userEmail: {
    ...typography.caption,
    color: '#666',
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: radii.md,
  },
  historyButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: radii.md,
    marginRight: spacing(3),
  },
  historyButtonText: {
    color: '#1e88e5',
    fontWeight: '600',
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#dd2c00',
    fontWeight: '600',
    fontSize: 14,
  },
  titleSection: {
    paddingVertical: spacing(5),
    alignItems: 'center',
  },
  libraryTitle: {
    ...typography.headingXL,
    color: '#333',
    marginBottom: spacing(2),
  },
  librarySubtitle: {
    ...typography.body,
    color: '#555',
  },
  listContainer: {
    paddingBottom: spacing(28),
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  bookItem: {
    marginBottom: spacing(3),
  },
  bookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing(2.5),
  },
  bookTitleContainer: {
    flex: 1,
    paddingRight: spacing(2),
  },
  bookTitle: {
    ...typography.headingM,
    marginBottom: spacing(1),
    color: '#333',
  },
  bookDetails: {
    ...typography.caption,
    color: '#666',
  },
  regenerateButton: {
    padding: spacing(1.5),
    marginRight: spacing(1),
  },
  regenerateButtonText: {
    fontSize: 16,
  },
  deleteButton: {
    padding: spacing(1.5),
  },
  deleteButtonText: {
    fontSize: 16,
  },
  bookStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing(2),
    gap: spacing(3),
  },
  statusBadge: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '600',
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  bookDate: {
    ...typography.caption,
    marginBottom: spacing(2),
    color: '#666',
  },
  completedIndicator: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radii.md,
    alignSelf: 'flex-start',
  },
  completedText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: 'rgba(239, 83, 80, 0.1)',
    padding: spacing(2),
    borderRadius: radii.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(6),
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing(3),
  },
  emptyTitle: {
    ...typography.headingL,
    textAlign: 'center',
    marginBottom: spacing(2),
    color: '#333',
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing(5),
    color: '#555',
  },
  createFirstBookButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    borderRadius: radii.pill,
    ...shadow.subtle,
  },
  createFirstBookText: {
    color: '#333',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: spacing(6),
    bottom: spacing(6),
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.card,
  },
  fabText: {
    color: colors.surface,
    fontSize: 28,
    marginTop: -4,
  },
});
