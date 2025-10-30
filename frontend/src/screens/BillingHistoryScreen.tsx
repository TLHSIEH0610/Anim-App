import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, StyleProp, ViewStyle } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, List, Divider, Chip } from 'react-native-paper';
import { useFocusEffect } from "@react-navigation/native";
import { fetchBillingHistory, BillingHistoryEntry } from "../api/billing";
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
}

const statusStyleKey = (status: string) => `status_${status}` as keyof typeof styles;
const styles_status = (status: string): StyleProp<ViewStyle> =>
  (styles[statusStyleKey(status)] as StyleProp<ViewStyle>) || styles.status_default;
const HistoryItem = ({ entry }: HistoryItemProps) => {
  const amountLabel = entry.method === "credit"
    ? `${formatCredits(entry.credits_used)} credits`
    : formatCurrency(entry.amount, entry.currency);

  return (
    <View style={styles.itemContainer}>
      <List.Item
        title={entry.template_slug || 'Custom'}
        description={`Method: ${entry.method === 'credit' ? 'Credits' : 'Card'}\nAmount: ${amountLabel}\nDate: ${formatDateTime(entry.created_at)}`}
        right={() => (
          <Chip compact style={[styles.statusBadge, styles_status(entry.status) as any]} textStyle={{ color: '#fff' }}>
            {entry.status.toUpperCase()}
          </Chip>
        )}
      />
      {entry.stripe_payment_intent_id ? (
        <Text style={styles.itemMeta}>Stripe ID: {entry.stripe_payment_intent_id}</Text>
      ) : null}
      <Divider style={{ marginTop: spacing(2) }} />
    </View>
  );
};

export default function BillingHistoryScreen({ navigation }: BillingHistoryScreenProps) {
  const [entries, setEntries] = useState<BillingHistoryEntry[]>([]);
  const [status, setStatus] = useState<HistoryStatus>("idle");
  const [refreshing, setRefreshing] = useState(false);

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
        </View>
      );
    }

    if (status === "error" && !entries.length) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Unable to load billing history. Pull to refresh.</Text>
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
        </View>
      );
    }

    return (
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <HistoryItem entry={item} />}
        contentContainerStyle={styles.listContent}
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
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.neutral200,
    ...shadow.subtle,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing(2),
  },
  itemTitle: {
    ...typography.headingS,
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
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: radii.pill,
  },
  statusText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "600",
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
