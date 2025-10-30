import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator as PaperActivityIndicator } from 'react-native-paper';
import Button from '../components/Button';
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
    <SafeAreaView style={styles.safeArea} edges={['top','bottom']}>
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
          <Button title="Retry Connection" onPress={onRetry} loading={isChecking} disabled={isChecking} />
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
  footerNote: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing(4),
    color: colors.textMuted,
  },
});

export default ServerUnavailableScreen;
