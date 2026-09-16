import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { deleteAssistantThread, fetchAssistantThreads, type AssistantThread } from '../../api/client';
import { HeaderButton } from '../../components/HeaderButton';
import { ListRow } from '../../components/ListRow';
import { EmptyState, ErrorState, InlineError } from '../../components/StateView';
import { SkeletonList } from '../../components/Skeleton';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { formatListTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { writeAssistantThreadId } from '../../features/assistant/threadStore';
import { MIN_TOUCH, colors, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'AssistantThreads'>;

// Asistan sohbetleri sunucuda saklanır; bu ekran hangisine dönüleceğini seçer.
// Seçim cihaza yazılır (threadStore), asistan ekranı odaklanınca onu okur.
export function AssistantThreadsScreen({ navigation }: Props) {
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
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton icon="add" label="Yeni" showLabel onPress={() => void openThread(null)} />
      ),
    });
  }, [navigation, openThread]);

  const removeThread = useCallback(
    async (thread: AssistantThread) => {
      const ok = await confirmAction({
        title: 'Sohbet silinsin mi?',
        message: `${thread.title || 'Yeni sohbet'} kalıcı olarak silinecek.`,
        confirmLabel: 'Sil',
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
        setRemoveError('Sohbet silinemedi, tekrar deneyin.');
      }
    },
    [reload]
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="conversation" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Sohbetler alınamadı" onRetry={reload} />
      </View>
    );
  }

  const threads = data?.threads ?? [];

  return (
    <View style={styles.screen}>
      {removeError ? <InlineError message={removeError} style={styles.banner} /> : null}
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.block}>
            <ListRow
              title="Yeni sohbet"
              subtitle="Boş bir sohbetle başla"
              left={<Ionicons name="add-circle-outline" size={22} color={colors.primary} />}
              divider={false}
              onPress={() => void openThread(null)}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            compact
            icon="time-outline"
            title="Henüz sohbet yok"
            message="Asistana ilk sorunuzu sorduğunuzda sohbet burada listelenir."
          />
        }
        renderItem={({ item, index }) => (
          // Silme düğmesi satırın İÇİNDE değil YANINDA: web'de iç içe <button>
          // oluşmasın (MOBILE-DESIGN web kuralları).
          <View style={[styles.threadRow, index < threads.length - 1 && styles.divider]}>
            <ListRow
              style={styles.rowFlex}
              title={item.title || 'Yeni sohbet'}
              subtitle={formatListTime(item.updatedAt)}
              divider={false}
              chevron={false}
              onPress={() => void openThread(item.id)}
            />
            <Pressable
              onPress={() => void removeThread(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title || 'Yeni sohbet'} sohbetini sil`}
              style={({ pressed }) => [styles.trash, pressed && styles.pressedFade]}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          threads.length ? <Text style={styles.footerNote}>Sohbetler sunucuda saklanır, cihaz değişince de gelir.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, marginBottom: spacing.blockGap },
  threadRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface },
  rowFlex: { flex: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  trash: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  pressedFade: { opacity: 0.6 },
  banner: { margin: spacing.gutter },
  footerNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
});
