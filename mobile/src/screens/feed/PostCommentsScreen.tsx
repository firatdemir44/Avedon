import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  createPostComment,
  deletePostComment,
  fetchPostComments,
  type FeedPostComment,
} from '../../api/client';
import { formatRelativeTime } from '../../features/time';
import { MIN_TOUCH, colors, radius, shadow, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PostComments'>;

export function PostCommentsScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const { user } = useSession();
  const [comments, setComments] = useState<FeedPostComment[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<FeedPostComment>>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetchPostComments(postId)
      .then(({ comments: fetched }) => {
        setComments(fetched);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Yorumlar alınamadı'))
      .finally(() => setLoading(false));
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const { comment } = await createPostComment(postId, body);
      setComments((prev) => [...prev, comment]);
      setInput('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yorum gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = (comment: FeedPostComment) => {
    Alert.alert('Yorumu sil', 'Bu yorum kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePostComment(postId, comment.id);
            setComments((prev) => prev.filter((c) => c.id !== comment.id));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Yorum silinemedi');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <FlatList
          ref={listRef}
          data={comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>{error ?? 'Henüz yorum yok. İlk yorumu siz yazın.'}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onLongPress={() => item.author.id === user?.id && handleDelete(item)}
              onPress={() => navigation.navigate('Profile', { userId: item.author.id })}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.author.firstName} {item.author.lastName}
                </Text>
                <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
              </View>
              {item.author.company ? <Text style={styles.meta}>{item.author.company.name}</Text> : null}
              <Text style={styles.body}>{item.body}</Text>
            </Pressable>
          )}
        />
        {error && comments.length > 0 ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Yorum yazın..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending || !input.trim()}>
            <Text style={styles.sendButtonText}>Gönder</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: { ...typography.label, fontWeight: '700', color: colors.accent, flexShrink: 1 },
  time: { ...typography.caption, color: colors.textMuted },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  body: { ...typography.body, color: colors.text, marginTop: spacing.xs },
  inputRow: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 4,
    fontSize: 15,
    backgroundColor: colors.surfaceTonal,
    color: colors.text,
  },
  sendButton: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  sendButtonText: { ...typography.label, color: colors.primaryText },
  error: {
    ...typography.label,
    fontWeight: '400',
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
