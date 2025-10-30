
import React, { useState } from "react";
import { Image, Text, View, StyleSheet, Alert, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadImage, getJobStatus, getJobList, getJobImageUrl, getJobImageData } from "../api/jobs";
import { useAuth } from "../context/AuthContext";
import ScreenWrapper from "../components/ScreenWrapper";
import Card from "../components/Card";
import Button from "../components/Button";
import { colors } from "../styles/theme";

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
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        Alert.alert("File Too Large", "Please select an image smaller than 10MB");
        return;
      }
      
      const isValidType = asset.type === 'image' && 
        (asset.uri.toLowerCase().includes('.jpg') || 
         asset.uri.toLowerCase().includes('.jpeg') || 
         asset.uri.toLowerCase().includes('.png'));
         
      if (!isValidType) {
        Alert.alert("Invalid File Type", "Please select a JPG or PNG image");
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
      setImage(null);
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
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <ScreenWrapper showIllustrations={true}>
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
        <Button title="Logout" onPress={handleLogout} variant="destructive" />
      </View>
      <ScrollView>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Image Animation</Text>
          <Text style={styles.subtitle}>Upload an image to convert it into an animation</Text>
          
          <Button title="📷 Pick an Image" onPress={pickImage} variant="primary" size="lg" />
          
          {image && (
            <View style={styles.imageContainer}>
              <Image source={{ uri: image }} style={styles.image} />
              <Button title="🚀 Upload & Process" onPress={upload} variant="primary" disabled={!image} />
            </View>
          )}
          
          {status && (
            <View style={styles.statusContainer}>
              <Text style={styles.status}>{status}</Text>
            </View>
          )}
        </Card>

        <Card style={styles.card}>
          <Button 
            title={`📋 ${showJobs ? 'Hide' : 'Show'} My Jobs (${jobs.length})`}
            onPress={() => {
              setShowJobs(!showJobs);
              if (!showJobs) loadJobs();
            }}
            variant="secondary"
          />

          {showJobs && (
            <ScrollView style={styles.jobList} nestedScrollEnabled={true}>
              {jobs.length === 0 ? (
                <Text style={styles.noJobs}>No jobs yet. Upload an image to get started!</Text>
              ) : (
                jobs.map((job) => (
                  <View key={job.job_id} style={styles.jobItem}>
                    <View style={styles.jobHeader}>
                      <Text style={styles.jobId}>Job #{job.job_id}</Text>
                      <Text style={[styles.jobStatus, { color: job.status === 'done' ? colors.success : colors.warning }]}>
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
                          />
                        ) : (
                          <Button 
                            title={imageLoading[job.job_id] ? '⏳ Loading...' : '📷 Load Image'}
                            onPress={() => loadJobImage(job.job_id)}
                            variant="secondary"
                            disabled={imageLoading[job.job_id]}
                          />
                        )}
                      </View>
                    )}
                    
                    {job.status !== 'done' && (
                      <Button 
                        title="🔄 Refresh Status"
                        onPress={() => refreshJobStatus(job.job_id)}
                        variant="secondary"
                      />
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.infoTitle}>ℹ️ Information</Text>
          <Text style={styles.infoText}>• Free: 2 conversions per day</Text>
          <Text style={styles.infoText}>• Max file size: 10MB</Text>
          <Text style={styles.infoText}>• Supported: JPG, PNG</Text>
        </Card>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
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
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  card: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 30,
    textAlign: 'center',
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
  statusContainer: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  status: {
    fontSize: 14,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primaryDark,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 5,
  },
  jobList: {
    maxHeight: 400,
  },
  jobItem: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
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
    color: colors.textPrimary,
  },
  jobStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
  jobTime: {
    fontSize: 12,
    color: colors.textSecondary,
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
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 10,
  },
  noJobs: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
    padding: 20,
  },
});
