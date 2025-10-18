import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

const DEV_GOOGLE_BYPASS =
  (__DEV__ &&
    (process.env.EXPO_PUBLIC_DEV_GOOGLE_BYPASS || "true").toLowerCase() !== "false") ||
  false;

WebBrowser.maybeCompleteAuthSession();

const LoginScreen = () => {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Google OAuth configuration - use explicit Expo auth proxy without encoding
  const redirectUri = 'https://auth.expo.io/@anonymous/anim-app-8c0b6f22-a823-4cf7-8612-08607e64927a';
  console.log("Redirect URI being used:", redirectUri);

  const googleAuthConfig: AuthSession.AuthRequestConfig = {
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID!,
    scopes: ["openid", "profile", "email"],
    additionalParameters: {},
    responseType: AuthSession.ResponseType.Token,
    redirectUri,
    usePKCE: false, // Disable PKCE
  };
  console.log("Full OAuth config:", googleAuthConfig);
  
  // Use manual endpoints for more control
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    googleAuthConfig,
    {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    }
  );

  React.useEffect(() => {
    if (response?.type === "success") {
      handleGoogleSignIn(response.authentication?.accessToken);
    }
  }, [response]);

  const handleGoogleSignIn = async (accessToken?: string) => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      // Get user info from Google
      const userInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`
      );
      const userInfo = await userInfoResponse.json();

      // Extract user data
      const user = {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
      };

      // In a real app, you'd get a JWT token from your backend here
      const mockJwtToken = `mock-jwt-${userInfo.id}`;

      await login(mockJwtToken, user);
    } catch (error) {
      console.error("Google sign-in error:", error);
      Alert.alert("Error", "Failed to sign in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  const performMockLogin = async (reason: string) => {
    setIsLoading(true);

    try {
      console.log(`[auth] ${reason}: hitting`, api.defaults.baseURL, "/auth/mock");
      const { data } = await api.post("/auth/mock", {
        email: "test@example.com",
      });

      console.log("[auth] mock response", data);

      const user = data.user || {
        id: "1",
        email: "test@example.com",
        name: "Test User",
      };

      await login(data.token, {
        id: String(user.id ?? "1"),
        email: user.email ?? "test@example.com",
        name: user.name ?? "Test User",
      });
    } catch (error) {
      console.error("[auth] mock login error", error);
      Alert.alert("Error", "Mock login failed. Make sure backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMockLogin = () => performMockLogin("manual mock button");

  const handleGoogleLogin = () => {
    if (DEV_GOOGLE_BYPASS) {
      performMockLogin("dev Google bypass");
      return;
    }

    promptAsync();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TouchableOpacity
          style={[styles.mockButton, isLoading && styles.disabledButton]}
          onPress={handleMockLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Mock Login (Test)</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.orText}>OR</Text>

        <TouchableOpacity
          style={[
            styles.googleButton,
            (!request || isLoading) && styles.disabledButton,
          ]}
          onPress={handleGoogleLogin}
          disabled={!request || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        {!request && (
          <Text style={styles.errorText}>
            Google OAuth not configured. Check your .env file.
          </Text>
        )}
        
        <Text style={styles.infoText}>
          Mock login available for quick testing
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 40,
    textAlign: "center",
  },
  googleButton: {
    backgroundColor: "#4285f4",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  googleButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  disabledButton: {
    backgroundColor: "#cccccc",
    opacity: 0.6,
  },
  errorText: {
    color: "#ff4444",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
  },
  mockButton: {
    backgroundColor: '#28a745',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: "100%",
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 15,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  orText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 15,
  },
  infoText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
});

export default LoginScreen;
