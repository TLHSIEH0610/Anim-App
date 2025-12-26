import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Alert, Platform, ActivityIndicator as RNActivityIndicator, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { ActivityIndicator, Chip } from "react-native-paper";
import {
  getStoryTemplates,
  StoryTemplateSummary,
  getThumbUrl,
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
const BLURHASH = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

const formatCurrency = (amount: number, currency?: string | null) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "AUD").toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    const cur = (currency || "AUD").toUpperCase();
    const val = Number.isFinite(amount) ? amount : 0;
    return `${cur} ${val.toFixed(2)}`;
  }
};

function TemplateItem({
  item,
  onChoose,
}: {
  item: StoryTemplateSummary;
  onChoose: (slug: string) => void;
}) {
  const { token } = useAuth();
  const [failed, setFailed] = useState(false);
  const [useAltCover, setUseAltCover] = useState(false);
  const [imgLoading, setImgLoading] = useState<boolean>(true);
  const targetHeight = 140;
  const coverAspect = 1152 / 1600;
  const coverWidth = Math.round(targetHeight * coverAspect);
  // Only attempt to load when token is available to avoid 401s that set failed=true
  const canLoad = !!token && !!item.cover_path;
  const coverUrl = canLoad ? getThumbUrl({ path: item.cover_path!, token, width: 320, version: (item as any).version }) : null;
  const altCoverUrl = canLoad ? getStoryCoverUrl(item.cover_path!, token || null) : null;
  const chosenUrl = !useAltCover ? coverUrl : altCoverUrl;
  const source = chosenUrl && !failed ? ({ uri: chosenUrl } as any) : fallbackCover;

  // Reset failure state when URL changes (e.g., when token becomes available)
  React.useEffect(() => {
    setFailed(false);
    setImgLoading(true);
  }, [coverUrl]);

  React.useEffect(() => {
    if (coverUrl) {
      console.log("[Books] Cover URL", { slug: item.slug, coverUrl });
    } else {
      console.log("[Books] No cover URL available yet", {
        slug: item.slug,
        tokenPresent: !!token,
        cover_path: item.cover_path,
      });
    }
  }, [coverUrl]);

  return (
    <Card style={styles.card}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>
          {item.name}
        </Text>
        {(() => {
          const base = (item as any).price_dollars as number | undefined;
          const final = (item as any).final_price as number | undefined;
          const discount = (item as any).discount_price as number | undefined;
          const promo = (item as any).promotion_label as string | undefined;
          const isFree = typeof final === 'number' && final <= 0;
          const isDiscount = typeof discount === 'number' && typeof base === 'number' && discount < base;
          if (isFree) {
            return (
              <Chip compact style={styles.freeBadge} textStyle={styles.badgeText as any}>FREE</Chip>
            );
          }
          if (isDiscount || (promo && promo.trim().length)) {
            return (
              <Chip compact style={styles.saleBadge} textStyle={styles.badgeText as any}>
                {(promo || 'SALE').toUpperCase()}
              </Chip>
            );
          }
          return null;
        })()}
      </View>

      {/* Content row: cover | details */}
      <View style={styles.row}>
        <View style={styles.leftCol}>
          <View style={[styles.coverThumbWrap, { width: coverWidth, height: targetHeight }]}>
          <Image
            key={chosenUrl || "fallback"}
            source={source as any}
            style={styles.coverThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            placeholder={{ blurhash: BLURHASH }}
            transition={150}
            onLoadStart={() => setImgLoading(true)}
            onError={(e: any) => {
              try {
                console.warn('[Books][CoverError]', item.slug, chosenUrl, e?.error || e);
              } catch {}
              if (!useAltCover && altCoverUrl) {
                setUseAltCover(true);
              } else {
                setFailed(true);
              }
              setImgLoading(false);
            }}
            onLoad={() => setImgLoading(false)}
          />
          {imgLoading && (
            <View style={styles.imageSpinner} pointerEvents="none">
              <RNActivityIndicator size="small" color={colors.neutral500} />
            </View>
          )}
          </View>
        </View>
        <View style={styles.rightCol}>
          <View>
            {item.description ? (
              <Text style={styles.desc}>{item.description}</Text>
            ) : null}
            <Text style={styles.meta}>
              Suggested Age: {item.age || "n/a"} •{" "}
              {Math.max(0, (item.page_count || 0) - 2)} pages
            </Text>
            <View style={styles.priceRow}>
              {(() => {
                const base = (item as any).price_dollars as number | undefined;
                const final = (item as any).final_price as number | undefined;
                const discount = (item as any).discount_price as number | undefined;
                const currency = (item as any).currency as string | undefined;
                const promo = (item as any).promotion_label as string | undefined;
                const isFree = typeof final === "number" && final <= 0;
                const isDiscount = typeof discount === "number" && typeof base === "number" && discount < base;
                if (isDiscount && typeof discount === "number" && typeof base === "number") {
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={styles.priceOriginal}>{formatCurrency(base, currency)}</Text>
                      <Text style={styles.priceFinal}>{formatCurrency(discount, currency)}</Text>
                    </View>
                  );
                }
                if (isFree) {
                  return <Text style={styles.priceFinal}>Free</Text>;
                }
                if (typeof final === "number") {
                  return <Text style={styles.priceFinal}>{formatCurrency(final, currency)}</Text>;
                }
                if (typeof base === "number") {
                  return <Text style={styles.priceFinal}>{formatCurrency(base, currency)}</Text>;
                }
                return <Text style={styles.meta}>Pricing unavailable</Text>;
              })()}
            </View>
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
  const { user } = useAuth();
  const [templates, setTemplates] = useState<StoryTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTemplates = React.useCallback(async (isPull?: boolean) => {
    if (isPull) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await getStoryTemplates();
      const items = res.stories || [];
      const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
      const filtered = isAdmin
        ? items
        : items.filter((t) => !(t.free_trial_slug && t.free_trial_consumed));
      setTemplates(filtered);
    } catch (e) {
      setError("Failed to load stories");
    } finally {
      if (isPull) setRefreshing(false); else setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchTemplates(true)}
              colors={[colors.primary]}
            />
          }
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
    backgroundColor: "rgba(247, 234, 192, 0.65)",
    // backgroundColor: "rgba(37, 99, 235, 0.12)",

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
  cardBody: {
    flexDirection: 'column',
  },
  detailsBlock: {
    marginTop: spacing(2),
  },
  coverThumbWrap: {
    width: "100%",
    backgroundColor: colors.neutral100,
    borderRadius: radii.md,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  coverThumb: {
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
  title: {
    ...typography.headingM,
    color: colors.textPrimary,
    // Make the title feel a bit more magical without adding new fonts
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as any,
    fontWeight: '700',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(157, 78, 221, 0.35)', // soft lavender glow
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing(1),
  },
  priceOriginal: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  priceFinal: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  badgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 10,
    lineHeight: 12,
  },
  saleBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing(0.5),
    paddingVertical: 0,
    borderRadius: radii.sm,
    minHeight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing(0.5),
    paddingVertical: 0,
    borderRadius: radii.sm,
    minHeight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
  },
  actionsRight: {
    alignSelf: "flex-end",
  },
  error: {
    color: colors.danger,
  },
});
