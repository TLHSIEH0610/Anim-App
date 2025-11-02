import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Image, ScrollView } from "react-native";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { AppStackParamList } from "../navigation/types";
import { StoryTemplateSummary, getMediaFileUrl } from "../api/books";
import ScreenWrapper from "../components/ScreenWrapper";
import Header from "../components/Header";
import Button from "../components/Button";
import { colors, radii, shadow, spacing, typography } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

type TemplateDemoRoute = RouteProp<AppStackParamList, "TemplateDemo">;

export default function TemplateDemoScreen() {
  const { params } = useRoute<TemplateDemoRoute>();
  const navigation = useNavigation();
  const { token } = useAuth();
  const template: StoryTemplateSummary = params.template;

  const demoImageUrls = useMemo(() => {
    const list = template.demo_images || [];
    return list
      .filter(Boolean)
      .map((p) => getMediaFileUrl(p!))
      .filter(Boolean) as string[];
  }, [template.demo_images]);

  const goCreate = () => {
    // Navigate to creation with this template
    // @ts-ignore navigation is untyped here; stack param handles it at runtime
    navigation.navigate("BookCreation", { templateSlug: template.slug });
  };

  return (
    <ScreenWrapper>
      <Header
        title={template.name}
        subtitle={`${template.page_count} pages • ${
          template.age || "All ages"
        }`}
        showBack
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Demo Images */}
        <Text style={styles.sectionTitle}>Demo Images</Text>
        <View style={styles.grid}>
          {demoImageUrls.length === 0 ? (
            <Text style={styles.muted}>No demo images uploaded yet.</Text>
          ) : (
            demoImageUrls.map((url, idx) => (
              <View key={idx} style={styles.thumb}>
                <Image
                  source={
                    {
                      uri: url,
                      headers: token
                        ? { Authorization: `Bearer ${token}` }
                        : undefined,
                    } as any
                  }
                  style={styles.image}
                  resizeMode="cover"
                />
              </View>
            ))
          )}
        </View>

        {/* Image Prompts */}
        <Text style={[styles.sectionTitle, { marginTop: spacing(4) }]}>
          Story Line
        </Text>
        <View style={styles.promptsBox}>
          {(template.storyline_pages || []).map((p) => (
            <View key={p.page_number} style={styles.promptItem}>
              <Text style={styles.promptTitle}>Page {p.page_number}</Text>
              <Text style={styles.promptText}>{p.image_prompt}</Text>
            </View>
          ))}
          {(!template.storyline_pages ||
            template.storyline_pages.length === 0) && (
            <Text style={styles.muted}>
              No prompts provided for this template.
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <Button title="Create Book" onPress={goCreate} variant="primary" />
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing(3),
    paddingBottom: spacing(10),
  },
  sectionTitle: {
    ...typography.headingM,
    color: colors.textPrimary,
    marginBottom: spacing(2),
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12 as any,
  },
  thumb: {
    width: "48%",
    aspectRatio: 4 / 3,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: colors.neutral100,
    ...shadow.subtle,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  promptsBox: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing(2.5),
    ...shadow.subtle,
  },
  promptItem: {
    marginBottom: spacing(2),
  },
  promptTitle: {
    ...typography.headingS,
    color: colors.textPrimary,
    marginBottom: spacing(0.5),
  },
  promptText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  muted: {
    ...typography.caption,
    color: colors.textMuted,
  },
  actions: {
    marginTop: spacing(4),
  },
});
