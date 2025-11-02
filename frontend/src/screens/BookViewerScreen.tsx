import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Image, Dimensions, Share, Platform } from 'react-native';
import { ActivityIndicator as PaperActivityIndicator, TouchableRipple, Snackbar } from 'react-native-paper';
import { getBookPreview, getBookPdfUrl, adminRegenerateBook, BookPreview } from '../api/books';
import { useAuth } from '../context/AuthContext';
import * as FileSystem from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { colors, radii, shadow, spacing, typography } from '../styles/theme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppStackParamList } from '../navigation/types';
import ScreenWrapper from '../components/ScreenWrapper';
import Header from '../components/Header';
import Button from '../components/Button';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width: screenWidth } = Dimensions.get('window');

type BookViewerScreenProps = NativeStackScreenProps<AppStackParamList, 'BookViewer'>;

export default function BookViewerScreen({ route, navigation }: BookViewerScreenProps) {
  const { bookId } = route.params;
  const { token, user } = useAuth();
  const [bookData, setBookData] = useState<BookPreview | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });

  const loadBookData = async () => {
    if (!token) return;
    
    try {
      const preview = await getBookPreview(token, bookId);
      console.log('📖 Book preview loaded:', {
        title: preview.title,
        pages: preview.pages?.length || 0,
        firstPageHasImage: !!preview.pages?.[0]?.image_data,
        firstPageImageLength: preview.pages?.[0]?.image_data?.length || 0,
        firstPageStatus: preview.pages?.[0]?.image_status
      });
      setBookData(preview);
    } catch (error: any) {
      console.error('Error loading book:', error);
      setSnackbar({ visible: true, message: 'Failed to load book preview' });
    } finally {
      setLoading(false);
    }
  };

  const downloadToDocumentDirectory = async (sourceUri: string, fileName: string) => {
    const destinationPath = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}${fileName}`;
    const downloadResult = await FileSystem.downloadAsync(
      sourceUri,
      destinationPath,
      token
        ? {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        : undefined
    );
    return downloadResult.uri;
  };

  const handleDownloadPdf = async () => {
    if (!bookData) return;

    try {
      setIsDownloading(true);
      const pdfUrl = getBookPdfUrl(bookId);
      const fileName = `${bookData.title?.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'book'}.pdf`;
      const localPath = await downloadToDocumentDirectory(pdfUrl, fileName);

      const originalBase64 = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const pdfDoc = await PDFDocument.load(originalBase64);
      if (pdfDoc.getPageCount() > 1) {
        pdfDoc.removePage(0);
      }
      const prunedBase64 = await pdfDoc.saveAsBase64({ dataUri: false });

      if (Platform.OS === 'android') {
        try {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!permissions.granted) {
            setSnackbar({ visible: true, message: 'Storage permission is required to save the PDF.' });
            return;
          }

          const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            fileName,
            'application/pdf'
          );

          await FileSystem.writeAsStringAsync(targetUri, prunedBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          setSnackbar({ visible: true, message: 'PDF saved to the folder you selected.' });
        } catch (androidError) {
          console.error('Android PDF save error:', androidError);
          setSnackbar({ visible: true, message: 'Could not save the PDF. Please try again.' });
        }
      } else {
        await FileSystem.writeAsStringAsync(localPath, prunedBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Share.share({
          url: localPath,
          title: bookData.title,
          message: `Your book "${bookData.title}" is ready as a PDF.`,
        });
      }
    } catch (error: any) {
      console.error('PDF download error:', error);
      setSnackbar({ visible: true, message: 'Unable to download PDF. Please try again.' });
    } finally {
      setIsDownloading(false);
    }
  };


  const handleShare = async () => {
    if (!bookData) {
      return;
    }

    try {
      const page = bookData.pages?.[currentPage];
      const messageParts: string[] = [];
      if (bookData.title) {
        messageParts.push(bookData.title.trim());
      }
      if (page?.text) {
        messageParts.push(page.text.trim());
      }
      const message = messageParts.length > 0
        ? messageParts.join('\n\n')
        : 'Check out this story!';

      await Share.share({
        title: bookData.title || 'My Storybook',
        message,
      });
    } catch (error: any) {
      console.error('Share error:', error);
      setSnackbar({ visible: true, message: 'Unable to open the share sheet.' });
    }
  };

  const handleAdminRegenerate = () => {
    if (!bookData) return;
    setSnackbar({ visible: true, message: 'Regeneration starting...' });
    (async () => {
      try {
        setLoading(true);
        if (!token) {
          setSnackbar({ visible: true, message: 'Session expired. Please log in again.' });
          setLoading(false);
          return;
        }
        await adminRegenerateBook(token, bookId);
        setSnackbar({ visible: true, message: 'Book regeneration started!' });
        await loadBookData();
      } catch (error: any) {
        console.error('Error regenerating book:', error);
        setSnackbar({ visible: true, message: 'Failed to regenerate book. Please try again.' });
      } finally {
        setLoading(false);
      }
    })();
  };

  const goToNextPage = () => {
    if (bookData && currentPage < bookData.pages.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToPage = (pageIndex: number) => {
    if (bookData && pageIndex >= 0 && pageIndex < bookData.pages.length) {
      setCurrentPage(pageIndex);
    }
  };

  useEffect(() => {
    loadBookData();
  }, [bookId, token]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <PaperActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading your book...</Text>
      </View>
    );
  }

  if (!bookData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Book not found or failed to load</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="secondary" />
      </View>
    );
  }

  const currentPageData = bookData.pages[currentPage];
  const isCoverPage = currentPageData?.page_number === 0 || currentPage === 0;

  return (
    <ScreenWrapper>
    <View style={styles.container}>
      <Header title={bookData.title} showBack  />

      {/* Book Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.bookPage}>
          {/* Image Section */}
          <View style={[styles.imageSection, isCoverPage && styles.imageSectionCover]}>
            {(() => {
              console.log(`🖼️ Page ${currentPage + 1} render:`, {
                hasImageData: !!currentPageData?.image_data,
                imageDataLength: currentPageData?.image_data?.length || 0,
                imageStatus: currentPageData?.image_status,
                imageDataPreview: currentPageData?.image_data?.substring(0, 50) || 'none'
              });
              
              if (currentPageData?.image_data) {
                return (
                  <Image
                    source={{ uri: currentPageData.image_data }}
                    style={isCoverPage ? styles.pageImageCover : styles.pageImage}
                    resizeMode={isCoverPage ? 'cover' : 'contain'}
                    onLoadStart={() => {
                      console.log('🔄 Started loading image for page', currentPage + 1);
                      setImageLoading(prev => ({ ...prev, [currentPage]: true }));
                    }}
                    onLoadEnd={() => {
                      console.log('✅ Successfully loaded image for page', currentPage + 1);
                      setImageLoading(prev => ({ ...prev, [currentPage]: false }));
                    }}
                    onError={(error) => {
                      console.log('❌ Failed to load image for page', currentPage + 1, 'Error:', error.nativeEvent.error);
                      setImageLoading(prev => ({ ...prev, [currentPage]: false }));
                    }}
                  />
                );
              } else if (currentPageData?.image_status === 'processing') {
                return (
                  <View style={styles.placeholderImage}>
                    <PaperActivityIndicator size="large" />
                    <Text style={styles.placeholderText}>Creating illustration...</Text>
                  </View>
                );
              } else {
                return (
                  <View style={styles.placeholderImage}>
                    <Text style={styles.placeholderIcon}>🎨</Text>
                    <Text style={styles.placeholderText}>Illustration not ready</Text>
                  </View>
                );
              }
            })()}
            
            {imageLoading[currentPage] && (
              <View style={styles.imageLoadingOverlay}>
                <PaperActivityIndicator size="small" />
              </View>
            )}
          </View>

          {/* Text Section (hidden for cover) */}
          {!isCoverPage && (
            <View style={styles.textSection}>
              <Text style={styles.pageText}>
                {currentPageData?.text || 'Loading page content...'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Page Navigation */}
      <View style={styles.navigationContainer}>
        {/* Page Dots */}
        <View style={styles.pageDotsContainer}>
          {bookData.pages.map((_, index) => (
            <TouchableRipple key={index} onPress={() => goToPage(index)} borderless style={{ borderRadius: 10 }}>
              <View style={[styles.pageDot, index === currentPage && styles.pageDotActive]} />
            </TouchableRipple>
          ))}
        </View>

        {/* Navigation Buttons */}
        <View style={styles.navButtons}>
          <Button
            title=""
            onPress={goToPrevPage}
            variant="primary"
            size="sm"
            disabled={currentPage === 0}
            leftIcon={<MaterialCommunityIcons name="arrow-left" size={20} color={colors.surface} />}
          />
          <Button
            title=""
            onPress={goToNextPage}
            variant="primary"
            size="sm"
            disabled={currentPage === bookData.pages.length - 1}
            rightIcon={<MaterialCommunityIcons name="arrow-right" size={20} color={colors.surface} />}
          />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <Button
          title="Back to Library"
          onPress={() => navigation.navigate('BookLibrary')}
          variant="info"
        />
        <Button
          title="📄 Download PDF"
          onPress={handleDownloadPdf}
          variant="primary"
          loading={isDownloading}
          disabled={isDownloading}
        />
        {user?.role === 'admin' || user?.role === 'superadmin' ? (
          <Button
            title="🔄 Regenerate Book"
            onPress={handleAdminRegenerate}
            variant="danger"
          />
        ) : null}
      </View>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 18,
    color: colors.danger,
    marginBottom: 20,
    textAlign: 'center',
  },
  
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 10,
  },
  bookPage: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    minHeight: 500,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  pageImage: {
    width: '100%',
    aspectRatio: 4 / 3, // 4:3 landscape for interior pages
  },
  pageImageCover: {
    width: '100%',
    aspectRatio: 1152 / 1600, // portrait for cover (matches workflow ~1152x1600)
  },
  imageSectionCover: {
    marginBottom: 0,
  },
  placeholderImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.neutral100,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral200,
    borderStyle: 'dashed',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  placeholderText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
  },
  textSection: {
    flex: 1,
    justifyContent: 'center',
  },
  pageText: {
    fontSize: 18,
    lineHeight: 28,
    color: colors.textPrimary,
    textAlign: 'center',
    fontFamily: 'System', // You might want to use a more child-friendly font
    paddingHorizontal: 10,
  },
  navigationContainer: {
    backgroundColor: colors.lightYellow,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: colors.primarySoft,
  },
  pageDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 15,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutral200,
    marginHorizontal: 4,
  },
  pageDotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
   
  },
  navButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.neutral100,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  navButtonTextDisabled: {
    color: colors.neutral400,
  },
  actionsContainer: {
    flexDirection: 'column',
    padding: 20,
    gap: 10,
    backgroundColor: colors.lightYellow,
    borderTopWidth: 1,
    borderTopColor: colors.primarySoft,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.neutral100,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  destructiveActionButton: {
    backgroundColor: colors.danger,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  destructiveActionButtonText: {
    color: 'white',
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
