import React, { useState } from "react";
import { View, Text, StyleSheet, Linking } from "react-native";
import ScreenWrapper from "../components/ScreenWrapper";
import Header from "../components/Header";
import Button from "../components/Button";
import { colors, spacing, typography } from "../styles/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";

const CONSENT_KEY = "guardian_consent_ack_v1";

export default function ConsentScreen() {
  const navigation = useNavigation<any>();
  const [checked, setChecked] = useState(false);

  const accept = async () => {
    await AsyncStorage.setItem(CONSENT_KEY, "1");
    navigation.goBack();
  };

  return (
    <ScreenWrapper>
      <Header title="Parental Consent" showBack />
      <View style={styles.container}>
        <Text style={styles.title}>Before you continue</Text>
        <Text style={styles.paragraph}>
          Kid to Story is designed for parents and guardians. You may upload a
          child’s name and photos only if you are the parent/guardian and have
          permission to do so. We use these photos only to create your book and
          you can delete them at any time.
        </Text>
        <Text style={styles.paragraph}>
          Learn more in our <Text style={styles.link} onPress={() => navigation.navigate('PrivacyPolicy')}>Privacy Policy</Text> (Children’s Privacy).
        </Text>

        <Button
          title={checked ? "I Understand and Agree" : "Please confirm you are a parent/guardian"}
          onPress={accept}
          disabled={!checked}
          variant="primary"
          style={{ marginTop: spacing(4) }}
        />
        <Button
          title={checked ? "Uncheck" : "I am a parent/guardian and 13+"}
          onPress={() => setChecked((v) => !v)}
          variant="background"
          style={{ marginTop: spacing(2) }}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing(4) },
  title: { ...typography.headingM, color: colors.textPrimary, marginBottom: spacing(2) },
  paragraph: { ...typography.body, color: colors.textSecondary, marginBottom: spacing(2) },
  link: { color: colors.primary, textDecorationLine: 'underline' },
});

