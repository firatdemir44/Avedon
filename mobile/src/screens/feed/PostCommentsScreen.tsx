import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PostComments'>;

// Yeni düzen (5. aşama): tek beyaz blokta çizgili yorum satırları; altta
// sohbet taslağındaki (CSohbet.dc.html) gibi yazma alanı + kare gönder düğmesi.
export function PostCommentsScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const { user } = useSession();
  const insets = useSafeAreaInsets();
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
  const canSend = !sending && input.trim().length > 0;

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setActionError(null);
    try {
      const { comment } = await createPostComment(postId, body);
      setData((prev) => [...(prev ?? []), comment]);
      setInput('');
      haptics.success();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'Yorum gönderilemedi'));
    } finally {
      setSending(false);
    }
  };

  // Eskiden yalnızca uzun basınca siliniyordu: kimsenin bulamayacağı bir hareket.
  // Artık kendi yorumunda görünür bir sil düğmesi var.
  const handleDelete = async (comment: FeedPostComment) => {
    const confirmed = await confirmAction({
      title: 'Yorumu sil',
      message: 'Bu yorum kalıcı olarak silinecek.',
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deletePostComment(postId, comment.id);
      setData((prev) => (prev ?? []).filter((c) => c.id !== comment.id));
      haptics.success();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'Yorum silinemedi'));
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="comment" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        <ErrorState error={error} fallback="Yorumlar alınamadı" onRetry={reload} />
      </View>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Yorumlar alınamadı') : null);

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
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
            <EmptyState compact icon="chatbubble-outline" title="Henüz yorum yok" message="İlk yorumu siz yazın." />
          }
          renderItem={({ item, index }) => {
            const mine = item.author.id === user?.id;
            const authorName = `${item.author.firstName} ${item.author.lastName}`;
            return (
              <Pressable
                onPress={() => navigation.navigate('Profile', { userId: item.author.id })}
                // Web'de rol verilirse satır <button> olur ve içindeki sil
                // düğmesi geçersiz iç içe düğme olurdu (bkz. ProductRow).
                accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                accessibilityLabel={`${authorName}: ${item.body}`}
                android_ripple={{ color: colors.pressed }}
                style={({ pressed }) => [
                  styles.row,
                  index < comments.length - 1 && styles.rowDivider,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.authorLine} numberOfLines={1}>
                    <Text style={styles.authorName}>{authorName}</Text>
                    {item.author.company ? <Text style={styles.authorCompany}> · {item.author.company.name}</Text> : null}
                  </Text>
                  <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
                  {mine ? (
                    <Pressable
                      onPress={() => handleDelete(item)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Yorumu sil"
                      style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.body}>{item.body}</Text>
              </Pressable>
            );
          }}
        />
        {/* Gönderme hatası yazma alanının hemen üstünde: gözün olduğu yer. */}
        {bannerMessage ? (
          <InlineError message={bannerMessage} onRetry={actionError ? undefined : reload} style={styles.banner} />
        ) : null}
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.input}
            placeholder="Yorum yazın"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            accessibilityLabel="Yorum"
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Yorumu gönder"
            accessibilityState={{ disabled: !canSend }}
            style={({ pressed }) => [styles.sendButton, !canSend && styles.sendDisabled, pressed && canSend && styles.sendPressed]}
          >
            <Ionicons name="send" size={18} color={colors.primaryText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  listContent: { paddingTop: spacing.blockGap, paddingBottom: spacing.md },
  banner: { marginHorizontal: spacing.gutter, marginBottom: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    gap: 2,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.pressed },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  authorLine: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  authorName: { fontFamily: fonts.semibold },
  authorCompany: { fontFamily: fonts.regular, color: colors.textMuted },
  time: { ...typography.caption, color: colors.textMuted },
  deleteButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  body: { ...typography.body, color: colors.text },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  sendButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendPressed: { opacity: 0.85 },
});
