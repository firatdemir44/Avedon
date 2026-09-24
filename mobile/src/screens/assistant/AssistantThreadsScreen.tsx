import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { deleteAssistantThread, fetchAssistantThreads, type AssistantThread } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { formatListTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { writeAssistantThreadId } from '../../features/assistant/threadStore';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, AppBar, EmptyState, Icon, ListRow, Screen, SkeletonRow } from '../../ui';
import { tr } from '../../i18n';

type Props = RootStackScreenProps<'AssistantThreads'>;

// Asistan sohbetleri sunucuda saklanır; bu ekran hangisine dönüleceğini seçer.
// Seçim cihaza yazılır (threadStore), asistan ekranı odaklanınca onu okur.
//
// Yeni tasarım (DESIGN.md, 4. adım): ekran kendi `AppBar`ını çiziyor
// (navigation başlığı gizlendi), satırlar `ListRow`.
export function AssistantThreadsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, status, error, reload } = useFocusLoad(fetchAssistantThreads);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const openThread = useCallback(
    async (threadId: string | null) => {
      await writeAssistantThreadId(threadId);
      navigation.goBack();
    },
    [navigation]
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const removeThread = useCallback(
    async (thread: AssistantThread) => {
      const ok = await confirmAction({
        title: tr('Sohbet silinsin mi?'),
        message: tr('{title} kalıcı olarak silinecek.', { title: thread.title || tr('Yeni sohbet') }),
        confirmLabel: tr('Sil'),
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteAssistantThread(thread.id);
        haptics.success();
        setRemoveError(null);
        await reload();
      } catch {
        haptics.error();
        setRemoveError(tr('Sohbet silinemedi, tekrar deneyin.'));
      }
    },
    [reload]
  );

  const bar = (
    <AppBar
      title={tr('Sohbetler')}
      leading="back"
      onBack={() => navigation.goBack()}
      actions={[{ icon: 'stats-chart-outline', label: tr('Asistan raporu'), onPress: () => navigation.navigate('AssistantReport') }, { icon: 'plus', label: tr('Yeni sohbet'), onPress: () => void openThread(null) }]}
    />
  );

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
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
        {bar}
        <Screen>
          <EmptyState
            icon="warning"
            title={tr('Sohbetler alınamadı')}
            description={friendlyMessage(error, tr('Bağlantıyı kontrol edip tekrar deneyin.'))}
            actionLabel={tr('Tekrar dene')}
            onAction={reload}
          />
        </Screen>
      </View>
    );
  }

  const threads = data?.threads ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <Screen scroll={false} noPadding>
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
          ListHeaderComponent={
            <View style={{ gap: t.space[3] }}>
              {removeError ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space[2],
                    padding: t.space[3],
                    borderRadius: t.radius.md,
                    backgroundColor: t.colors.dangerSoft,
                    minWidth: 0,
                  }}
                >
                  <Icon name="warning" size={t.size.iconSm} color="danger" />
                  <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{removeError}</Text>
                </View>
              ) : null}
              <ListRow
                title={tr('Yeni sohbet')}
                subtitle={tr('Boş bir sohbetle başla')}
                left={<Icon name="plus" color="brand" />}
                onPress={() => void openThread(null)}
              />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="clock"
              title={tr('Henüz sohbet yok')}
              description={tr('Asistana ilk sorunuzu sorduğunuzda sohbet burada listelenir.')}
            />
          }
          renderItem={({ item, index }) => (
            // Silme düğmesi satırın İÇİNDE değil YANINDA: web'de iç içe <button>
            // oluşmasın.
            <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
              <ListRow
                style={{ flex: 1, minWidth: 0 }}
                title={item.title || tr('Yeni sohbet')}
                subtitle={formatListTime(item.updatedAt)}
                divider={index < threads.length - 1}
                onPress={() => void openThread(item.id)}
              />
              <Pressable
                onPress={() => void removeThread(item)}
                accessibilityRole="button"
                accessibilityLabel={tr('{title} sohbetini sil', { title: item.title || tr('Yeni sohbet') })}
                style={({ pressed }) => ({
                  width: t.size.touchMin,
                  height: t.size.touchMin,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Icon name="trash-outline" size={t.size.iconSm} color="danger" />
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            threads.length ? (
              <Text style={[t.type.body14, { color: t.colors.ink3, paddingTop: t.space[4] }]}>
                {tr('Sohbetler sunucuda saklanır, cihaz değişince de gelir.')}
              </Text>
            ) : null
          }
        />
      </Screen>
    </View>
  );
}
