import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radii, spacing } from '../styles/theme';

type TabKey = 'all' | 'purchased' | 'account';

export default function BottomNav({ active }: { active: TabKey }) {
  const navigation = useNavigation<any>();

  const Item = ({ label, tab, routeName }: { label: string; tab: TabKey; routeName: string }) => (
    <TouchableOpacity onPress={() => navigation.navigate(routeName)} style={styles.item}>
      <Text style={[styles.label, active === tab && styles.labelActive]}>{label}</Text>
      {active === tab ? <View style={styles.activeIndicator} /> : <View style={styles.inactiveIndicator} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Item label="Books" tab="all" routeName="AllBooks" />
      <Item label="Purchased" tab="purchased" routeName="BookLibrary" />
      <Item label="Account" tab="account" routeName="Account" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing(4),
    right: spacing(4),
    bottom: spacing(2),
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: spacing(4),
    paddingTop: spacing(2),
    paddingBottom: spacing(2),
    borderRadius: radii.xl,
    justifyContent: 'space-between',
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing(1),
  },
  labelActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  activeIndicator: {
    width: 28,
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  inactiveIndicator: {
    width: 28,
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: 'transparent',
  },
});
