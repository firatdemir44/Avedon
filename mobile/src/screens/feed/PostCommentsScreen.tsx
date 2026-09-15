import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { MIN_TOUCH, colors, fonts, radius, shadow, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PostComments'>;

export function PostCommentsScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const { user } = useSession();
  // Bir yorumcunun profiline gidip geri dönünce liste artık yükleniyor
  // çemberine dönmüyor (bkz. useFocusLoad).
  const { data, setData, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchPostComments(postId).then(({ comments }) => comments)
  );
  const comments = data ?? [];
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const listRef = useRef<FlatList<FeedPostComment>>(null);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setActionError(null);
    try {
      const { comment } = await createPostComment(postId, body);
      setData((prev) => [...(prev ?? []), comment]);
      setInput('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      setActionError(friendlyMessage(err, 'Yorum gönderilemedi'));
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
            setData((prev) => (prev ?? []).filter((c) => c.id !== comment.id));
          } catch (err) {
            setActionError(friendlyMessage(err, 'Yorum silinemedi'));
          }
        },
      },
    ]);
  };

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonList variant="comment" />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ErrorState error={error} fallback="Yorumlar alınamadı" onRetry={reload} />
      </SafeAreaView>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Yorumlar alınamadı') : null);

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
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl(refreshing, refresh)}
          ListEmptyComponent={
            <EmptyState
              compact
              icon="chatbubble-outline"
              title="Henüz yorum yok"
              message="İlk yorumu siz yazın."
            />
          }
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
        {/* Gönderme hatası yazma alanının hemen üstünde: gözün olduğu yer. */}
        {bannerMessage ? (
          <InlineError
            message={bannerMessage}
            onRetry={actionError ? undefined : reload}
            style={styles.banner}
          />
        ) : null}
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
  banner: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
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
  name: { ...typography.label, fontFamily: fonts.bold, color: colors.accent, flexShrink: 1 },
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
    fontFamily: fonts.regular,
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
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
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  sendButtonText: { ...typography.label, color: colors.primaryText },
});
