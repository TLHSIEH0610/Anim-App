import React, { useState } from "react";
import { Button, Image, Text, View, StyleSheet, TouchableOpacity, Alert, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadImage, getJobStatus, getJobList, getJobImageUrl, getJobImageData } from "../api/jobs";
import { useAuth } from "../context/AuthContext";

export default function HomeScreen() {
  const { user, token, logout } = useAuth();
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [showJobs, setShowJobs] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<{[key: number]: boolean}>({});
  const [imageData, setImageData] = useState<{[key: number]: string}>({});

  const loadJobs = async () => {
    if (!token) return;
    try {
      const response = await getJobList();
      setJobs(response.jobs || []);
    } catch (error) {
      console.error("Error loading jobs:", error);
    }
  };

  const refreshJobStatus = async (jobId: number) => {
    if (!token) return;
    try {
      const jobStatus = await getJobStatus(jobId);
      setJobs(prev => prev.map(job => 
        job.job_id === jobId ? { ...job, ...jobStatus } : job
      ));
    } catch (error) {
      console.error("Error refreshing job:", error);
    }
  };

  const loadJobImage = async (jobId: number) => {
    if (!token || imageData[jobId] || imageLoading[jobId]) return;
    
    setImageLoading(prev => ({...prev, [jobId]: true}));
    try {
      const response = await getJobImageData(jobId);
      setImageData(prev => ({...prev, [jobId]: response.image_data}));
      console.log('Image data loaded successfully for job', jobId);
    } catch (error) {
      console.error("Error loading image for job", jobId, ":", error);
    } finally {
      setImageLoading(prev => ({...prev, [jobId]: false}));
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8, // Reduce quality to help with file size
      allowsMultipleSelection: false,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      
      // Check file size (10MB limit)
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        Alert.alert(
          "File Too Large", 
          "Please select an image smaller than 10MB"
        );
        return;
      }
      
      // Check file type
      const isValidType = asset.type === 'image' && 
        (asset.uri.toLowerCase().includes('.jpg') || 
         asset.uri.toLowerCase().includes('.jpeg') || 
         asset.uri.toLowerCase().includes('.png'));
         
      if (!isValidType) {
        Alert.alert(
          "Invalid File Type", 
          "Please select a JPG or PNG image"
        );
        return;
      }
      
      setImage(asset.uri);
      setStatus("Image selected. Tap Upload to process.");
    }
  };

  const upload = async () => {
    if (!image || !token) return;
    
    setStatus("Uploading...");
    try {
      const res = await uploadImage(token, image);
      setStatus(`✅ Job queued: #${res.job_id}`);
      
      // Clear image after successful upload
      setImage(null);
      
      // Reload jobs to show the new one
      await loadJobs();
      console.log('Upload successful:', res);
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 402) {
        setStatus("❌ Quota exceeded! Purchase credits to continue.");
      } else if (err.response?.status === 400) {
        setStatus("❌ Invalid file type. Use JPG or PNG.");
      } else {
        setStatus("❌ Upload failed. Please try again.");
      }
    }
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

  return (
    <View style={styles.container}>
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

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Image Animation</Text>
        <Text style={styles.subtitle}>Upload an image to convert it into an animation</Text>
        
        <TouchableOpacity style={styles.pickButton} onPress={pickImage}>
          <Text style={styles.pickButtonText}>📷 Pick an Image</Text>
        </TouchableOpacity>
        
        {image && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: image }} style={styles.image} />
            <TouchableOpacity 
              style={[styles.uploadButton, !image && styles.disabledButton]} 
              onPress={upload} 
              disabled={!image}
            >
              <Text style={styles.uploadButtonText}>🚀 Upload & Process</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {status && (
          <View style={styles.statusContainer}>
            <Text style={styles.status}>{status}</Text>
          </View>
        )}

        <View style={styles.jobSection}>
          <TouchableOpacity 
            style={styles.jobToggleButton} 
            onPress={() => {
              setShowJobs(!showJobs);
              if (!showJobs) loadJobs();
            }}
          >
            <Text style={styles.jobToggleText}>
              📋 {showJobs ? 'Hide' : 'Show'} My Jobs ({jobs.length})
            </Text>
          </TouchableOpacity>

          {showJobs && (
            <ScrollView style={styles.jobList} nestedScrollEnabled={true}>
              {jobs.length === 0 ? (
                <Text style={styles.noJobs}>No jobs yet. Upload an image to get started!</Text>
              ) : (
                jobs.map((job) => (
                  <View key={job.job_id} style={styles.jobItem}>
                    <View style={styles.jobHeader}>
                      <Text style={styles.jobId}>Job #{job.job_id}</Text>
                      <Text style={[styles.jobStatus, { color: job.status === 'done' ? '#4CAF50' : '#FF9800' }]}>
                        {job.status === 'done' ? '✅ Complete' : job.status === 'processing' ? '⏳ Processing' : '📋 Queued'}
                      </Text>
                    </View>
                    <Text style={styles.jobTime}>
                      Created: {new Date(job.created_at).toLocaleString()}
                    </Text>
                    
                    {job.status === 'done' && job.output_path && (
                      <View style={styles.jobResult}>
                        {imageLoading[job.job_id] && (
                          <Text style={styles.loadingText}>Loading image...</Text>
                        )}
                        {imageData[job.job_id] ? (
                          <Image 
                            source={{ uri: imageData[job.job_id] }}
                            style={styles.resultImage}
                            onLoad={() => {
                              console.log('Image loaded successfully for job', job.job_id);
                              setImageLoading(prev => ({...prev, [job.job_id]: false}));
                            }}
                            onError={(e) => {
                              console.log('Image load error for job', job.job_id, ':', e.nativeEvent.error);
                              setImageLoading(prev => ({...prev, [job.job_id]: false}));
                            }}
                          />
                        ) : (
                          <TouchableOpacity 
                            style={styles.loadImageButton}
                            onPress={() => loadJobImage(job.job_id)}
                            disabled={imageLoading[job.job_id]}
                          >
                            <Text style={styles.loadImageText}>
                              {imageLoading[job.job_id] ? '⏳ Loading...' : '📷 Load Image'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <Text style={styles.resultText}>🎉 Your animated image is ready!</Text>
                      </View>
                    )}
                    
                    {job.status !== 'done' && (
                      <TouchableOpacity 
                        style={styles.refreshButton}
                        onPress={() => refreshJobStatus(job.job_id)}
                      >
                        <Text style={styles.refreshText}>🔄 Refresh Status</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
        
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Information</Text>
          <Text style={styles.infoText}>• Free: 2 conversions per day</Text>
          <Text style={styles.infoText}>• Max file size: 10MB</Text>
          <Text style={styles.infoText}>• Supported: JPG, PNG</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
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
    backgroundColor: '#4285f4',
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
    color: '#333',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#666',
  },
  logoutButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#ff4444',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  logoutButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  pickButton: {
    backgroundColor: '#4285f4',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    marginBottom: 20,
  },
  pickButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  image: {
    width: 250,
    height: 250,
    borderRadius: 12,
    marginBottom: 15,
  },
  uploadButton: {
    backgroundColor: '#28a745',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#cccccc',
    opacity: 0.6,
  },
  statusContainer: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  status: {
    fontSize: 14,
    textAlign: 'center',
    color: '#333',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 8,
    width: '100%',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 13,
    color: '#333',
    marginBottom: 5,
  },
  jobSection: {
    marginTop: 20,
  },
  jobToggleButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
  },
  jobToggleText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  jobList: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    maxHeight: 400,
  },
  jobItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  jobId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  jobStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
  jobTime: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  jobResult: {
    alignItems: 'center',
    marginTop: 10,
  },
  resultImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  resultText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  refreshButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  refreshText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  noJobs: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    padding: 20,
  },
  loadImageButton: {
    backgroundColor: '#4285f4',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
  },
  loadImageText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});