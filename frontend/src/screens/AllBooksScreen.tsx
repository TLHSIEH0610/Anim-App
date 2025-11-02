import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Alert, Image } from "react-native";
import { ActivityIndicator } from "react-native-paper";
import {
  getStoryTemplates,
  StoryTemplateSummary,
  getStoryCoverUrl,
} from "../api/books";
import ScreenWrapper from "../components/ScreenWrapper";
import BottomNav from "../components/BottomNav";
import Card from "../components/Card";
import { colors, radii, shadow, spacing, typography } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import Button from "../components/Button";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/types";
import Header from "../components/Header";

const fallbackCover = require("../../assets/icon.png");

function TemplateItem({
  item,
  onChoose,
}: {
  item: StoryTemplateSummary;
  onChoose: (slug: string) => void;
}) {
  const { token } = useAuth();
  const [failed, setFailed] = useState(false);
  const [imgWidth, setImgWidth] = useState<number>(130);
  const targetHeight = 140;
  // Only attempt to load when token is available to avoid 401s that set failed=true
  const canLoad = !!token && !!item.cover_path;
  const coverUrl = canLoad ? getStoryCoverUrl(item.cover_path, token ?? null) : null;
  const source = coverUrl && !failed ? ({ uri: coverUrl } as any) : fallbackCover;

  // Reset failure state when URL changes (e.g., when token becomes available)
  React.useEffect(() => {
    setFailed(false);
  }, [coverUrl]);

  const handleImageLoad = (e: any) => {
    const natW = e?.nativeEvent?.source?.width;
    const natH = e?.nativeEvent?.source?.height;
    if (natW && natH) {
      const scaled = Math.max(100, Math.min(200, Math.round((targetHeight / natH) * natW)));
      setImgWidth(scaled + 8);
    }
  };

  React.useEffect(() => {
    if (coverUrl) {
      console.log('[Books] Cover URL', { slug: item.slug, coverUrl });
      // Try prefetch to surface any network errors early
      // Note: boolean result indicates cache success; failures will reject
      // @ts-ignore RN Image API
      Image.prefetch(coverUrl)
        .then((ok: boolean) => console.log('[Books] Prefetch result', { slug: item.slug, ok }))
        .catch((err: any) => console.log('[Books] Prefetch error', { slug: item.slug, err: String(err) }));
    } else {
      console.log('[Books] No cover URL available yet', { slug: item.slug, tokenPresent: !!token, cover_path: item.cover_path });
    }
  }, [coverUrl]);

  return (
    <Card style={styles.card}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>
          {item.name}
        </Text>
      </View>

      {/* Content row: cover | details */}
      <View style={styles.row}>
        <View style={styles.leftCol}>
          <View style={[styles.coverThumbWrap, { width: imgWidth }]}> 
            <Image
              key={coverUrl || 'fallback'}
              source={source as any}
              style={[styles.coverThumb, { width: imgWidth - 8, height: targetHeight }]}
              resizeMode="contain"
              onError={() => setFailed(true)}
              onLoad={handleImageLoad}
            />
          </View>
        </View>
        <View style={styles.rightCol}>
          <View>
            {item.description ? (
              <Text style={styles.desc}>{item.description}</Text>
            ) : null}
            <Text style={styles.meta}>
              Suggested Age: {item.age || "n/a"} • {item.page_count} pages
            </Text>
          </View>
          <View style={[styles.primaryActions, styles.actionsRight]}>
            <Button
              title="View book"
              onPress={() => onChoose(item.slug)}
              variant="primary"
              size="sm"
            />
          </View>
        </View>
      </View>
      
    </Card>
  );
}

export default function AllBooksScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [templates, setTemplates] = useState<StoryTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getStoryTemplates();
        setTemplates(res.stories || []);
      } catch (e) {
        setError("Failed to load stories");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleChoose = (slug: string, template?: StoryTemplateSummary) => {
    if (template) {
      navigation.navigate("TemplateDemo", { template });
    } else {
      navigation.navigate("TemplateDemo", {
        template: templates.find((t) => t.slug === slug)!,
      });
    }
  };

  const renderItem = ({ item }: { item: StoryTemplateSummary }) => (
    <TemplateItem item={item} onChoose={(slug) => handleChoose(slug, item)} />
  );

  return (
    <ScreenWrapper showIllustrations footer={<BottomNav active="all" />}>
      <Header title="Books" subtitle="Choose a story to personalize" />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(t) => t.slug}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingBottom: spacing(24),
  },
  card: {
    marginBottom: spacing(3),
    backgroundColor: "#FFF8E1",
    borderRadius: radii.lg,
    ...shadow.subtle,
    padding: spacing(2),
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing(2),
  },
  row: {
    flexDirection: "row",
    gap: spacing(3),
    alignItems: "stretch",
  },
  leftCol: {
    flexShrink: 0,
    marginRight: spacing(2),
  },
  rightCol: {
    flex: 1,
    justifyContent: 'space-between',
  },
  coverThumbWrap: {
    width: "100%",
    backgroundColor: colors.neutral100,
    borderRadius: radii.md,
    overflow: "hidden",
    alignSelf: "flex-start",
    alignItems: "center",
    padding: spacing(1),
  },
  coverThumb: {
    height: 140,
    borderRadius: radii.md,
  },
  title: {
    ...typography.headingM,
    color: colors.textPrimary,
  },
  desc: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing(1.5),
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  primaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  actionsRight: {
    alignSelf: 'flex-end',
  },
  error: {
    color: colors.danger,
  },
});
