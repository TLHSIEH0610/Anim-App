import React from 'react';
import { GestureResponderEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';
import { colors, radii, spacing, shadow, typography } from '../styles/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

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

export default function Button({ title, onPress, variant = 'primary', size = 'md', disabled, loading, style, leftIcon, rightIcon }: Props) {
  const isDisabled = disabled || loading;
  const resolvedVariant = variant === 'destructive' ? 'danger' : variant;

  const mode: 'contained' | 'outlined' | 'text' = resolvedVariant === 'primary' ? 'contained' : resolvedVariant === 'secondary' ? 'outlined' : 'contained';
  const contentStyle = [size === 'sm' && styles.sizeSm, size === 'lg' && styles.sizeLg];
  const labelStyle = [styles.label, size === 'sm' && styles.labelSm, size === 'lg' && styles.labelLg];

  const buttonColor = resolvedVariant === 'primary' ? colors.primary : resolvedVariant === 'danger' ? colors.danger : undefined;
  const textColor = resolvedVariant === 'secondary' ? colors.textPrimary : colors.surface;

  return (
    <PaperButton
      mode={mode}
      onPress={onPress}
      disabled={isDisabled}
      loading={!!loading}
      buttonColor={buttonColor}
      textColor={textColor}
      contentStyle={contentStyle as any}
      style={[styles.paperBase, style]}
      icon={leftIcon ? () => <View style={styles.iconLeft}>{leftIcon}</View> : undefined}
    >
      <Text style={labelStyle as any}>{title}</Text>
      {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  paperBase: {
    borderRadius: radii.lg,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeSm: {
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    borderRadius: radii.md,
  },
  sizeLg: {
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(5),
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
  iconRight: {
    marginLeft: spacing(2),
  },
  label: {
    ...typography.body,
    fontWeight: '600',
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
