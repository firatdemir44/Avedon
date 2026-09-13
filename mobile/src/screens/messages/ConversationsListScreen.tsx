import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchConversations, type ConversationSummary } from '../../api/client';
import { formatRelativeTime } from '../../features/time';
import { colors, radius, spacing } from '../../theme';

type Props = MainTabScreenProps<'Conversations'>;

const REFRESH_INTERVAL_MS = 15000;

export function ConversationsListScreen({ navigation }: Props) {
  const { user } = useSession();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return fetchConversations()
      .then(({ conversations: fetched }) => {
        setConversations(fetched);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Mesajlar alınamadı'))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => load(true), REFRESH_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [load])
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
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return conversations;
    return conversations.filter((c) =>
      [c.user.firstName, c.user.lastName, c.user.company?.name ?? '', c.lastMessage?.body ?? '']
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(q)
    );
  }, [conversations, query]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
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
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          load(true);
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {error ?? (query ? 'Sonuç bulunamadı.' : 'Henüz mesajınız yok. "+ Yeni" ile sohbet başlatın.')}
          </Text>
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
  headerAction: { fontSize: 15, fontWeight: '600', color: colors.primary },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  listContent: { padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  time: { fontSize: 12, color: colors.textMuted },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  preview: { fontSize: 14, color: colors.textMuted, flex: 1 },
  previewUnread: { color: colors.text, fontWeight: '600' },
  unreadBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  unreadBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primaryText },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
