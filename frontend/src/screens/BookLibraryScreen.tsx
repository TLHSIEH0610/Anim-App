import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Alert, RefreshControl, Share, Platform } from "react-native";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  Chip,
  ProgressBar,
  Portal,
  Dialog,
} from "react-native-paper";
import {
  getBookList,
  deleteBook,
  adminRegenerateBook,
  Book,
  getBookCoverUrl,
  getBookPdfUrl,
  getBookCoverThumbUrl,
} from "../api/books";
import { useAuth } from "../context/AuthContext";
import {
  colors,
  radii,
  shadow,
  spacing,
  statusColors,
  typography,
} from "../styles/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/types";
import ScreenWrapper from "../components/ScreenWrapper";
import BottomNav from "../components/BottomNav";
import Card from "../components/Card";
import Button from "../components/Button";
import Header from "../components/Header";
import * as FileSystem from "expo-file-system";
const BLURHASH = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

const STATUS_COLORS: Record<string, string> = {
  ...statusColors,
  generating_images: "#8b5cf6",
};

const STATUS_LABELS: Record<string, string> = {
  creating: "🚀 Starting...",
  generating_story: "📖 Writing story...",
  generating_images: "🎨 Creating art...",
  composing: "📚 Assembling...",
  completed: "✅ Ready!",
  failed: "❌ Failed",
};

type BookLibraryScreenProps = NativeStackScreenProps<
  AppStackParamList,
  "BookLibrary"
>;

function BookListCard({
  book,
  token,
  userRole,
  onPress,
  onDelete,
  onRegenerate,
}: {
  book: Book;
  token?: string | null;
  userRole?: string | null;
  onPress: (book: Book) => void;
  onDelete: (book: Book) => void;
  onRegenerate: (book: Book) => void;
}) {
  const [imgWidth, setImgWidth] = useState<number>(130);
  const targetHeight = 140;

  const coverUri = getBookCoverThumbUrl(
    book.id,
    token || undefined,
    320,
    book.completed_at || book.updated_at || book.created_at
  );

  const handleImageLoad = (e: any) => {
    const natW = e?.nativeEvent?.source?.width;
    const natH = e?.nativeEvent?.source?.height;
    if (natW && natH) {
      // Scale width to maintain aspect at targetHeight
      const scaled = Math.max(
        100,
        Math.min(200, Math.round((targetHeight / natH) * natW))
      );
      // Slightly larger than the exact photo width
      setImgWidth(scaled + 8);
    }
  };

  return (
    <Card style={styles.bookItem}>
      <View>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.bookTitle,
              { flex: 1, marginRight: spacing(2), marginBottom: 0 },
            ]}
            numberOfLines={1}
          >
            {book.title}
          </Text>
          <Chip
            compact
            style={{
              backgroundColor: STATUS_COLORS[book.status] || colors.textMuted,
            }}
            textStyle={{ color: "#fff", fontWeight: "600" }}
          >
            {STATUS_LABELS[book.status] || book.status}
          </Chip>
        </View>
      </View>

      {/* Content row: cover (auto width) | details (flex) */}
      <View style={styles.row}>
        <View style={styles.leftCol}>
          {book.status === "completed" ? (
            <View style={[styles.coverThumbWrap, { width: imgWidth }]}>
              <Image
                source={{ uri: coverUri }}
                style={[
                  styles.coverThumb,
                  { width: imgWidth - 8, height: targetHeight },
                ]}
                contentFit="contain"
                cachePolicy="memory-disk"
                placeholder={{ blurhash: BLURHASH }}
                transition={150}
                onLoad={handleImageLoad}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.rightCol}>
          {/* Status row with actions (chip moved to title row) */}
          <View style={styles.bookStatus}>
            {book.status !== "completed" && book.status !== "failed" && (
              <View style={styles.progressBar}>
                <ProgressBar
                  progress={(book.progress_percentage || 0) / 100}
                  color={STATUS_COLORS[book.status] || colors.textMuted}
                />
              </View>
            )}
            {false && (
              <>
                <Button
                  title="View"
                  onPress={() => onPress(book)}
                  variant="primary"
                  size="sm"
                  // leftIcon={
                  //   <MaterialCommunityIcons
                  //     name="eye"
                  //     size={18}
                  //     color={colors.surface}
                  //   />
                  // }
                />
                <Button
                  title="Download"
                  onPress={async () => {
                    try {
                      const pdfUrl = getBookPdfUrl(book.id);
                      const fileName = `${(book.title || "book")
                        .replace(/[^a-z0-9]+/gi, "_")
                        .toLowerCase()}.pdf`;
                      const destinationPath = `${
                        FileSystem.cacheDirectory ??
                        FileSystem.documentDirectory ??
                        ""
                      }${fileName}`;
                      const downloadResult = await FileSystem.downloadAsync(
                        pdfUrl,
                        destinationPath,
                        token
                          ? { headers: { Authorization: `Bearer ${token}` } }
                          : undefined
                      );
                      if (Platform.OS === "android") {
                        try {
                          const permissions =
                            await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                          if (!permissions.granted) {
                            Alert.alert(
                              "Permission required",
                              "Storage permission is required to save the PDF."
                            );
                            return;
                          }
                          const targetUri =
                            await FileSystem.StorageAccessFramework.createFileAsync(
                              permissions.directoryUri,
                              fileName,
                              "application/pdf"
                            );
                          const fileBase64 = await FileSystem.readAsStringAsync(
                            downloadResult.uri,
                            { encoding: FileSystem.EncodingType.Base64 }
                          );
                          await FileSystem.writeAsStringAsync(
                            targetUri,
                            fileBase64,
                            { encoding: FileSystem.EncodingType.Base64 }
                          );
                          Alert.alert(
                            "Saved",
                            "PDF saved to the folder you selected."
                          );
                        } catch (e) {
                          Alert.alert("Save failed", "Could not save the PDF.");
                        }
                      } else {
                        await Share.share({
                          url: downloadResult.uri,
                          title: book.title,
                          message: `Your book "${book.title}" is ready as a PDF.`,
                        });
                      }
                    } catch (err) {
                      Alert.alert(
                        "Download failed",
                        "Unable to download PDF. Please try again."
                      );
                    }
                  }}
                  variant="info"
                  size="sm"
                  // leftIcon={
                  //   <MaterialCommunityIcons
                  //     name="download"
                  //     size={18}
                  //     color={colors.textPrimary}
                  //   />
                  // }
                />
              </>
            )}
          </View>
          {/* Details + admin actions */}
          <View style={styles.detailsHeader}>
            <Text
              style={[styles.bookDetails, { flex: 1, marginRight: spacing(2) }]}
              numberOfLines={2}
            >
              {book.story_source === "template"
                ? `Template (${book.template_key || "story"})`
                : "Custom Story"}{" "}
              • {book.target_age || "n/a"} years • {book.page_count} pages
            </Text>
            <View style={styles.detailsActions}>
              {userRole === "admin" || userRole === "superadmin" ? (
                <Button
                  title="🔄"
                  onPress={() => onRegenerate(book)}
                  variant="secondary"
                />
              ) : null}
            </View>
          </View>

          <Text style={styles.bookDate}>
            Created: {new Date(book.created_at).toLocaleDateString()}
          </Text>
          {book.status === "failed" && book.error_message && (
            <Text style={styles.errorText} numberOfLines={2}>
              Error: {book.error_message}
            </Text>
          )}

          <View style={styles.bottomRow}>
            <View style={styles.primaryActions}>
              {book.status === "completed" && (
                <>
                  <Button
                    title="View"
                    onPress={() => onPress(book)}
                    variant="primary"
                    size="sm"
                  />
                  <Button
                    title="Download"
                    onPress={async () => {
                      try {
                        const pdfUrl = getBookPdfUrl(book.id);
                        const fileName = `${(book.title || "book")
                          .replace(/[^a-z0-9]+/gi, "_")
                          .toLowerCase()}.pdf`;
                        const destinationPath = `${
                          FileSystem.cacheDirectory ??
                          FileSystem.documentDirectory ??
                          ""
                        }${fileName}`;
                        const downloadResult = await FileSystem.downloadAsync(
                          pdfUrl,
                          destinationPath,
                          token
                            ? { headers: { Authorization: `Bearer ${token}` } }
                            : undefined
                        );
                        if (Platform.OS === "android") {
                          try {
                            const permissions =
                              await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                            if (!permissions.granted) {
                              Alert.alert(
                                "Permission required",
                                "Storage permission is required to save the PDF."
                              );
                              return;
                            }
                            const targetUri =
                              await FileSystem.StorageAccessFramework.createFileAsync(
                                permissions.directoryUri,
                                fileName,
                                "application/pdf"
                              );
                            const fileBase64 =
                              await FileSystem.readAsStringAsync(
                                downloadResult.uri,
                                { encoding: FileSystem.EncodingType.Base64 }
                              );
                            await FileSystem.writeAsStringAsync(
                              targetUri,
                              fileBase64,
                              { encoding: FileSystem.EncodingType.Base64 }
                            );
                            Alert.alert(
                              "Saved",
                              "PDF saved to the folder you selected."
                            );
                          } catch (e) {
                            Alert.alert(
                              "Save failed",
                              "Could not save the PDF."
                            );
                          }
                        } else {
                          await Share.share({
                            url: downloadResult.uri,
                            title: book.title,
                            message: `Your book \"${book.title}\" is ready as a PDF.`,
                          });
                        }
                      } catch (err) {
                        Alert.alert(
                          "Download failed",
                          "Unable to download PDF. Please try again."
                        );
                      }
                    }}
                    variant="info"
                    size="sm"
                  />
                </>
              )}
            </View>
            {(userRole === "admin" || userRole === "superadmin") && (
              <View>
                <Button
                  title="🗑️"
                  onPress={() => onDelete(book)}
                  variant="danger"
                  size="sm"
                />
              </View>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

export default function BookLibraryScreen({
  navigation,
}: BookLibraryScreenProps) {
  const { user, token, logout } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState<{
    visible: boolean;
    type: "delete" | "regenerate" | null;
    book: Book | null;
  }>({ visible: false, type: null, book: null });

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
      console.error("Error loading books:", error);
      Alert.alert("Error", "Failed to load your books");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Creation now starts from Books list

  const handleBookPress = (book: Book) => {
    if (book.status === "completed") {
      navigation.navigate("BookViewer", { bookId: book.id });
    } else {
      navigation.navigate("BookStatus", { bookId: book.id });
    }
  };

  const handleDeleteBook = (book: Book) => {
    setConfirm({ visible: true, type: "delete", book });
  };

  const handleRegenerateBook = (book: Book) => {
    setConfirm({ visible: true, type: "regenerate", book });
  };

  const performConfirm = async () => {
    if (!confirm.book || !confirm.type) return;
    try {
      if (!token) {
        return;
      }
      if (confirm.type === "delete") {
        await deleteBook(token, confirm.book.id);
      } else if (confirm.type === "regenerate") {
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
    <BookListCard
      book={book}
      token={token}
      userRole={user?.role ?? null}
      onPress={handleBookPress}
      onDelete={handleDeleteBook}
      onRegenerate={handleRegenerateBook}
    />
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
      const hasInProgressBooks = books.some(
        (book) => !["completed", "failed"].includes(book.status)
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
        <Dialog
          visible={confirm.visible}
          onDismiss={() =>
            setConfirm({ visible: false, type: null, book: null })
          }
        >
          <Dialog.Title>
            {confirm.type === "delete" ? "Delete Book" : "Regenerate Book"}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {confirm.type === "delete"
                ? `Are you sure you want to delete "${confirm.book?.title}"? This action cannot be undone.`
                : `This will completely regenerate "${confirm.book?.title}" with new story and images. This action cannot be undone.`}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() =>
                setConfirm({ visible: false, type: null, book: null })
              }
            />
            <Button
              title={confirm.type === "delete" ? "Delete" : "Regenerate"}
              variant="danger"
              onPress={performConfirm}
            />
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Header title="My Books" subtitle="Your collection of magical stories" />

      <FlatList
        data={books}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderBookItem}
        contentContainerStyle={
          books.length === 0 ? styles.emptyListContainer : styles.listContainer
        }
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
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: spacing(2.5),
    ...typography.body,
    textAlign: "center",
    color: colors.textPrimary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing(4),
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing(3),
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing(1),
  },
  userEmail: {
    ...typography.caption,
    color: colors.textMuted,
  },
  logoutButton: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: radii.md,
  },
  historyButton: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: radii.md,
    marginRight: spacing(3),
  },
  historyButtonText: {
    color: colors.primaryDark,
    fontWeight: "600",
    fontSize: 14,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoutButtonText: {
    color: colors.danger,
    fontWeight: "600",
    fontSize: 14,
  },
  titleSection: { paddingVertical: spacing(1), alignItems: "center" },
  listContainer: {
    paddingBottom: spacing(28),
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: "center",
  },
  bookItem: {
    marginBottom: spacing(3),
    // backgroundColor: "#FFF8E1",
    backgroundColor: "#EAF4E2",
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadow.subtle,
  },
  coverThumbWrap: {
    width: "100%",
    backgroundColor: colors.neutral100,
    borderRadius: radii.md,
    overflow: "hidden",
    alignSelf: "flex-start",
    alignItems: "center",
    padding: spacing(1),
  },
  coverThumb: {
    height: 140,
    borderRadius: radii.md,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing(2),
  },
  titleActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing(1),
  },
  detailsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    flexShrink: 0,
  },
  primaryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    marginTop: spacing(2),
  },
  bottomRow: {
    marginTop: spacing(2),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row: {
    flexDirection: "row",
    gap: spacing(3),
    alignItems: "flex-start",
  },
  leftCol: {
    flexShrink: 0,
    marginRight: spacing(2),
  },
  rightCol: {
    flex: 1,
  },
  bookHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing(2.5),
  },
  bookTitleContainer: {
    flex: 1,
    paddingRight: spacing(2),
  },
  bookTitle: {
    ...typography.headingM,
    marginBottom: spacing(1),
    // color: colors.textPrimary,
    color: "#333333",
  },
  bookDetails: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bookStatus: {
    flexDirection: "row",
    alignItems: "center",
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
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radii.md,
    alignSelf: "flex-start",
  },
  completedText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: "rgba(239, 83, 80, 0.1)",
    padding: spacing(2),
    borderRadius: radii.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(6),
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing(3),
  },
  emptyTitle: {
    ...typography.headingL,
    textAlign: "center",
    marginBottom: spacing(2),
    color: colors.textPrimary,
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing(5),
    color: colors.textSecondary,
  },
  createFirstBookButton: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    borderRadius: radii.pill,
    ...shadow.subtle,
  },
  createFirstBookText: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    right: spacing(6),
    bottom: spacing(6),
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    ...shadow.card,
  },
  fabText: {
    color: colors.surface,
    fontSize: 28,
    marginTop: -4,
  },
});
