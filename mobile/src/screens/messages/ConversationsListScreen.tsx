import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchConversations } from '../../api/client';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { MIN_TOUCH, colors, fonts, radius, shadow, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'Conversations'>;

const REFRESH_INTERVAL_MS = 15000;

export function ConversationsListScreen({ navigation }: Props) {
  const { user } = useSession();
  const [query, setQuery] = useState('');
  // Sohbetten geri dönünce liste artık yükleniyor çemberine dönmüyor; yeni
  // okunmamış sayıları sessizce geliyor (bkz. useFocusLoad).
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchConversations().then(({ conversations }) => conversations)
  );

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(reload, REFRESH_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [reload])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('NewConversation')} hitSlop={8}>
          <Text style={styles.headerAction}>+ Yeni</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  // Sunucu tarafı mesaj araması yok (SQLite'ta büyük/küçük harf duyarsız arama
  // desteklenmiyor, Türkçe İ/ı sorunu da cabası) — yüklü liste üzerinde filtreliyoruz.
  const filtered = useMemo(() => {
    const conversations = data ?? [];
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return conversations;
    return conversations.filter((c) =>
      [c.user.firstName, c.user.lastName, c.user.company?.name ?? '', c.lastMessage?.body ?? '']
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(q)
    );
  }, [data, query]);

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <SkeletonList variant="row" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <ErrorState error={error} fallback="Mesajlar alınamadı" onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Mesajlarda ara..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          error ? (
            <InlineError message={friendlyMessage(error, 'Mesajlar alınamadı')} onRetry={reload} style={styles.banner} />
          ) : null
        }
        ListEmptyComponent={
          query ? (
            <EmptyState
              icon="search-outline"
              title="Sonuç bulunamadı"
              message={`"${query.trim()}" ile eşleşen sohbet yok.`}
              actionLabel="Aramayı temizle"
              onAction={() => setQuery('')}
            />
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="Henüz mesajınız yok"
              message="Bağlantıda olduğunuz kişilerle buradan sohbet başlatabilirsiniz."
              actionLabel="Yeni sohbet"
              onAction={() => navigation.navigate('NewConversation')}
            />
          )
        }
        renderItem={({ item }) => {
          const isMine = item.lastMessage?.senderId === user?.id;
          return (
            <Pressable
              style={styles.card}
              onPress={() =>
                navigation.navigate('Chat', {
                  conversationId: item.id,
                  title: `${item.user.firstName} ${item.user.lastName}`,
                })
              }
            >
              <View style={styles.cardHeaderRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.user.firstName} {item.user.lastName}
                </Text>
                <Text style={styles.time}>{formatRelativeTime(item.lastMessageAt)}</Text>
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {item.user.company?.name ?? item.user.position}
              </Text>
              <View style={styles.previewRow}>
                <Text style={[styles.preview, item.unreadCount > 0 && styles.previewUnread]} numberOfLines={1}>
                  {item.lastMessage ? `${isMine ? 'Siz: ' : ''}${item.lastMessage.body}` : 'Henüz mesaj yok'}
                </Text>
                {item.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Lacivert üst bant üzerinde beyaz.
  headerAction: { ...typography.bodyStrong, color: colors.primaryText },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  search: {
    fontFamily: fonts.regular,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 4,
    fontSize: 15,
    backgroundColor: colors.surfaceTonal,
    color: colors.text,
  },
  listContent: { padding: spacing.lg },
  banner: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: { ...typography.subtitle, fontFamily: fonts.bold, color: colors.text, flexShrink: 1 },
  time: { ...typography.caption, color: colors.textMuted },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 2 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  preview: { ...typography.body, color: colors.textMuted, flex: 1 },
  previewUnread: { color: colors.text, fontFamily: fonts.semibold },
  unreadBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.notification,
    alignItems: 'center',
  },
  unreadBadgeText: { ...typography.caption, fontFamily: fonts.bold, color: colors.primaryText },
});
