export const colors = {
  background: '#f6f8fb',
  surface: '#ffffff',
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primarySoft: '#e0e7ff',
  accent: '#f59e0b',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#0ea5e9',
  darkblue:'#304D7D',
  neutral100: '#f1f5f9',
  neutral200: '#e2e8f0',
  neutral300: '#cbd5f5',
  neutral400: '#94a3b8',
  neutral500: '#64748b',
  textPrimary: '#1f2937',
  textSecondary: '#4b5563',
  textMuted: '#6b7280',
  lightYellow:'#FFF8E1',
};

export const spacing = (multiplier: number) => multiplier * 4;

export const radii = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 3,


  },
  subtle: {

            shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
};

export const typography = {
  headingXL: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  headingL: {
    fontSize: 22,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  headingM: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  headingS: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 13,
    color: colors.textMuted,
  },
};

export const statusColors: Record<string, string> = {
  creating: colors.warning,
  generating_story: colors.primary,
  generating_images: '#8b5cf6',
  composing: colors.info,
  completed: colors.success,
  failed: colors.danger,
};
