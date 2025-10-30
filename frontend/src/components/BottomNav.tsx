import React from "react";
import { StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BottomNavigation, useTheme } from "react-native-paper";

type TabKey = "all" | "purchased" | "account";

export default function BottomNav({ active }: { active: TabKey }) {
  const navigation = useNavigation<any>();
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
    <BottomNavigation.Bar
      style={styles.bar}
      safeAreaInsets={{ bottom: 0 }}
      activeColor={theme.colors.primary}
      inactiveColor={theme.colors.onSurfaceVariant ?? theme.colors.outline}
      indicatorStyle={{ backgroundColor: theme.colors.primary }}
      navigationState={{
        index,
        routes: tabs.map((t) => ({
          key: t.key,
          title: t.title,
          focusedIcon: t.icon,
          unfocusedIcon: t.icon,
        })) as any,
      }}
      onTabPress={({ route }) => {
        const tab = tabs.find((t) => t.key === (route.key as TabKey));
        if (tab) navigation.navigate(tab.route);
      }}
    />

  );
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: "stretch",
    borderRadius: 0,
    paddingHorizontal: 0,
  },
});

