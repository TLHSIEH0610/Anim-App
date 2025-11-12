import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, StyleProp, ViewStyle } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, Divider, Chip } from 'react-native-paper';
import { useFocusEffect } from "@react-navigation/native";
import { fetchBillingHistory, BillingHistoryEntry } from "../api/billing";
import { getStoryTemplates, StoryTemplateSummary } from "../api/books";
import { colors, radii, shadow, spacing, typography } from "../styles/theme";
import { AppStackParamList } from "../navigation/types";
import ScreenWrapper from "../components/ScreenWrapper";
import Button from "../components/Button";
import Header from "../components/Header";
const formatCurrency = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    const fallbackCurrency = (currency || "AUD").toUpperCase();
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return `${fallbackCurrency} ${safeAmount.toFixed(2)}`;
  }
};

const formatCredits = (value: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0";
  }
  return Number.isInteger(numeric) ? numeric.toString() : numeric.toFixed(2).replace(/\.0+$/, "");
};


const formatDateTime = (value: string) => {
  try {
    const date = new Date(value);
    return date.toLocaleString();
  } catch {
    return value;
  }
};

type HistoryStatus = "idle" | "loading" | "error";


type BillingHistoryScreenProps = NativeStackScreenProps<AppStackParamList, "BillingHistory">;

interface HistoryItemProps {
  entry: BillingHistoryEntry;
  templateNames?: Record<string, string>;
}

const statusStyleKey = (status: string) => `status_${status}` as keyof typeof styles;
const styles_status = (status: string): StyleProp<ViewStyle> =>
  (styles[statusStyleKey(status)] as StyleProp<ViewStyle>) || styles.status_default;
const STATUS_SHORT_LABELS: Record<string, string> = {
  completed: 'Completed',
  requires_confirmation: 'Needs Confirmation',
  failed: 'Failed',
};

const HistoryItem = ({ entry, templateNames }: HistoryItemProps) => {
  const amountLabel = entry.method === 'credit'
    ? `${formatCredits(entry.credits_used)} credits`
    : formatCurrency(entry.amount, entry.currency);
  const titleText = entry.template_slug
    ? (templateNames?.[entry.template_slug] || entry.template_slug)
    : 'Custom';

  return (
    <View style={styles.itemContainer}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemTitle, styles.titleWithChip]}>{titleText}</Text>
        <Chip
          compact
          style={[styles.statusBadge, styles_status(entry.status) as any, styles.statusChip]}
          textStyle={styles.statusText as any}
        >
          {STATUS_SHORT_LABELS[entry.status] || entry.status}
        </Chip>
      </View>

      <Text style={styles.itemMethod}>Method: {entry.method === 'credit' ? 'Credits' : 'Card'}</Text>
      <Text style={styles.itemAmount}>Amount: {amountLabel}</Text>
      <Text style={styles.itemDate}>Date: {formatDateTime(entry.created_at)}</Text>

      {entry.stripe_payment_intent_id ? (
        <Text style={styles.itemMeta}>Stripe ID: {entry.stripe_payment_intent_id}</Text>
      ) : null}
    </View>
  );
};

export default function BillingHistoryScreen({ navigation }: BillingHistoryScreenProps) {
  const [entries, setEntries] = useState<BillingHistoryEntry[]>([]);
  const [status, setStatus] = useState<HistoryStatus>("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});

  const loadHistory = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetchBillingHistory();
      setEntries(response.items || []);
      setStatus("idle");
    } catch (error: any) {
      console.error("Failed to load billing history", error?.response?.data || error);
      setStatus("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
      // Load template names to map slug -> human-readable name
      (async () => {
        try {
          const res = await getStoryTemplates();
          const list: StoryTemplateSummary[] = res.stories || [];
          const map: Record<string, string> = {};
          for (const t of list) {
            if (t.slug) map[t.slug] = t.name || t.slug;
          }
          setTemplateNames(map);
        } catch (e) {
          // Non-fatal: keep slugs as fallback
        }
      })();
    }, [loadHistory])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetchBillingHistory();
      setEntries(response.items || []);
    } catch (error: any) {
      console.error("Failed to refresh billing history", error?.response?.data || error);
    } finally {
      setRefreshing(false);
    }
  };

  const renderContent = () => {
    if (status === "loading" && !entries.length) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading history...</Text>
          <Button title="Back" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: spacing(3) }} />
        </View>
      );
    }

    if (status === "error" && !entries.length) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Unable to load billing history. Pull to refresh.</Text>
          <Button title="Back" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: spacing(3) }} />
        </View>
      );
    }

    if (!entries.length) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptySubtitle}>
            Payment activity will appear here when you redeem credits or purchase books.
          </Text>
          <Button title="Back" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: spacing(3) }} />
        </View>
      );
    }

    return (
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <HistoryItem entry={item} templateNames={templateNames} />}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(8) }}>
            <Button title="Back" variant="secondary" onPress={() => navigation.goBack()} />
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
      />
    );
  };

  return (
    <ScreenWrapper>
    <View style={styles.container}>
      <Header title="Billing History" showBack />
      {renderContent()}
    </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing(6),
  },
  loadingText: {
    marginTop: spacing(2),
    ...typography.body,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  emptyTitle: {
    ...typography.headingM,
    marginBottom: spacing(2),
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: "center",
    color: colors.textSecondary,
  },
  listContent: {
    padding: spacing(4),
    gap: spacing(3),
  },
  itemContainer: {
    backgroundColor: '#EAF4E2',
    borderRadius: radii.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    ...shadow.subtle,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing(2),
    position: 'relative',
  },
  itemTitle: {
    ...typography.headingS,
    color: colors.textPrimary,
    // allow wrapping
    flexShrink: 1,
    minWidth: 0,
  },
  titleWithChip: {
    paddingRight: 140, // reserve space for status chip on the right
  },
  statusChip: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  itemMethod: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing(1),
  },
  itemAmount: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: spacing(1),
  },
  itemDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing(1),
  },
  itemDetail: {
    ...typography.body,
    marginBottom: spacing(1.5),
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: spacing(1),
    paddingVertical: spacing(0.5),
    borderRadius: radii.pill,
  },
  statusText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '600',
  },
  status_completed: {
    backgroundColor: colors.success,
  },
  status_requires_confirmation: {
    backgroundColor: colors.warning,
  },
  status_failed: {
    backgroundColor: colors.danger,
  },
  status_default: {
    backgroundColor: colors.textSecondary,
  },
});
