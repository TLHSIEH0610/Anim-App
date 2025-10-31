import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors, spacing, radii, shadow, typography } from "../styles/theme";

type HeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightActionIcon?: string;
  onRightActionPress?: () => void;
};

export default function Header({
  title,
  subtitle,
  showBack,
  onBack,
  rightActionIcon,
  onRightActionPress,
}: HeaderProps) {
  const navigation = useNavigation<any>();

  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <LinearGradient
      colors={["#3c6dbdff", "#7a7ac0"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.decor}></View>
      <View style={styles.content}>
        {showBack ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={22}
              color={colors.background}
            />
          </TouchableOpacity>
        ) : null}

        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {rightActionIcon ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onRightActionPress}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons
              name={rightActionIcon as any}
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3),
    marginBottom: spacing(4),
    position: "relative",
    overflow: "hidden",
    ...shadow.subtle,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing(3),
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing(2),
  },
  title: {
    ...typography.headingL,
    color: colors.surface,
    textAlign: "left",
  },
  subtitle: {
    marginTop: spacing(1),
    ...typography.caption,
    color: colors.primarySoft,
    textAlign: "left",
  },
  iconButton: {
    width: spacing(9),
    height: spacing(9),
    borderRadius: radii.pill,
    // backgroundColor: "rgba(37, 99, 235, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  decor: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 100,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    top: -60,
    right: -25,
  },
});
