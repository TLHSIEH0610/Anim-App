import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Dimensions , SafeAreaView, Image, Linking } from "react-native";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { useAuth } from "../context/AuthContext";
import { LinearGradient } from 'expo-linear-gradient';

import { loginWithGoogle } from "../api/auth";
import { colors, spacing } from "../styles/theme";

const { width, height } = Dimensions.get('window');


const LoginScreen = () => {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const googleClientConfig = useMemo(() => {
    const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
    const fallback = webClientId || androidClientId || iosClientId;

    return {
      androidClientId,
      iosClientId,
      webClientId,
      clientId: fallback,
    };
  }, []);

  const hasGoogleConfig = Boolean(
    googleClientConfig.webClientId || googleClientConfig.androidClientId || googleClientConfig.iosClientId
  );

  useEffect(() => {
    if (!hasGoogleConfig) {
      return;
    }

    GoogleSignin.configure({
      webClientId: googleClientConfig.webClientId || googleClientConfig.clientId,
      iosClientId: googleClientConfig.iosClientId,
      offlineAccess: true,
      forceCodeForRefreshToken: true,
      profileImageSize: 120,
      scopes: ["profile", "email"],
    });
  }, [googleClientConfig, hasGoogleConfig]);

  const handleGoogleSignIn = useCallback(
    async () => {
      if (!hasGoogleConfig) {
        setAuthError("Google Sign-In is not configured. Please try again later.");
        return;
      }
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const signInResult = await GoogleSignin.signIn();
        const tokens = (await GoogleSignin.getTokens().catch(() => null)) ?? null;
        const nativeResult: any = signInResult;
        const idToken = tokens?.idToken || nativeResult?.idToken || nativeResult?.data?.idToken;
        if (!idToken) {
          throw new Error("Unable to obtain a Google ID token");
        }

        const backendAuth = await loginWithGoogle(idToken);
        await login(backendAuth.token, {
          id: String(backendAuth.user.id),
          email: backendAuth.user.email,
          name: backendAuth.user.name || backendAuth.user.email,
          role: backendAuth.user.role ?? null,
        });
        setAuthError(null);
      } catch (error: any) {
        if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
          setAuthError("Sign-in was cancelled. Please try again.");
        } else if (error?.code === statusCodes.IN_PROGRESS) {
          setAuthError("Google sign-in is already in progress.");
        } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setAuthError("Google Play Services are unavailable or out of date.");
        } else if (error?.response?.data?.detail) {
          setAuthError(error.response.data.detail);
        } else if (error?.message) {
          setAuthError(error.message);
        } else {
          console.error("Google sign-in error", error);
          setAuthError("We couldn't finish Google sign-in. Please try again.");
        }
      }
    },
    [hasGoogleConfig, login]
  );

  const handleGoogleLogin = () => {
    if (isLoading || !hasGoogleConfig) {
      return;
    }
    setAuthError(null);
    setIsLoading(true);
    handleGoogleSignIn().finally(() => setIsLoading(false));
  };

  return (

        <LinearGradient
      colors={['#87CEEB', '#FFE4B5']} // Light sky blue to Moccasin (soft yellow/peach)
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }} // Gradient direction from top-left to bottom-right
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>

        {/* Background Overlay for subtle illustrations */}
        {/* These would be images you've prepared (e.g., castle_outline.png, stars.png) */}
        {/* Ensure these images have transparent backgrounds */}
        <Image
          source={require('../../assets/castle_outline.png')} // Create this asset
          style={styles.backgroundCastle}
        />
        <Image
          source={require('../../assets/stars_scatter.png')} // Create this asset
          style={styles.backgroundStars}
        />
                <Image
          source={require('../../assets/cloud.png')} // Create this asset
          style={styles.backgroundCloud}
        />
        {/* Add more background elements here if needed */}

        {/* App Branding */}
        <View style={styles.brandingContainer}>
          <Image
            source={require('../../assets/kid-knight.png')} // Use your actual chosen icon
            style={styles.appIcon}
          />
          <Text style={styles.appName}>Kid to Story</Text>
        </View>

        {/* Welcome & Call to Action */}
        <View style={styles.welcomeContainer}>
          <Text style={styles.welcomeMessage}>Welcome to your story adventure!</Text>
          <Text style={styles.description}>Unlock personalized tales starring your little hero!</Text>
        </View>

        {/* Login Button Area (Styling only, no actual login logic here) */}
        <View style={styles.buttonArea}>


         
  
          <TouchableOpacity
            style={[styles.genericButton, (isLoading || !hasGoogleConfig) && styles.googleButtonDisabled]}
            onPress={handleGoogleLogin} 
             disabled={isLoading || !hasGoogleConfig}
          >
            <Image
              source={require('../../assets/google_logo.png')} // Add a small Google 'G' logo image
              style={styles.buttonLogo}
            />
            <Text style={styles.buttonText}>Sign in with Google</Text>
          </TouchableOpacity>
           {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
              {!hasGoogleConfig ? (
            <Text style={styles.helperText}>
              Add your Google OAuth client IDs to `frontend/.env` to enable sign in.
            </Text>
          ) : (
            <Text style={styles.helperText}>We use Google to keep your stories safe and sound.</Text>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => Linking.openURL('https://your_privacy_policy_url.com')}>
            <Text style={styles.footerLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.footerSeparator}> | </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://your_terms_of_service_url.com')}>
            <Text style={styles.footerLink}>Terms of Service</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    position: 'relative', // Needed for absolute positioning of background elements
  },
  // --- Background Illustrations ---
  backgroundCastle: {
    position: 'absolute',
    width: width * 0.7, // 70% of screen width
    height: height * 0.3, // 30% of screen height
    resizeMode: 'contain',
    opacity: 0.3, // Make it very subtle
    bottom: height * 0.3, // Position from top
    right: -width * 0.1, // Slightly off-screen to the right
  },
  backgroundStars: {
    position: 'absolute',
    width: width * 0.5,
    height: height * 0.2,
    resizeMode: 'contain',
    opacity: 0.6,
    bottom: height * 0.2, // Position from bottom
    left: -width * 0.1, // Slightly off-screen to the left
    transform: [{ rotate: '15deg' }], // Optional: add a slight rotation
  },

    backgroundCloud: {
    position: 'absolute',
    width: width * 0.5,
    height: height * 0.2,
    resizeMode: 'contain',
    opacity: 0.6,
    top: height * 0.2, // Position from bottom
    left: -width * 0.1, // Slightly off-screen to the left
    transform: [{ rotate: '15deg' }], // Optional: add a slight rotation
  },
  // --- End Background Illustrations ---

  brandingContainer: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  appIcon: {
    width: 300,
    height: 300,
    resizeMode: 'contain',
    marginBottom: 10,
    borderRadius: 20, // Match your icon's actual design
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    
  },
  welcomeContainer: {
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  welcomeMessage: {
    fontSize: 24,
    fontWeight: '600',
    color: '#444',
    textAlign: 'center',
    marginBottom: 10,
    // fontFamily: 'System-Semibold',
  },
  description: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    // fontFamily: 'System',
  },
  buttonArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  genericButton: { // Renamed from googleSignInButton for general use
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  buttonLogo: { // Renamed from googleLogo
    width: 54,
    height: 54,
    marginRight: 10,
  },
  buttonText: { // Renamed from googleSignInButtonText
    fontSize: 18,
    color: '#555',
    fontWeight: '500',
    // fontFamily: 'System-Medium',
  },
  privacyHint: {
    fontSize: 13,
    color: '#777',
    textAlign: 'center',
    marginTop: 15,
    marginHorizontal: 30,
    // fontFamily: 'System',
  },
  footer: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 0,
    justifyContent: 'center',
  },
  footerLink: {
    fontSize: 12,
    color: '#666',
    textDecorationLine: 'underline',
    // fontFamily: 'System',
  },
  footerSeparator: {
    fontSize: 12,
    color: '#666',
    marginHorizontal: 5,
  },
    googleButtonDisabled: {
    opacity: 0.6,
  },
    helperText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing(4),
    lineHeight: 18,
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing(4),
    textAlign: "center",
  },
});

export default LoginScreen;
