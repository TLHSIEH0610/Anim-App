import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import ScreenWrapper from "../components/ScreenWrapper";
import BottomNav from "../components/BottomNav";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing, typography } from "../styles/theme";
 
import Button from "../components/Button";
import Header from "../components/Header";
import { getStoryTemplates } from "../api/books";
import { useNavigation } from "@react-navigation/native";

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation<any>();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    // Fetch a lightweight source of the user's credits from templates payload
    (async () => {
      try {
        const res = await getStoryTemplates();
        const first = res?.stories?.[0];
        if (first && typeof first.credits_balance === "number") {
          setCredits(first.credits_balance);
        }
      } catch (e) {
        // Non-fatal; leave credits as null
      }
    })();
  }, []);

  return (
    <ScreenWrapper showIllustrations footer={<BottomNav active="account" />}>
      <Header title="Account" subtitle="Manage your profile and billing" />

      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{user?.name || "—"}</Text>
        <Text style={[styles.label, { marginTop: spacing(3) }]}>Email</Text>
        <Text style={styles.value}>{user?.email || "—"}</Text>
        <Text style={[styles.label, { marginTop: spacing(3) }]}>Credits</Text>
        <Text style={styles.value}>
          {credits === null ? "—" : String(credits)}
        </Text>
      </View>

      <Button
        title="View Billing"
        onPress={() => navigation.navigate("BillingHistory")}
        variant="info"
      />

      <Button
        title="Privacy Policy (Last updated: Nov 10, 2025)"
        onPress={() => navigation.navigate('PrivacyPolicy')}
        variant="background"
        style={{ marginTop: spacing(2) }}
      />
      <Button
        title="Terms of Service"
        onPress={() => navigation.navigate('TermsOfService')}
        variant="background"
        style={{ marginTop: spacing(2) }}
      />
      <Button
        title="Children's Privacy"
        onPress={() => navigation.navigate('PrivacyPolicy')}
        variant="background"
        style={{ marginTop: spacing(2) }}
      />


      <Button
        title="Logout"
        onPress={logout}
        variant="danger"
        style={{ marginTop: spacing(3) }}
      />

      <Button
        title="Delete account and all data"
        onPress={() => navigation.navigate('DeleteAccount')}
        variant="danger"
        style={{ marginTop: spacing(2) }}
      />

      <Button
        title="Contact Support"
        onPress={() => navigation.navigate('Support')}
        variant="background"
        style={{ marginTop: spacing(2) }}
      />

    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#EAF4E2",
    borderRadius: radii.lg,
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  label: { ...typography.caption, color: colors.textSecondary },
  value: { ...typography.body, color: colors.textPrimary },
});
