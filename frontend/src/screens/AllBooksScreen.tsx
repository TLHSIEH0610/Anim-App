import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { getStoryTemplates, StoryTemplateSummary } from '../api/books';
import ScreenWrapper from '../components/ScreenWrapper';
import BottomNav from '../components/BottomNav';
import Card from '../components/Card';
import { colors, radii, shadow, spacing, typography } from '../styles/theme';
import { useNavigation } from '@react-navigation/native';

export default function AllBooksScreen() {
  const navigation = useNavigation<any>();
  const [templates, setTemplates] = useState<StoryTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getStoryTemplates();
        setTemplates(res.stories || []);
      } catch (e) {
        setError('Failed to load stories');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleChoose = (slug: string) => {
    navigation.navigate('BookCreation', { templateSlug: slug });
  };

  const renderItem = ({ item }: { item: StoryTemplateSummary }) => (
    <Card style={styles.card}>
      <Text style={styles.title}>{item.name}</Text>
      {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
      <Text style={styles.meta}>Suggested Age: {item.age || 'n/a'} • {item.page_count} pages</Text>
      <TouchableOpacity style={styles.cta} onPress={() => handleChoose(item.slug)}>
        <Text style={styles.ctaText}>Make this book</Text>
      </TouchableOpacity>
    </Card>
  );

  return (
    <ScreenWrapper showIllustrations>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Books</Text>
        <Text style={styles.headerSub}>Choose a story to personalize</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.error}>{error}</Text></View>
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(t) => t.slug}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
      <BottomNav active="all" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing(2),
  },
  headerTitle: {
    ...typography.headingL,
    color: '#333',
  },
  headerSub: {
    ...typography.body,
    color: '#555',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingBottom: spacing(16),
  },
  card: {
    marginBottom: spacing(3),
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.lg,
    ...shadow.subtle,
  },
  title: {
    ...typography.headingM,
    color: '#333',
    marginBottom: spacing(1),
  },
  desc: {
    ...typography.body,
    color: '#555',
    marginBottom: spacing(1),
  },
  meta: {
    ...typography.caption,
    color: '#666',
    marginBottom: spacing(2),
  },
  cta: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(3),
    borderRadius: radii.md,
    alignItems: 'center',
  },
  ctaText: {
    color: colors.surface,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
  },
});
