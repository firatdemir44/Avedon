// Mesajlar (yeni tasarım, 3. adım — DESIGN.md §8, artboard 5).
//
// AppBar "Mesajlar" + yeni sohbet; altında 48px arama kutusu; sohbetler
// `ListRow` (avatar, ad, son mesaj, zaman, okunmamış sayacı). Veri katmanı
// ve arama mantığı değişmedi; yalnızca görünüm yeni.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchConversations } from '../../api/client';
import { formatListTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  AppBar,
  EmptyState,
  Icon,
  ListRow,
  Screen,
  SearchBox,
  SkeletonRow,
} from '../../ui';
import { tr, locale } from '../../i18n';

type Props = MainTabScreenProps<'Conversations'>;

const REFRESH_INTERVAL_MS = 15000;

export function ConversationsListScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { user } = useSession();
  const [query, setQuery] = useState('');
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchConversations().then(({ conversations }) => conversations)
  );

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(reload, REFRESH_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [reload])
  );

  // Sunucu tarafı mesaj araması yok (SQLite'ta Türkçe İ/ı sorunu) — yüklü
  // liste üzerinde filtreleniyor.
  const filtered = useMemo(() => {
    const conversations = data ?? [];
    const q = query.trim().toLocaleLowerCase(locale());
    if (!q) return conversations;
    return conversations.filter((c) =>
      [c.user.firstName, c.user.lastName, c.user.company?.name ?? '', c.lastMessage?.body ?? '']
        .join(' ')
        .toLocaleLowerCase(locale())
        .includes(q)
    );
  }, [data, query]);

  const banner = status === 'ready' && error ? friendlyMessage(error, tr('Mesajlar alınamadı')) : null;

  // Liste boşken arama kutusu gösterilmez (tasarım incelemesi 2026-09-23).
  const hasConversations = (data?.length ?? 0) > 0;
  const header = (
    <View style={{ gap: t.space[3], paddingBottom: t.space[3] }}>
      {hasConversations ? (
        <SearchBox
          placeholder={tr('Mesajlarda ara')}
          accessibilityLabel={tr('Mesajlarda ara')}
          value={query}
          onChangeText={setQuery}
        />
      ) : null}
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
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar
        title={tr('Mesajlar')}
        actions={[
          {
            icon: 'plus',
            label: tr('Yeni sohbet'),
            onPress: () => navigation.navigate('NewConversation'),
          },
        ]}
      />
      <Screen scroll={false} noPadding>
        {status === 'loading' ? (
          <View style={{ paddingHorizontal: t.space[4], gap: t.space[4] }}>
            {header}
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : status === 'error' ? (
          <View style={{ paddingHorizontal: t.space[4] }}>
            {header}
            <EmptyState
              icon="warning"
              title={tr('Mesajlar alınamadı')}
              description={friendlyMessage(error, tr('Bağlantıyı kontrol edip tekrar deneyin.'))}
              actionLabel={tr('Tekrar dene')}
              onAction={reload}
            />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
            refreshControl={refreshControl(refreshing, refresh)}
            ListHeaderComponent={header}
            ListEmptyComponent={
              query ? (
                <EmptyState
                  icon="search"
                  title={tr('Sonuç bulunamadı')}
                  description={tr('"{q}" ile eşleşen sohbet yok.', { q: query.trim() })}
                  actionLabel={tr('Aramayı temizle')}
                  onAction={() => setQuery('')}
                />
              ) : (
                <EmptyState
                  icon="messages"
                  title={tr('İlk sohbetini başlat')}
                  description={tr('Bağlantıda olduğun kişilerle buradan yazışabilirsin.')}
                  actionLabel={tr('Yeni sohbet')}
                  onAction={() => navigation.navigate('NewConversation')}
                />
              )
            }
            renderItem={({ item, index }) => {
              const name = `${item.user.firstName} ${item.user.lastName}`;
              const company = item.user.company?.name ?? item.user.position;
              const unread = item.unreadCount > 0;
              const isMine = item.lastMessage?.senderId === user?.id;
              const preview = item.lastMessage
                ? `${isMine ? tr('Siz: ') : ''}${item.lastMessage.body}`
                : tr(tr('Henüz mesaj yok'));
              return (
                <ListRow
                  title={company ? `${company} · ${name}` : name}
                  subtitle={preview}
                  avatarName={name}
                  avatarKind="person"
                  time={formatListTime(item.lastMessageAt)}
                  unread={unread}
                  unreadCount={unread ? item.unreadCount : undefined}
                  divider={index < filtered.length - 1}
                  onPress={() =>
                    navigation.navigate('Chat', {
                      conversationId: item.id,
                      title: name,
                      userId: item.user.id,
                      avatarUpdatedAt: item.user.avatarUpdatedAt,
                    })
                  }
                />
              );
            }}
          />
        )}
      </Screen>
    </View>
  );
}
