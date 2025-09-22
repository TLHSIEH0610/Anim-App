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

const STATUS_COLORS = {
  creating: '#f59e0b',
  generating_story: '#3b82f6',
  generating_images: '#8b5cf6',
  composing: '#06b6d4',
  completed: '#10b981',
  failed: '#ef4444',
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
            {book.theme} • {book.target_age} years • {book.page_count} pages
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e7ff',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#6b7280',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  titleSection: {
    padding: 20,
    paddingBottom: 10,
  },
  libraryTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 5,
  },
  librarySubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100, // Space for FAB
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  bookItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  bookTitleContainer: {
    flex: 1,
  },
  bookTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  bookDetails: {
    fontSize: 14,
    color: '#6b7280',
  },
  regenerateButton: {
    padding: 8,
    marginRight: 4,
  },
  regenerateButtonText: {
    fontSize: 16,
    color: '#ef4444',
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  bookStatus: {
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  bookDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  completedIndicator: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  completedText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  createFirstBookButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
  },
  createFirstBookText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
});