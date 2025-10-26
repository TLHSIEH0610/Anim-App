import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { colors, radii, spacing, typography } from "../styles/theme";

type Props = {
  isChecking: boolean;
  onRetry: () => void;
  lastChecked: Date | null;
  lastError?: string | null;
};

const formatTimestamp = (date: Date | null) => {
  if (!date) {
    return "";
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const ServerUnavailableScreen = ({ isChecking, onRetry, lastChecked, lastError }: Props) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Server is resting</Text>
          <Text style={styles.message}>
            We can’t talk to the story server right now. Please check your connection or try again
            in a moment.
          </Text>
          {lastError ? <Text style={styles.errorHint}>{lastError}</Text> : null}
          {lastChecked ? (
            <Text style={styles.timestamp}>Last check: {formatTimestamp(lastChecked)}</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.retryButton, isChecking && styles.retryButtonDisabled]}
            onPress={onRetry}
            disabled={isChecking}
          >
            {isChecking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.retryLabel}>Retry Connection</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.footerNote}>The app will retry automatically when you come back.</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing(5),
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing(6),
    borderWidth: 1,
    borderColor: colors.neutral200,
    alignItems: "center",
  },
  title: {
    ...typography.headingL,
    textAlign: "center",
    marginBottom: spacing(3),
  },
  message: {
    ...typography.body,
    textAlign: "center",
    color: colors.textPrimary,
    marginBottom: spacing(3),
  },
  errorHint: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
    marginBottom: spacing(2),
  },
  timestamp: {
    ...typography.caption,
    textAlign: "center",
    marginBottom: spacing(4),
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(6),
    minWidth: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonDisabled: {
    opacity: 0.7,
  },
  retryLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  footerNote: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing(4),
    color: colors.textMuted,
  },
});

export default ServerUnavailableScreen;
