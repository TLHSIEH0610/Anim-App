import React from "react";
import {
  GestureResponderEvent,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Button as PaperButton } from "react-native-paper";
import { colors, radii, spacing, shadow, typography } from "../styles/theme";

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "destructive"
  | "success"
  | "warning"
  | "info"
  | "neutral"
  | "background";
type Size = "sm" | "md" | "lg";

type Props = {
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  style,
  leftIcon,
  rightIcon,
}: Props) {
  const isDisabled = disabled || loading;
  const resolvedVariant = variant === "destructive" ? "danger" : variant;

  const getVariantVisuals = (v: Variant) => {
    switch (v) {
      case "secondary":
        return {
          mode: "outlined" as const,
          buttonColor: undefined,
          textColor: colors.textPrimary,
          disabledButtonColor: undefined,
          disabledTextColor: colors.neutral400,
        };
      case "danger":
        return {
          mode: "contained" as const,
          buttonColor: colors.danger,
          textColor: colors.surface,
          disabledButtonColor: colors.neutral200,
          disabledTextColor: colors.neutral500,
        };
      case "success":
        return {
          mode: "contained" as const,
          buttonColor: colors.success,
          textColor: colors.surface,
          disabledButtonColor: colors.neutral200,
          disabledTextColor: colors.neutral500,
        };
      case "warning":
        return {
          mode: "contained" as const,
          buttonColor: colors.warning,
          textColor: colors.surface,
          disabledButtonColor: colors.neutral200,
          disabledTextColor: colors.neutral500,
        };
      case "info":
        return {
          mode: "contained" as const,
          buttonColor: colors.info,
          textColor: colors.surface,
          disabledButtonColor: colors.neutral200,
          disabledTextColor: colors.neutral500,
        };
      case "neutral":
        return {
          mode: "contained" as const,
          buttonColor: colors.neutral400,
          textColor: colors.surface,
          disabledButtonColor: colors.neutral200,
          disabledTextColor: colors.neutral500,
        };
      case "background":
        return {
          mode: "contained" as const,
          buttonColor: colors.background,
          textColor: colors.textPrimary,
          disabledButtonColor: colors.neutral200,
          disabledTextColor: colors.neutral500,
        };
      case "primary":
      default:
        return {
          mode: "contained" as const,
          buttonColor: colors.primary,
          textColor: colors.surface,
          disabledButtonColor: colors.neutral200,
          disabledTextColor: colors.neutral500,
        };
    }
  };

  const {
    mode,
    buttonColor,
    textColor,
    disabledButtonColor,
    disabledTextColor,
  } = getVariantVisuals(resolvedVariant);
  const isIconOnly = !title || title.trim().length === 0;
  const contentStyle = [
    size === "sm" && styles.sizeSm,
    size === "lg" && styles.sizeLg,
    isIconOnly && size === "sm" && styles.iconOnlySm,
  ];
  const labelStyle = [
    styles.label,
    size === "sm" && styles.labelSm,
    size === "lg" && styles.labelLg,
  ];
  const finalTextColor = isDisabled ? disabledTextColor : textColor;

  return (
    <PaperButton
      mode={mode}
      onPress={onPress}
      disabled={isDisabled}
      loading={!!loading}
      buttonColor={isDisabled ? disabledButtonColor : buttonColor}
      textColor={finalTextColor}
      contentStyle={contentStyle as any}
      compact={size === "sm"}
      style={[styles.paperBase, style]}
    >
      {leftIcon ? (
        <View style={[styles.iconLeft, isIconOnly && styles.iconOnlyMargin]}>
          {leftIcon}
        </View>
      ) : null}
      {title ? (
        <Text style={[labelStyle as any, { color: finalTextColor }]}>
          {title}
        </Text>
      ) : null}
      {rightIcon ? (
        <View style={[styles.iconRight, isIconOnly && styles.iconOnlyRight]}>
          {rightIcon}
        </View>
      ) : null}
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  paperBase: {
    borderRadius: radii.lg,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sizeSm: {
    paddingHorizontal: spacing(1.5),
    borderRadius: radii.md,
  },
  iconOnlySm: {
    paddingHorizontal: spacing(0.5),
    borderRadius: radii.md,
  },
  sizeLg: {
    paddingHorizontal: spacing(4),
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.neutral100,
    borderWidth: 1,
    borderColor: colors.neutral200,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  disabled: {
    opacity: 0.6,
  },
  iconLeft: {
    marginRight: spacing(2),
  },
  iconOnlyMargin: {
    marginRight: 0,
  },
  iconRight: {
    marginLeft: spacing(2),
  },
  iconOnlyRight: {
    marginLeft: 0,
  },
  label: {
    ...typography.body,
    fontWeight: "600",
  },
  labelSm: {
    fontSize: 13,
  },
  labelLg: {
    fontSize: 18,
  },
  labelOnDark: {
    color: colors.surface,
  },
  labelOnLight: {
    color: colors.textPrimary,
  },
});
