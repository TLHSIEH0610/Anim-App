import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import {
  GoogleSignin,
  GoogleSigninButton,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import ScreenWrapper from "../components/ScreenWrapper";
// Using built-in Google sign-in button from the library
import { loginWithGoogle } from "../api/auth";
import { colors, spacing, typography } from "../styles/theme";
import { AppStackParamList } from "../navigation/types";

const LoginScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const googleClientConfig = useMemo(() => {
    const androidClientId =
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
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
    googleClientConfig.webClientId ||
      googleClientConfig.androidClientId ||
      googleClientConfig.iosClientId
  );

  useEffect(() => {
    if (!hasGoogleConfig) {
      return;
    }

    GoogleSignin.configure({
      // Use the Web client ID to obtain an ID token for backend verification
      webClientId:
        googleClientConfig.webClientId || googleClientConfig.clientId,
      iosClientId: googleClientConfig.iosClientId,
      // Request only the ID token; avoid server auth code/refresh token flow to reduce errors on emulators
      offlineAccess: false,
      forceCodeForRefreshToken: false,
      profileImageSize: 120,
      scopes: ["profile", "email"],
    });
  }, [googleClientConfig, hasGoogleConfig]);

  const handleGoogleSignIn = useCallback(async () => {
    if (!hasGoogleConfig) {
      setAuthError("Google Sign-In is not configured. Please try again later.");
      return;
    }
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Light connectivity probe to catch emulator/proxy issues early
      try {
        await fetch("https://clients3.google.com/generate_204", { method: "GET" });
      } catch {
        throw new Error("Network is unavailable. Please check your emulator/device connectivity.");
      }

      const signInResult = await GoogleSignin.signIn();
      // Prefer the native idToken returned by the SDK; avoid getTokens() unless needed
      const nativeResult: any = signInResult ?? {};
      const idToken = nativeResult?.idToken || nativeResult?.data?.idToken || null;
      if (!idToken) {
        // Fallback: attempt to fetch tokens if the SDK didn’t include idToken (older Play Services)
        const tokens = (await GoogleSignin.getTokens().catch(() => null)) ?? null;
        if (!tokens?.idToken) {
          throw new Error(
            "Unable to obtain a Google ID token. Ensure your Web + Android client IDs are correct and the device has network access."
          );
        }
        const backendAuth = await loginWithGoogle(tokens.idToken);
        await login(backendAuth.token, {
          id: String(backendAuth.user.id),
          email: backendAuth.user.email,
          name: backendAuth.user.name || backendAuth.user.email,
          role: backendAuth.user.role ?? null,
        });
        setAuthError(null);
        return;
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
      } else if (error?.code === statusCodes.NETWORK_ERROR) {
        setAuthError(
          "Network error during Google sign-in. Check emulator/device internet connectivity and any proxy/VPN settings."
        );
      } else if (error?.response?.data?.detail) {
        setAuthError(error.response.data.detail);
      } else if (error?.message) {
        setAuthError(error.message);
      } else {
        console.error("Google sign-in error", error);
        setAuthError("We couldn't finish Google sign-in. Please try again.");
      }
    }
  }, [hasGoogleConfig, login]);

  const handleGoogleLogin = () => {
    if (isLoading || !hasGoogleConfig) {
      return;
    }
    setAuthError(null);
    setIsLoading(true);
    handleGoogleSignIn().finally(() => setIsLoading(false));
  };

  return (
    <ScreenWrapper showIllustrations>
      <View style={styles.brandingContainer}>
        <Image
          source={require("../../assets/kid-knight.png")} // Use your actual chosen icon
          style={styles.appIcon}
        />
        <Text style={styles.appName}>Kid to Story</Text>
      </View>

      {/* Welcome & Call to Action */}
      <View style={styles.welcomeContainer}>
        <Text style={styles.welcomeMessage}>
          Welcome to your story adventure!
        </Text>
        <Text style={styles.description}>
          Unlock personalized tales starring your little hero!
        </Text>
      </View>

      <View style={styles.buttonArea}>
        <GoogleSigninButton
          style={{ width: 360, height: 60, borderRadius: 8 }}
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Light}
          onPress={handleGoogleLogin}
          disabled={isLoading || !hasGoogleConfig}
        />
        {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
        {!hasGoogleConfig ? (
          <Text style={styles.helperText}>
            Add your Google OAuth client IDs to frontend/.env to enable sign in.
          </Text>
        ) : (
          <Text style={styles.helperText}>
            We use Google to keep your stories safe and sound.
          </Text>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text
          onPress={() => navigation.navigate("PrivacyPolicy")}
          style={styles.footerLink}
        >
          Privacy Policy
        </Text>
        <Text style={styles.footerSeparator}> | </Text>
        <Text
          onPress={() => navigation.navigate("TermsOfService")}
          style={styles.footerLink}
        >
          Terms of Service
        </Text>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  brandingContainer: {
    alignItems: "center",
    marginBottom: 30,
    marginTop: 20,
  },
  appIcon: {
    width: 300,
    height: 300,
    resizeMode: "contain",
    marginBottom: 10,
    borderRadius: 20,
  },
  appName: {
    ...typography.headingXL,
    color: colors.textPrimary,
  },
  welcomeContainer: {
    alignItems: "center",
    marginHorizontal: 20,
  },
  welcomeMessage: {
    ...typography.headingL,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 10,
    // fontFamily: 'System-Semibold',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    // fontFamily: 'System',
  },
  buttonArea: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  privacyHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 15,
    marginHorizontal: 30,
  },
  footer: {
    flexDirection: "row",
    marginTop: spacing(6),
    marginBottom: spacing(8),
    justifyContent: "center",
    paddingHorizontal: spacing(6),
  },
  footerLink: {
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: "underline",
  },
  footerSeparator: {
    fontSize: 12,
    color: colors.textSecondary,
    marginHorizontal: 5,
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
