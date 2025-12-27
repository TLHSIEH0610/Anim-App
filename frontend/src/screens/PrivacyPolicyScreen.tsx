import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../styles/theme";

const PrivacyPolicyScreen = () => {
  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Kid to Story Privacy Policy</Text>
        <Text style={styles.meta}>Effective date: November 10, 2025</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Overview</Text>
        <Text style={styles.paragraph}>
          Kid to Story helps caregivers turn family photos and prompts into
          personalized children&apos;s books. We respect the sensitivity of the
          information you share and are committed to handling it responsibly.
          This Privacy Policy explains the data we collect, how we use it, and
          the choices available to you when you use our mobile application,
          website, and related services (together, the &quot;Services&quot;).
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Information We Collect</Text>
        <Text style={styles.paragraph}>
          We collect information that you provide directly, data that is
          generated while you use the Services, and limited information from
          third parties.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Account details: name, email address, and profile photo
          supplied through Google Sign-In.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Book inputs: names, pronouns, story preferences, captions,
          and uploaded reference images for the child featured in a book.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Transaction data: purchase history, credit usage, payment
          status, and Stripe payment intent identifiers. Stripe processes card
          numbers and other sensitive card data on our behalf; we never store
          full card numbers.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Usage data: device information (model, operating system,
          unique app identifiers), crash logs, IP address, time zone, and in-app
          interactions needed to troubleshoot issues and secure the Services.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Support communications: messages you send to our team and
          related metadata.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. How We Use Information</Text>
        <Text style={styles.listItem}>
          {`\u2022`} Provide, personalize, and maintain the Services, including
          generating books and delivering media.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Authenticate users and secure accounts, prevent fraud, and
          enforce our Terms of Service.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Process payments, issue invoices or receipts, and manage
          credits or free trials.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Improve product performance, develop new features, and
          troubleshoot operational issues.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Communicate with you about updates, support, and important
          changes to the Services.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Comply with legal obligations and respond to lawful
          requests or court orders.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>4. How We Share Information</Text>
        <Text style={styles.paragraph}>
          We do not sell or rent personal information. We share information only
          as needed to run Kid to Story or when you direct us to do so.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Service providers: hosting, cloud storage, analytics,
          content delivery, and customer support partners who process data under
          our instructions.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Payment processors: Stripe securely processes card payments
          and may collect personal data required to complete transactions.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Image generation infrastructure: ComfyUI workloads receive
          the prompts and images you submit to render illustrations. Generated
          assets are stored in our managed storage to deliver books back to you.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Legal and safety: we may disclose information if required
          by law, subpoena, or when we believe disclosure is necessary to
          protect the rights, property, or safety of Kid to Story, our users, or
          others.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Business transfers: if part or all of Kid to Story is
          involved in a merger, acquisition, financing, or sale of assets,
          information may be shared or transferred as part of that transaction.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          5. Protection of Children&apos;s Data
        </Text>
        <Text style={styles.paragraph}>
          Kid to Story is designed for parents, guardians, and educators.
          Children are not permitted to create accounts. We collect
          children&apos;s names, pronouns, and photos only when submitted by an
          adult user to produce a personalized book. We rely on the submitting
          adult to obtain any required consent from a parent or guardian. If we
          learn that we have collected personal information from a child without
          proper authorization, we will delete it promptly. You can request
          deletion at any time by contacting us.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>6. Data Retention</Text>
        <Text style={styles.paragraph}>
          We retain personal information for as long as your account is active
          or as needed to provide the Services. Generated books, images, and
          related files are stored for your convenience; unless otherwise
          stated, we keep generated content and backups for up to 60 days, after
          which it may be deleted or archived. You can delete content at any
          time from within the app or by contacting us. We may retain certain
          records after account closure to comply with legal, tax, or accounting
          requirements.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7. Your Rights and Choices</Text>
        <Text style={styles.listItem}>
          {`\u2022`} Access, correct, or delete account information by
          contacting us or using in-app controls.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Download book media or request that we delete stored
          uploads and generated assets.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Opt out of promotional emails by using unsubscribe links or
          contacting support.
        </Text>
        <Text style={styles.listItem}>
          {`\u2022`} Residents of certain jurisdictions (including the EEA, UK,
          and California) may have additional rights such as data portability,
          restriction, or objection. We honor those requests in accordance with
          applicable law.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>8. Security</Text>
        <Text style={styles.paragraph}>
          We implement administrative, technical, and physical safeguards
          designed to protect personal information, including encrypted
          transport, scoped employee access, and regular monitoring of our
          infrastructure. No online service can guarantee complete security, so
          please use unique passwords and notify us immediately if you suspect
          unauthorized access to your account.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>9. International Data Transfers</Text>
        <Text style={styles.paragraph}>
          Kid to Story operates globally, and your information may be
          transferred to, stored, and processed in countries where we or our
          trusted service providers maintain operations. We take reasonable
          steps to ensure that such transfers comply with applicable data
          protection laws and that appropriate safeguards (such as Standard
          Contractual Clauses or equivalent mechanisms) are in place to protect
          your personal information.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>10. Changes to This Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy to reflect changes in our practices
          or legal obligations. If we make material changes, we will provide
          notice in the app or by email before the changes take effect.
          Continued use of the Services after the effective date means you
          accept the revised policy.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>11. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have any questions or requests regarding this Privacy Policy,
          please reach out to us at{" "}
          <Text style={styles.link}>arnie@back2.dev</Text>.
        </Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(8),
  },
  title: {
    ...typography.headingXL,
    textAlign: "left",
    marginBottom: spacing(2),
  },
  meta: {
    ...typography.caption,
    marginBottom: spacing(6),
  },
  section: {
    marginBottom: spacing(6),
  },
  sectionTitle: {
    ...typography.headingM,
    marginBottom: spacing(2),
  },
  paragraph: {
    ...typography.body,
    lineHeight: 22,
  },
  listItem: {
    ...typography.body,
    lineHeight: 22,
    marginBottom: spacing(2),
  },
  link: {
    color: colors.primary,
  },
});

export default PrivacyPolicyScreen;
