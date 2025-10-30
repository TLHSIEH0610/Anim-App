import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { radii, spacing } from "../styles/theme";
import { BottomNavigation, useTheme } from "react-native-paper";

type TabKey = "all" | "purchased" | "account";

export default function BottomNav({ active }: { active: TabKey }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const tabs: Array<{
    key: TabKey;
    title: string;
    icon: string;
    route: string;
  }> = [
    {
      key: "all",
      title: "Books",
      icon: "book-open-variant",
      route: "AllBooks",
    },
    {
      key: "purchased",
      title: "Purchased",
      icon: "library",
      route: "BookLibrary",
    },
    {
      key: "account",
      title: "Account",
      icon: "account-circle",
      route: "Account",
    },
  ];
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.key === active)
  );

  return (
    // <View style={[styles.container, { bottom: insets.bottom + spacing(2), backgroundColor: (theme as any).colors?.elevation?.level2 || 'rgba(255,255,255,0.95)' }]}>
    <BottomNavigation.Bar
      navigationState={{
        index,
        routes: tabs.map((t) => ({
          key: t.key,
          title: t.title,
          icon: t.icon,
        })) as any,
      }}
      onTabPress={({ route }) => {
        const tab = tabs.find((t) => t.key === (route.key as TabKey));
        if (tab) navigation.navigate(tab.route);
      }}
    />
    // </View>
  );
}

// const styles = StyleSheet.create({
//   container: {
//     position: "absolute",
//     left: spacing(4),
//     right: spacing(4),
//     bottom: spacing(2),
//     borderRadius: radii.xl,
//   },
// });
