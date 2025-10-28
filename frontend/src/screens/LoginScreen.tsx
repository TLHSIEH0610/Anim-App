import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView } from "react-native";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { useAuth } from "../context/AuthContext";
import { colors, radii, shadow, spacing } from "../styles/theme";
import { loginWithGoogle } from "../api/auth";
import * as Sentry from "sentry-expo";

const featureHighlights = [
  "Save characters & prompts for every adventure",
  "Follow book creation progress in real time",
  "Checkout quickly with credits or cards",
];

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
        try {
          Sentry.Native.addBreadcrumb({
            category: "auth",
            message: "Google sign-in start",
            level: "info",
          });
        } catch (_) {}
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
        try {
          Sentry.Native.captureException(error, {
            extra: {
              code: error?.code,
              message: error?.message,
              step: "google_signin",
            },
            tags: { feature: "auth" },
          });
        } catch (_) {}
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.heroSection}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>AnimApp</Text>
          </View>
          <Text style={styles.heroTitle}>Bring their imagination to life</Text>
          <Text style={styles.heroSubtitle}>
            Design personalised picture books in minutes. Sign in with Google to pick up where you left
            off.
          </Text>
          <View style={styles.featureList}>
            {featureHighlights.map((feature) => (
              <View key={feature} style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Sign in to continue</Text>
          <TouchableOpacity
            style={[
              styles.googleButton,
              (isLoading || !hasGoogleConfig) && styles.googleButtonDisabled,
            ]}
            onPress={handleGoogleLogin}
            disabled={isLoading || !hasGoogleConfig}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </TouchableOpacity>

          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
          {!hasGoogleConfig ? (
            <Text style={styles.helperText}>
              Add your Google OAuth client IDs to `frontend/.env` to enable sign in.
            </Text>
          ) : (
            <Text style={styles.helperText}>We only use Google to verify your identity. No passwords.</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(8),
    justifyContent: "space-between",
  },
  heroSection: {
    marginTop: spacing(6),
  },
  brandBadge: {
    alignSelf: "flex-start",
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(4),
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  brandBadgeText: {
    color: colors.primary,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing(4),
    marginBottom: spacing(2),
  },
  heroSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  featureList: {
    marginTop: spacing(5),
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing(3),
  },
  featureBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginRight: spacing(2),
  },
  featureText: {
    fontSize: 15,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing(6),
    ...shadow.card,
  },
  cardLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing(4),
  },
  googleButton: {
    backgroundColor: "#4285f4",
    borderRadius: radii.lg,
    paddingVertical: spacing(4),
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
