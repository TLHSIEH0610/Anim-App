import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Dimensions,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { getBookPreview, getBookPdfUrl, adminRegenerateBook } from '../api/books';
import { useAuth } from '../context/AuthContext';
import * as FileSystem from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';

const { width: screenWidth } = Dimensions.get('window');

export default function BookViewerScreen({ route, navigation }) {
  const { bookId } = route.params;
  const { token } = useAuth();
  const [bookData, setBookData] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState({});
  const [isDownloading, setIsDownloading] = useState(false);

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
    } catch (error) {
      console.error('Error loading book:', error);
      Alert.alert('Error', 'Failed to load book preview');
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
            Alert.alert('Download cancelled', 'Storage permission is required to save the PDF.');
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

          Alert.alert('Download complete', 'PDF saved to the folder you selected.');
        } catch (androidError) {
          console.error('Android PDF save error:', androidError);
          Alert.alert('Download failed', 'Could not save the PDF. Please try again.');
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
    } catch (error) {
      console.error('PDF download error:', error);
      Alert.alert('Download failed', 'Unable to download PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAdminRegenerate = () => {
    if (!bookData) return;
    
    Alert.alert(
      'Admin Regenerate Book',
      'This will delete all story content, images, and PDF, then completely regenerate the book from scratch. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Regenerate', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await adminRegenerateBook(token, bookId);
              Alert.alert('Success', 'Book regeneration started! You can check the status page to monitor progress.');
              // Reload book data to show updated status
              await loadBookData();
            } catch (error) {
              console.error('Error regenerating book:', error);
              Alert.alert('Error', 'Failed to regenerate book. Please try again.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
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
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading your book...</Text>
      </View>
    );
  }

  if (!bookData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Book not found or failed to load</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentPageData = bookData.pages[currentPage];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.bookTitle}>{bookData.title}</Text>
          <Text style={styles.pageIndicator}>
            Page {currentPage + 1} of {bookData.total_pages}
          </Text>
        </View>
        
        <TouchableOpacity onPress={handleShare}>
          <Text style={styles.shareButton}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Book Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.bookPage}>
          {/* Image Section */}
          <View style={styles.imageSection}>
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
                    style={styles.pageImage}
                    resizeMode="contain"
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
                    <ActivityIndicator size="large" color="#3b82f6" />
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
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            )}
          </View>

          {/* Text Section */}
          <View style={styles.textSection}>
            <Text style={styles.pageText}>
              {currentPageData?.text || 'Loading page content...'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Page Navigation */}
      <View style={styles.navigationContainer}>
        {/* Page Dots */}
        <View style={styles.pageDotsContainer}>
          {bookData.pages.map((_, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.pageDot,
                index === currentPage && styles.pageDotActive
              ]}
              onPress={() => goToPage(index)}
            />
          ))}
        </View>

        {/* Navigation Buttons */}
        <View style={styles.navButtons}>
          <TouchableOpacity 
            style={[styles.navButton, currentPage === 0 && styles.navButtonDisabled]}
            onPress={goToPrevPage}
            disabled={currentPage === 0}
          >
            <Text style={[styles.navButtonText, currentPage === 0 && styles.navButtonTextDisabled]}>
              ← Previous
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.navButton, currentPage === bookData.pages.length - 1 && styles.navButtonDisabled]}
            onPress={goToNextPage}
            disabled={currentPage === bookData.pages.length - 1}
          >
            <Text style={[styles.navButtonText, currentPage === bookData.pages.length - 1 && styles.navButtonTextDisabled]}>
              Next →
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, isDownloading && styles.actionButtonDisabled]}
          onPress={handleDownloadPdf}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Text style={styles.actionButtonText}>📄 Download PDF</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.actionButton, styles.destructiveActionButton]} onPress={handleAdminRegenerate}>
          <Text style={[styles.actionButtonText, styles.destructiveActionButtonText]}>
            🔄 Regenerate Book
          </Text>
        </TouchableOpacity>
      </View>
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
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e7ff',
  },
  backButton: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  bookTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  pageIndicator: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  shareButton: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
  },
  bookPage: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
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
  },
  pageImage: {
    width: screenWidth - 80,
    height: (screenWidth - 80) * 0.75, // 4:3 aspect ratio
    borderRadius: 8,
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: screenWidth - 80,
    height: (screenWidth - 80) * 0.75,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  placeholderText: {
    fontSize: 16,
    color: '#6b7280',
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
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
  },
  textSection: {
    flex: 1,
    justifyContent: 'center',
  },
  pageText: {
    fontSize: 18,
    lineHeight: 28,
    color: '#1f2937',
    textAlign: 'center',
    fontFamily: 'System', // You might want to use a more child-friendly font
    paddingHorizontal: 10,
  },
  navigationContainer: {
    backgroundColor: 'white',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e7ff',
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
    backgroundColor: '#d1d5db',
    marginHorizontal: 4,
  },
  pageDotActive: {
    backgroundColor: '#3b82f6',
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
    backgroundColor: '#f3f4f6',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  navButtonTextDisabled: {
    color: '#9ca3af',
  },
  actionsContainer: {
    flexDirection: 'column',
    padding: 20,
    gap: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e7ff',
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  destructiveActionButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  destructiveActionButtonText: {
    color: 'white',
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
});
