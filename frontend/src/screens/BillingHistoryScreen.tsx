import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { fetchBillingHistory, BillingHistoryEntry } from "../api/billing";
import { colors, radii, shadow, spacing, typography } from "../styles/theme";
import { AppStackParamList } from "../navigation/types";
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
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{entry.template_slug || "Custom"}</Text>
        <View style={[styles.statusBadge, styles_status(entry.status)]}>
          <Text style={styles.statusText}>{entry.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.itemDetail}>Method: {entry.method === "credit" ? "Credits" : "Card"}</Text>
      <Text style={styles.itemDetail}>Amount: {amountLabel}</Text>
      <Text style={styles.itemDetail}>Date: {formatDateTime(entry.created_at)}</Text>
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
          <ActivityIndicator size="large" color={colors.primary} />
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Billing History</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>
      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing(12),
    paddingBottom: spacing(4),
    paddingHorizontal: spacing(4),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    ...typography.headingM,
    color: colors.primaryDark,
  },
  backButton: {
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(2.5),
  },
  backButtonText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 16,
  },
  backButtonPlaceholder: {
    width: spacing(8),
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


