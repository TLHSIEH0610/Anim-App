import React, { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import ScreenWrapper from "../components/ScreenWrapper";
import Header from "../components/Header";
import Button from "../components/Button";
import { colors, spacing, typography } from "../styles/theme";
import { deleteAccount } from "../api/auth";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";

export default function DeleteAccountScreen() {
  const navigation = useNavigation<any>();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);

  const confirmAndDelete = async () => {
    Alert.alert(
      "Delete account",
      "This will permanently delete your account, uploaded photos, generated books, and related data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              const manifest = await deleteAccount();
              // Navigate to receipt screen; logout from there
              navigation.navigate('DeleteReceipt', { manifest });
            } catch (e: any) {
              Alert.alert(
                "Deletion failed",
                e?.response?.data?.detail || "Unable to delete account. Please try again."
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenWrapper>
      <Header title="Delete Account" showBack />
      <View style={styles.container}>
        <Text style={styles.title}>Delete your account</Text>
        <Text style={styles.paragraph}>
          Deleting your account will permanently remove your profile, uploaded
          photos, generated books, thumbnails, and related data from our
          systems. This action cannot be undone.
        </Text>
        <Text style={styles.paragraph}>
          If you have an active purchase, you may want to download your PDF
          books first. You can always create a new account later.
        </Text>
        <Button
          title={loading ? "Deleting…" : "Delete account and all data"}
          onPress={confirmAndDelete}
          variant="danger"
          disabled={loading}
          style={{ marginTop: spacing(4) }}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing(4),
  },
  title: {
    ...typography.headingM,
    marginBottom: spacing(2),
    color: colors.textPrimary,
  },
  paragraph: {
    ...typography.body,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: spacing(2.5),
  },
});
