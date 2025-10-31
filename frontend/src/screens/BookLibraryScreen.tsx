import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { ActivityIndicator, Chip, ProgressBar, Portal, Dialog } from 'react-native-paper';
import { getBookList, deleteBook, adminRegenerateBook, Book } from '../api/books';
import { useAuth } from '../context/AuthContext';
import { colors, radii, shadow, spacing, statusColors, typography } from '../styles/theme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../navigation/types';
import ScreenWrapper from '../components/ScreenWrapper';
import BottomNav from '../components/BottomNav';
import Card from '../components/Card';
import Button from '../components/Button';
import Header from '../components/Header';
import { TouchableRipple } from 'react-native-paper';

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
  const [confirm, setConfirm] = useState<{ visible: boolean; type: 'delete' | 'regenerate' | null; book: Book | null }>({ visible: false, type: null, book: null });

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
    setConfirm({ visible: true, type: 'delete', book });
  };

  const handleRegenerateBook = (book: Book) => {
    setConfirm({ visible: true, type: 'regenerate', book });
  };

  const performConfirm = async () => {
    if (!confirm.book || !confirm.type) return;
    try {
      if (!token) {
        return;
      }
      if (confirm.type === 'delete') {
        await deleteBook(token, confirm.book.id);
      } else if (confirm.type === 'regenerate') {
        await adminRegenerateBook(token, confirm.book.id);
      }
      setConfirm({ visible: false, type: null, book: null });
      loadBooks();
    } catch (error) {
      setConfirm({ visible: false, type: null, book: null });
    }
  };

  // Logout moved to Account tab

  // Billing moved to Account screen

  const renderBookItem = ({ item: book }: { item: Book }) => (
    <Card style={styles.bookItem}>
        <TouchableRipple onPress={() => handleBookPress(book)}>
          <View>
            <View style={styles.bookHeader}>
                <View style={styles.bookTitleContainer}>
                <Text style={styles.bookTitle}>{book.title}</Text>
                <Text style={styles.bookDetails}>
                    {book.story_source === 'template' ? `Template (${book.template_key || 'story'})` : 'Custom Story'} • {book.target_age || 'n/a'} years • {book.page_count} pages
                </Text>
                </View>
                
                {user?.role === 'admin' || user?.role === 'superadmin' ? (
                  <Button
                    title="🔄"
                    onPress={() => handleRegenerateBook(book)}
                    variant="secondary"
                  />
                ) : null}
                
                <Button
                  title="🗑️"
                  onPress={() => handleDeleteBook(book)}
                  variant="danger"
                />
            </View>
            
            <View style={styles.bookStatus}>
              <Chip compact style={{ backgroundColor: STATUS_COLORS[book.status] || colors.textMuted }} textStyle={{ color: '#fff', fontWeight: '600' }}>
                {STATUS_LABELS[book.status] || book.status}
              </Chip>
              {book.status !== 'completed' && book.status !== 'failed' && (
                <View style={styles.progressBar}>
                  <ProgressBar progress={(book.progress_percentage || 0) / 100} color={STATUS_COLORS[book.status] || colors.textMuted} />
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
          </View>
        </TouchableRipple>
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
                <ActivityIndicator />
                <Text style={styles.loadingText}>Loading your library...</Text>
            </View>
        </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper footer={<BottomNav active="purchased" />}>
      <Portal>
        <Dialog visible={confirm.visible} onDismiss={() => setConfirm({ visible: false, type: null, book: null })}>
          <Dialog.Title>{confirm.type === 'delete' ? 'Delete Book' : 'Regenerate Book'}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {confirm.type === 'delete'
                ? `Are you sure you want to delete "${confirm.book?.title}"? This action cannot be undone.`
                : `This will completely regenerate "${confirm.book?.title}" with new story and images. This action cannot be undone.`}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button title="Cancel" variant="secondary" onPress={() => setConfirm({ visible: false, type: null, book: null })} />
            <Button title={confirm.type === 'delete' ? 'Delete' : 'Regenerate'} variant="danger" onPress={performConfirm} />
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Header title="My Books" subtitle="Your collection of magical stories" />

      <FlatList
        data={books}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderBookItem}
        contentContainerStyle={books.length === 0 ? styles.emptyListContainer : styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadBooks(true)}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
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
    color: colors.textMuted,
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
    color: colors.primaryDark,
    fontWeight: '600',
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: colors.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  titleSection: { paddingVertical: spacing(1), alignItems: 'center' },
  listContainer: {
    paddingBottom: spacing(28),
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  bookItem: {
    marginBottom: spacing(3),
    backgroundColor: '#FFF8E1',
    borderRadius: radii.lg,
    overflow: 'hidden',
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
    color: colors.textPrimary,
  },
  bookDetails: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bookStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing(2),
    gap: spacing(3),
  },
  progressBar: {
    flex: 1,
  },
  bookDate: {
    ...typography.caption,
    marginBottom: spacing(2),
    color: colors.textSecondary,
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
    color: colors.textPrimary,
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing(5),
    color: colors.textSecondary,
  },
  createFirstBookButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    borderRadius: radii.pill,
    ...shadow.subtle,
  },
  createFirstBookText: {
    color: colors.textPrimary,
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
