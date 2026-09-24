// Gönderi yorumları (yeni tasarım, 4. adım — DESIGN.md §2–3).
// Veri katmanı değişmedi (aynı uçlar, aynı gövdeler, aynı rotalar); yalnızca
// sunum yenilendi: AppBar + Screen + ui/ListRow + yapışkan yazma alanı.
// Ham hex / ham px yok; her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
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
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { useBottomPadding, AppBar, Button, EmptyState, Icon, Input, ListRow, Screen, SkeletonRow } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'PostComments'>;

// Klavye açılınca yazma alanının üstte kalması için gezinti bandı payı.
const KEYBOARD_OFFSET = 80;

export function PostCommentsScreen({ route, navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
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
  const canSend = !sending && input.trim().length > 0;

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
      haptics.error();
      setActionError(friendlyMessage(err, tr('Yorum gönderilemedi')));
    } finally {
      setSending(false);
    }
  };

  // Eskiden yalnızca uzun basınca siliniyordu: kimsenin bulamayacağı bir hareket.
  // Artık kendi yorumunda görünür bir sil düğmesi var (satırın ALTINDA: iç içe
  // düğme olmaz, DESIGN.md §3).
  const handleDelete = async (comment: FeedPostComment) => {
    const confirmed = await confirmAction({
      title: tr('Yorumu sil'),
      message: tr('Bu yorum kalıcı olarak silinecek.'),
      confirmLabel: tr('Sil'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deletePostComment(postId, comment.id);
      setData((prev) => (prev ?? []).filter((c) => c.id !== comment.id));
      haptics.success();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, tr('Yorum silinemedi')));
    }
  };

  const appBar = <AppBar title={tr('Yorumlar')} leading="back" onBack={() => navigation.goBack()} />;

  const banner = actionError ?? (error ? friendlyMessage(error, tr('Yorumlar alınamadı')) : null);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {appBar}
        <Screen>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Screen>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {appBar}
        <Screen>
          <EmptyState
            icon="warning"
            title={tr('Yorumlar alınamadı')}
            description={friendlyMessage(error, tr('Bağlantınızı kontrol edip tekrar deneyin.'))}
            actionLabel={tr('Tekrar dene')}
            onAction={reload}
          />
        </Screen>
      </View>
    );
  }

  const composer = (
    <View style={{ gap: t.space[2] }}>
      {/* Gönderme hatası yazma alanının hemen üstünde: gözün olduğu yer. */}
      {banner ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            padding: t.space[3],
            borderRadius: t.radius.md,
            backgroundColor: t.colors.dangerSoft,
          }}
        >
          <Icon name="warning" size={t.size.iconSm} color="danger" />
          <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{banner}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.space[2] }}>
        <Input
          placeholder={tr('Yorum yazın')}
          accessibilityLabel={tr('Yorum')}
          value={input}
          onChangeText={setInput}
          multiline
          textAlignVertical="top"
          containerStyle={{ flex: 1, minWidth: 0 }}
        />
        <Button
          label={tr('Gönder')}
          icon="send"
          accessibilityLabel={tr('Yorumu gönder')}
          loading={sending}
          disabled={!canSend}
          onPress={handleSend}
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {appBar}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={KEYBOARD_OFFSET}
      >
        <Screen scroll={false} noPadding sticky={composer}>
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl(refreshing, refresh)}
            ListEmptyComponent={
              <EmptyState
                icon="message"
                title={tr('Henüz yorum yok')}
                description={tr('İlk yorumu siz yazın; gönderi sahibi bildirim alır.')}
              />
            }
            renderItem={({ item, index }) => {
              const mine = item.author.id === user?.id;
              const authorName = `${item.author.firstName} ${item.author.lastName}`;
              const last = index === comments.length - 1;
              return (
                <View>
                  <ListRow
                    title={authorName}
                    subtitle={item.author.company?.name}
                    avatarName={authorName}
                    avatarKind="person"
                    time={formatRelativeTime(item.createdAt)}
                    divider={false}
                    onPress={() => navigation.navigate('Profile', { userId: item.author.id })}
                  />
                  {/* Yorum metni satırın altında: uzun yorumlar kırpılmasın. */}
                  <Text
                    style={[
                      t.type.body16,
                      { color: t.colors.ink, marginLeft: t.size.avatar + t.space[3], paddingBottom: t.space[3] },
                    ]}
                  >
                    {item.body}
                  </Text>
                  {mine ? (
                    <View style={{ paddingBottom: t.space[3] }}>
                      <Button kind="danger" fullWidth label={tr('Yorumu sil')} onPress={() => handleDelete(item)} />
                    </View>
                  ) : null}
                  {!last ? (
                    <View style={{ height: 1, backgroundColor: t.colors.line, marginBottom: t.space[3] }} />
                  ) : null}
                </View>
              );
            }}
          />
        </Screen>
      </KeyboardAvoidingView>
    </View>
  );
}
