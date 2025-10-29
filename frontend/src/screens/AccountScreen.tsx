import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ScreenWrapper from '../components/ScreenWrapper';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { colors, radii, spacing, typography } from '../styles/theme';
import { useNavigation } from '@react-navigation/native';

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation<any>();

  return (
    <ScreenWrapper showIllustrations>
      <View style={styles.header}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.subtitle}>Manage your profile and billing</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{user?.name || '—'}</Text>
        <Text style={[styles.label, { marginTop: spacing(3) }]}>Email</Text>
        <Text style={styles.value}>{user?.email || '—'}</Text>
      </View>

      <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('BillingHistory')}>
        <Text style={styles.primaryText}>View Billing</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondary} onPress={logout}>
        <Text style={styles.secondaryText}>Logout</Text>
      </TouchableOpacity>

      <BottomNav active="account" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: spacing(3) },
  title: { ...typography.headingL, color: '#333' },
  subtitle: { ...typography.body, color: '#555' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.lg,
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  label: { ...typography.caption, color: colors.textSecondary },
  value: { ...typography.body, color: colors.textPrimary },
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(3),
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  primaryText: { color: colors.surface, fontWeight: '600' },
  secondary: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingVertical: spacing(3),
    borderRadius: radii.md,
    alignItems: 'center',
  },
  secondaryText: { color: colors.textPrimary, fontWeight: '600' },
});

