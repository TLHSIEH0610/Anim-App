import React from "react";
import { View, Text, StyleSheet } from "react-native";
import ScreenWrapper from "../components/ScreenWrapper";
import Header from "../components/Header";
import Button from "../components/Button";
import { colors, spacing, typography } from "../styles/theme";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";

type Params = {
  manifest: {
    message: string;
    deleted?: { books?: number; pages?: number; files?: number; payments_anonymized?: number; user?: number };
    deletedAt?: number;
  };
};

export default function DeleteReceiptScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { logout } = useAuth();
  const manifest: Params["manifest"] = route.params?.manifest || {};
  const d = manifest.deleted || {};
  const when = manifest.deletedAt ? new Date(manifest.deletedAt * 1000) : new Date();

  return (
    <ScreenWrapper>
      <Header title="Account Deleted" showBack={false} />
      <View style={styles.container}>
        <Text style={styles.title}>Your account has been deleted</Text>
        <Text style={styles.paragraph}>{manifest.message || "We removed your account and related data."}</Text>

        <View style={styles.card}>
          <Text style={styles.row}>Books removed: {d.books ?? 0}</Text>
          <Text style={styles.row}>Pages removed: {d.pages ?? 0}</Text>
          <Text style={styles.row}>Files removed: {d.files ?? 0}</Text>
          <Text style={styles.row}>Payments anonymized: {d.payments_anonymized ?? 0}</Text>
          <Text style={[styles.row, { marginTop: spacing(2) }]}>Timestamp: {when.toLocaleString()}</Text>
        </View>

        <Text style={styles.smallNote}>
          Note: Operational backups are retained for a limited period and are overwritten on a rolling basis. Your data will not reappear in the app.
        </Text>

        <Button
          title="Back to Login"
          onPress={async () => {
            await logout();
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          }}
          variant="primary"
          style={{ marginTop: spacing(4) }}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing(4) },
  title: { ...typography.headingM, color: colors.textPrimary, marginBottom: spacing(2) },
  paragraph: { ...typography.body, color: colors.textSecondary, marginBottom: spacing(2) },
  card: { backgroundColor: "#EAF4E2", borderRadius: 12, padding: spacing(4) },
  row: { ...typography.body, color: colors.textPrimary },
  smallNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing(2) },
});

