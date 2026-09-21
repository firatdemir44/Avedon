import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Platform, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchConversations } from '../../api/client';
import { formatListTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { HeaderButton } from '../../components/HeaderButton';
import { SearchField } from '../../components/SearchField';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'Conversations'>;

const REFRESH_INTERVAL_MS = 15000;

// Taslak: docs/tasarim-yonleri/CMesajlar.dc.html. Arama çubuğu; altında
// çizgili sohbet satırları. Okunmamış sohbette saat ve son mesaj vurgulu,
// sağda mavi sayı rozeti.
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
      // Zil ortak ana başlıkta (components/MainHeader); burada yalnızca
      // ekrana özel "Yeni" eylemi kalıyor.
      headerRight: () => (
        <HeaderButton icon="add" label="Yeni" showLabel onPress={() => navigation.navigate('NewConversation')} />
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
        <SkeletonList variant="conversation" />
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
      <View style={styles.searchBar}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Mesajlarda ara"
          accessibilityLabel="Mesajlarda ara"
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
        renderItem={({ item, index }) => {
          const name = `${item.user.firstName} ${item.user.lastName}`;
          const company = item.user.company;
          const unread = item.unreadCount > 0;
          const isMine = item.lastMessage?.senderId === user?.id;
          const timeLabel = formatListTime(item.lastMessageAt);
          return (
            <Pressable
              onPress={() => navigation.navigate('Chat', { conversationId: item.id, title: name })}
              accessibilityRole={Platform.OS === 'web' ? 'link' : 'button'}
              accessibilityLabel={[name, company?.name, unread ? `${item.unreadCount} okunmamış mesaj` : null]
                .filter(Boolean)
                .join(', ')}
              android_ripple={{ color: colors.pressed }}
              style={({ pressed }) => [
                styles.row,
                index < filtered.length - 1 && styles.rowDivider,
                pressed && styles.pressed,
              ]}
            >
              <CompanyAvatar
                name={company?.name ?? item.user.firstName}
                companyId={company?.id}
                logoUpdatedAt={company?.logoUpdatedAt}
                size={44}
              />
              <View style={styles.texts}>
                <View style={styles.topLine}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text
                    style={[
                      styles.time,
                      timeLabel !== 'dün' && styles.timeMono,
                      unread && styles.timeUnread,
                    ]}
                  >
                    {timeLabel}
                  </Text>
                </View>
                <Text style={styles.company} numberOfLines={1}>
                  {company?.name ?? item.user.position}
                </Text>
                <View style={styles.previewLine}>
                  <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                    {item.lastMessage ? `${isMine ? 'Siz: ' : ''}${item.lastMessage.body}` : 'Henüz mesaj yok'}
                  </Text>
                  {unread ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
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
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  searchBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listContent: { paddingTop: spacing.blockGap, paddingBottom: spacing.xl },
  banner: { marginHorizontal: spacing.gutter, marginBottom: spacing.blockGap },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.pressed },
  texts: { flex: 1, minWidth: 0, gap: 1 },
  topLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  name: { ...typography.subtitle, color: colors.text, flexShrink: 1 },
  time: { ...typography.caption, color: colors.textMuted },
  timeMono: { fontFamily: fonts.mono },
  timeUnread: { fontFamily: fonts.monoSemibold, color: colors.accent },
  company: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preview: { ...typography.body, color: colors.textMuted, flex: 1 },
  previewUnread: { fontFamily: fonts.semibold, color: colors.text },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.primaryText },
});
