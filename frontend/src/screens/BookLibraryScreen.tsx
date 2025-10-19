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

const STATUS_COLORS = {
  ...statusColors,
  generating_images: '#8b5cf6',
};

const STATUS_LABELS = {
  creating: '🚀 Starting...',
  generating_story: '📖 Writing story...',
  generating_images: '🎨 Creating art...',
  composing: '📚 Assembling...',
  completed: '✅ Ready!',
  failed: '❌ Failed',
};

export default function BookLibraryScreen({ navigation }) {
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

  const handleCreateNewBook = () => {
    navigation.navigate('BookCreation');
  };

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

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: logout },
      ]
    );
  };

  const renderBookItem = ({ item: book }: { item: Book }) => (
    <TouchableOpacity 
      style={styles.bookItem}
      onPress={() => handleBookPress(book)}
    >
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
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📚</Text>
      <Text style={styles.emptyTitle}>No Books Yet</Text>
      <Text style={styles.emptySubtitle}>
        Create your first children's book by uploading a photo and adding your story ideas!
      </Text>
      <TouchableOpacity style={styles.createFirstBookButton} onPress={handleCreateNewBook}>
        <Text style={styles.createFirstBookText}>✨ Create Your First Book</Text>
      </TouchableOpacity>
    </View>
  );

  useEffect(() => {
    loadBooks();
    
    // Set up auto-refresh for in-progress books
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading your library...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
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
      </View>

      {/* Create New Book Button */}
      <TouchableOpacity style={styles.fab} onPress={handleCreateNewBook}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing(2.5),
    ...typography.body,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing(6),
    paddingTop: spacing(14),
    paddingBottom: spacing(6),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
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
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(3),
  },
  avatarText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '600',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing(1),
  },
  userEmail: {
    ...typography.caption,
  },
  logoutButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: radii.md,
  },
  logoutButtonText: {
    color: colors.surface,
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  titleSection: {
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(5),
  },
  libraryTitle: {
    ...typography.headingXL,
    color: colors.primaryDark,
    marginBottom: spacing(2),
  },
  librarySubtitle: {
    ...typography.body,
  },
  listContainer: {
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(28),
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing(6),
  },
  bookItem: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing(4),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.neutral200,
    ...shadow.subtle,
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
  },
  bookDetails: {
    ...typography.caption,
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
    backgroundColor: colors.neutral200,
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
  },
  completedIndicator: {
    backgroundColor: '#ecfdf5',
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
    backgroundColor: '#fef2f2',
    padding: spacing(2),
    borderRadius: radii.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
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
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing(5),
  },
  createFirstBookButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    borderRadius: radii.pill,
    ...shadow.subtle,
  },
  createFirstBookText: {
    color: colors.surface,
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
