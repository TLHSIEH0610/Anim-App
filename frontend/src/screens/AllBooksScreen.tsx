import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, Image } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { getStoryTemplates, StoryTemplateSummary, getStoryCoverUrl } from '../api/books';
import ScreenWrapper from '../components/ScreenWrapper';
import BottomNav from '../components/BottomNav';
import Card from '../components/Card';
import { colors, radii, shadow, spacing, typography } from '../styles/theme';
import { useNavigation } from '@react-navigation/native';
import Button from '../components/Button';
import Header from '../components/Header';

const fallbackCover = require('../../assets/icon.png');

function TemplateItem({ item, onChoose }: { item: StoryTemplateSummary; onChoose: (slug: string) => void }) {
  const [failed, setFailed] = useState(false);
  const coverUrl = getStoryCoverUrl(item.cover_path);
  const source = !coverUrl || failed ? fallbackCover : { uri: coverUrl };
  return (
    <Card style={styles.card}>
      <View style={styles.coverWrap}>
        <Image source={source as any} style={styles.coverImg} onError={() => setFailed(true)} />
      </View>
      <Text style={styles.title}>{item.name}</Text>
      {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
      <Text style={styles.meta}>Suggested Age: {item.age || 'n/a'} • {item.page_count} pages</Text>
      <Button
        title="Make this book"
        onPress={() => onChoose(item.slug)}
        variant="secondary"
        style={styles.cardButton}
      />
    </Card>
  );
}

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
    <TemplateItem item={item} onChoose={handleChoose} />
  );

  return (
    <ScreenWrapper showIllustrations footer={<BottomNav active="all" />}>
      <Header title="Books" subtitle="Choose a story to personalize" />
      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
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
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingBottom: spacing(24),
  },
  card: {
    marginBottom: spacing(3),
    backgroundColor: 'rgba(135, 206, 235, 0.18)',
    borderRadius: radii.lg,
    ...shadow.subtle,
  },
  cardButton: {
    marginTop: spacing(3),
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
    borderWidth: 0,
  },
  coverWrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing(3),
  },
  coverImg: { width: '100%', height: 180, resizeMode: 'cover' },
  title: {
    ...typography.headingM,
    color: colors.textPrimary,
    marginBottom: spacing(1),
  },
  desc: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing(1),
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing(2),
  },
  error: {
    color: colors.danger,
  },
});
