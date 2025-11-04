import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import BookLibraryScreen from "./src/screens/BookLibraryScreen";
import AllBooksScreen from "./src/screens/AllBooksScreen";
import AccountScreen from "./src/screens/AccountScreen";
import BookCreationScreen from "./src/screens/BookCreationScreen";
import BookStatusScreen from "./src/screens/BookStatusScreen";
import BookViewerScreen from "./src/screens/BookViewerScreen";
import BillingHistoryScreen from "./src/screens/BillingHistoryScreen";
import { StripeProvider, isStripeAvailable } from "./src/lib/stripe";
import { colors } from "./src/styles/theme";
import { Provider as PaperProvider } from 'react-native-paper';
import { materialTheme } from './src/styles/materialTheme';
import { AppStackParamList } from "./src/navigation/types";
import { ServerStatusProvider, useServerStatus } from "./src/context/ServerStatusContext";
import ServerUnavailableScreen from "./src/screens/ServerUnavailableScreen";
import PrivacyPolicyScreen from "./src/screens/PrivacyPolicyScreen";
import TermsOfServiceScreen from "./src/screens/TermsOfServiceScreen";

const Stack = createNativeStackNavigator<AppStackParamList>();

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="AllBooks">
        {user ? (
          <>
            <Stack.Screen name="AllBooks" component={AllBooksScreen} />
            <Stack.Screen name="TemplateDemo" component={require('./src/screens/TemplateDemoScreen').default} />
            <Stack.Screen name="BookLibrary" component={BookLibraryScreen} />
            <Stack.Screen name="Account" component={AccountScreen} />
            <Stack.Screen name="BookCreation" component={BookCreationScreen} />
            <Stack.Screen name="BookStatus" component={BookStatusScreen} />
            <Stack.Screen name="BookViewer" component={BookViewerScreen} />
            <Stack.Screen name="BillingHistory" component={BillingHistoryScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
        <Stack.Screen
          name="PrivacyPolicy"
          component={PrivacyPolicyScreen}
          options={{
            headerShown: true,
            title: "Privacy Policy",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="TermsOfService"
          component={TermsOfServiceScreen}
          options={{
            headerShown: true,
            title: "Terms of Service",
            presentation: "modal",
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const ServerStatusGate = ({ children }: { children: React.ReactNode }) => {
  const { isBackendReachable, isChecking, lastChecked, lastError, refresh } = useServerStatus();

  if (isBackendReachable === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isBackendReachable) {
    return (
      <ServerUnavailableScreen
        isChecking={isChecking}
        onRetry={refresh}
        lastChecked={lastChecked}
        lastError={lastError}
      />
    );
  }

  return <>{children}</>;
};

export default function App() {
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  const cardPaymentsEnabled = Boolean(publishableKey && publishableKey.length > 0 && isStripeAvailable);

  const appTree = (
    <PaperProvider theme={materialTheme}>
      <AuthProvider>
        <ServerStatusProvider>
          <ServerStatusGate>
            <AppContent />
          </ServerStatusGate>
        </ServerStatusProvider>
      </AuthProvider>
    </PaperProvider>
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
    backgroundColor: colors.background,
  },
});
