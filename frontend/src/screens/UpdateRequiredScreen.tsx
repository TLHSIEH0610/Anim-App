import React from "react";
import { View, Text, StyleSheet, Linking, Platform } from "react-native";
import ScreenWrapper from "../components/ScreenWrapper";
import Header from "../components/Header";
import Button from "../components/Button";
import { colors, spacing, typography } from "../styles/theme";
import type { UpdateRequiredInfo } from "../lib/updateEvents";

interface Props {
  info: UpdateRequiredInfo;
}

const UpdateRequiredScreen: React.FC<Props> = ({ info }) => {
  const updateUrl = info.update_url || null;

  const handleOpenStore = () => {
    if (!updateUrl) {
      return;
    }
    Linking.openURL(updateUrl).catch(() => {
      // Silently ignore; user can still update manually via store search
    });
  };

  const platformLabel =
    (info.platform === "ios" && "App Store") ||
    (info.platform === "android" && "Google Play Store") ||
    (Platform.OS === "ios" && "App Store") ||
    (Platform.OS === "android" && "Google Play Store") ||
    "app store";

  return (
    <ScreenWrapper showIllustrations>
      <Header title="Update Required" subtitle="Please install the latest version" />
      <View style={styles.container}>
        <Text style={styles.message}>
          A newer version of Kid to Story is required to continue.
          Please update the app from the {platformLabel} to keep your stories safe and working correctly.
        </Text>
        {typeof info.min_build === "number" && (
          <Text style={styles.detail}>
            Minimum required build: <Text style={styles.detailStrong}>{info.min_build}</Text>
          </Text>
        )}
        {updateUrl ? (
          <Button
            title={`Open ${platformLabel}`}
            onPress={handleOpenStore}
            variant="primary"
            style={{ marginTop: spacing(4) }}
          />
        ) : (
          <Text style={[styles.detail, { marginTop: spacing(4) }]}>
            Search for <Text style={styles.detailStrong}>“Kid to Story”</Text> in the {platformLabel} to update.
          </Text>
        )}
        <Text style={styles.note}>
          If you continue seeing this screen after updating, please fully close and reopen the app.
        </Text>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing(4),
  },
  message: {
    ...typography.body,
    textAlign: "center",
    color: colors.textPrimary,
    marginBottom: spacing(3),
  },
  detail: {
    ...typography.caption,
    textAlign: "center",
    color: colors.textSecondary,
  },
  detailStrong: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  note: {
    ...typography.caption,
    textAlign: "center",
    color: colors.textSecondary,
    marginTop: spacing(5),
  },
});

export default UpdateRequiredScreen;

