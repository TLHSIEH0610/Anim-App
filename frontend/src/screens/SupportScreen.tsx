import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Platform } from 'react-native';
import ScreenWrapper from '../components/ScreenWrapper';
import Header from '../components/Header';
import Button from '../components/Button';
import { colors, radii, spacing, typography } from '../styles/theme';
import { useAuth } from '../context/AuthContext';
import { createSupportTicket } from '../api/support';
import Constants from 'expo-constants';
import { Picker } from '@react-native-picker/picker';
import { getBookList, Book } from '../api/books';

export default function SupportScreen() {
  const { user, token } = useAuth();
  const [subject, setSubject] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState<number | undefined>(undefined);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const appVer = (Constants?.expoConfig as any)?.version || '0.0.0';
  const build = (Constants as any)?.nativeBuildVersion || '';

  useEffect(() => {
    (async () => {
      try {
        if (!token) return;
        const res = await getBookList(token);
        setBooks(res.books || []);
      } catch {}
    })();
  }, [token]);

  const onSubmit = async () => {
    if (!token) {
      Alert.alert('Sign in required', 'Please sign in again.');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      Alert.alert('Missing info', 'Please provide a subject and a message.');
      return;
    }
    try {
      setSubmitting(true);
      await createSupportTicket(token, {
        subject: subject.trim(),
        body: body.trim(),
        book_id: bookId,
        app_version: appVer,
        build: String(build || ''),
        device_os: `${Platform.OS} ${Platform.Version}`,
        api_base: process.env.EXPO_PUBLIC_API_BASE || 'n/a',
      });
      Alert.alert('Sent', 'Your message has been sent. We will get back to you shortly.');
      setSubject(''); setBookId(undefined); setBody('');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not send your message.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenWrapper>
      <Header title="Contact Support" showBack />
      <View style={styles.container}>
        <Text style={styles.hint}>Signed in as {user?.email}</Text>
        <Text style={styles.label}>Subject</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Brief summary" />
        <Text style={styles.label}>Related book (optional)</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={bookId}
            onValueChange={(v) => setBookId(v || undefined)}
          >
            <Picker.Item label="None" value={undefined as any} />
            {books.map((b) => (
              <Picker.Item key={b.id} label={`#${b.id} ${b.title}`} value={b.id} />
            ))}
          </Picker>
        </View>
        <Text style={styles.label}>Message</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={body}
          onChangeText={setBody}
          placeholder="Describe the issue..."
          multiline
          numberOfLines={6}
        />
        <Button title="Send" onPress={onSubmit} variant="primary" loading={submitting} disabled={submitting} />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), gap: spacing(2) },
  hint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing(1) },
  label: { ...typography.caption, color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(2),
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.neutral200,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
  },
  textarea: { height: 140, textAlignVertical: 'top' as any },
});
