// Gizlediğim firmalar (akış düzeni, 2026-09-23): kullanıcının "Bu firmayı
// akışımda gizle" dediği firmalar; "Göster" ile yeniden akışa alınır.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { fetchFeedMutes, unmuteCompanyInFeed } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { markFeedStale } from '../../features/feed/feedRefresh';
import { formatRelativeTime } from '../../features/time';
import { haptics } from '../../features/haptics';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import { Button, EmptyState, ListRow, Screen, SkeletonRow } from '../../ui';

export function FeedMutesScreen() {
  const t = useTheme();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchFeedMutes().then((r) => r.mutes)
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const unmute = async (companyId: string) => {
    setBusyId(companyId);
    setActionError(null);
    try {
      await unmuteCompanyInFeed(companyId);
      haptics.success();
      setRemoved((prev) => new Set(prev).add(companyId));
      markFeedStale();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'Firma yeniden gösterilemedi'));
    } finally {
      setBusyId(null);
    }
  };

  if (status === 'loading') {
    return (
      <Screen>
        <View style={{ gap: t.space[4] }}>
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </Screen>
    );
  }
  if (status === 'error') {
    return (
      <Screen>
        <EmptyState
          icon="warning"
          title="Liste alınamadı"
          description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
          actionLabel="Tekrar dene"
          onAction={reload}
        />
      </Screen>
    );
  }

  const mutes = (data ?? []).filter((m) => !removed.has(m.companyId));

  return (
    <Screen scroll={false} noPadding>
      <FlatList
        data={mutes}
        keyExtractor={(m) => m.companyId}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: t.space[4], paddingBottom: t.space[10] }}
        refreshControl={refreshControl(refreshing, () => {
          setRemoved(new Set());
          refresh();
        })}
        ListHeaderComponent={
          <View style={{ gap: t.space[2], paddingBottom: t.space[3] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              Bu firmaların paylaşımları ana sayfa akışınızda görünmez. Firmalar bundan haberdar olmaz.
            </Text>
            {actionError ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{actionError}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="eye-outline"
            title="Gizlediğiniz firma yok"
            description="Akışta bir gönderinin menüsünden “Bu firmayı akışımda gizle” diyerek firma gizleyebilirsiniz."
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            title={item.name}
            subtitle={`Gizlendi: ${formatRelativeTime(item.createdAt)}`}
            avatarName={item.name}
            avatarKind="company"
            divider={index < mutes.length - 1}
            right={
              <Button
                kind="secondary"
                label="Göster"
                loading={busyId === item.companyId}
                disabled={!!busyId}
                onPress={() => unmute(item.companyId)}
              />
            }
          />
        )}
      />
    </Screen>
  );
}
