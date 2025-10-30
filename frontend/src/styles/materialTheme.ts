import { MD3LightTheme as DefaultTheme, configureFonts } from 'react-native-paper';
import { colors as appColors } from './theme';

const fontConfig = configureFonts({
  config: {
    fontFamily: 'System',
  },
});

export const materialTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: appColors.primary,
    primaryContainer: appColors.primarySoft,
    onPrimary: appColors.surface,
    secondary: appColors.info,
    secondaryContainer: appColors.neutral100,
    onSecondary: appColors.textPrimary,
    background: appColors.background,
    surface: appColors.surface,
    surfaceVariant: appColors.neutral100,
    onSurface: appColors.textPrimary,
    outline: appColors.neutral200,
    error: appColors.danger,
    onError: appColors.surface,
  },
  fonts: fontConfig,
};

