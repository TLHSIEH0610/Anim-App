import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator as RNActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { AppStackParamList } from "../navigation/types";
import { StoryTemplateSummary, getThumbUrl } from "../api/books";
import ScreenWrapper from "../components/ScreenWrapper";
import Header from "../components/Header";
import Button from "../components/Button";
import { colors, radii, shadow, spacing, typography } from "../styles/theme";
const BLURHASH = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';
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
      .map((p) => getThumbUrl({ path: p!, token, width: 360, version: template.version }))
      .filter(Boolean) as string[];
  }, [template.demo_images, token, template.version]);

  const storylinePages = useMemo(() => {
    return (template.storyline_pages || []).filter((p) => p.page_number !== 0);
  }, [template.storyline_pages]);

  const goCreate = () => {
    // Navigate to creation with this template
    // @ts-ignore navigation is untyped here; stack param handles it at runtime
    navigation.navigate("BookCreation", { templateSlug: template.slug });
  };

  const [loadingByIndex, setLoadingByIndex] = useState<Record<number, boolean>>({});

  return (
    <ScreenWrapper>
      <Header
        title={template.name}
        subtitle={`${template.page_count} pages • ${
          template.age || "All"
        } ages`}
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
                  source={{ uri: url } as any}
                  style={styles.image}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  placeholder={{ blurhash: BLURHASH }}
                  transition={150}
                  onLoadStart={() => setLoadingByIndex((prev) => ({ ...prev, [idx]: true }))}
                  onLoad={() => setLoadingByIndex((prev) => ({ ...prev, [idx]: false }))}
                  onError={() => setLoadingByIndex((prev) => ({ ...prev, [idx]: false }))}
                />
                {loadingByIndex[idx] && (
                  <View style={styles.imageSpinner} pointerEvents="none">
                    <RNActivityIndicator size="small" color={colors.neutral500} />
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        <Text style={styles.demoNote}>
          Note: These demo images show the illustration style. Your character’s face will
          closely match the photos you upload.
        </Text>

        {/* Image Prompts */}
        <Text style={[styles.sectionTitle, { marginTop: spacing(4) }]}>
          Story Line
        </Text>
        <View style={styles.promptsBox}>
          {storylinePages.map((p) => (
            <View key={p.page_number} style={styles.promptItem}>
              <Text style={styles.promptTitle}>Page {p.page_number}</Text>
              <Text style={styles.promptText}>{p.image_prompt}</Text>
            </View>
          ))}
          {storylinePages.length === 0 && (
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
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as any,
    fontWeight: '700',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(157, 78, 221, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginBottom: spacing(2),
  },
  grid: {
    flexDirection: "column",
    gap: 12 as any,
  },
  thumb: {
    width: "100%",
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
  imageSpinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoNote: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing(1),
  },
  promptsBox: {
    borderRadius: radii.lg,
    backgroundColor: "#F0FFF0",
    // backgroundColor: "rgba(37, 99, 235, 0.12)",

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
    color: colors.textPrimary,
  },
  muted: {
    ...typography.caption,
    color: colors.textMuted,
  },
  actions: {
    marginTop: spacing(4),
  },
});
