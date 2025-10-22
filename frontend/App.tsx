import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import BookLibraryScreen from "./src/screens/BookLibraryScreen";
import BookCreationScreen from "./src/screens/BookCreationScreen";
import BookStatusScreen from "./src/screens/BookStatusScreen";
import BookViewerScreen from "./src/screens/BookViewerScreen";
import BillingHistoryScreen from "./src/screens/BillingHistoryScreen";
import { StripeProvider, isStripeAvailable } from "./src/lib/stripe";

const Stack = createNativeStackNavigator();

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="BookLibrary" component={BookLibraryScreen} />
            <Stack.Screen name="BookCreation" component={BookCreationScreen} />
            <Stack.Screen name="BookStatus" component={BookStatusScreen} />
            <Stack.Screen name="BookViewer" component={BookViewerScreen} />
            <Stack.Screen name="BillingHistory" component={BillingHistoryScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  const cardPaymentsEnabled = Boolean(publishableKey && publishableKey.length > 0 && isStripeAvailable);

  const appTree = (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );

  if (cardPaymentsEnabled) {
    return (
      <StripeProvider publishableKey={publishableKey} merchantIdentifier="com.animapp">
        {appTree}
      </StripeProvider>
    );
  }

  if (__DEV__) {
    const reason = !publishableKey
      ? "Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in frontend/.env to enable card payments."
      : "Stripe native module is unavailable in this build.";
    console.warn(reason);
  }

  return appTree;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
});


