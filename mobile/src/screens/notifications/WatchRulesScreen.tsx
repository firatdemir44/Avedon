import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { deleteWatchRule, fetchWatchRules, updateWatchRule, type WatchRule } from '../../api/client';
import { ListRow } from '../../components/ListRow';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { EMPTY_FILTERS, isYarnWatchQuery } from '../../features/products/filters';
import { presetFromYarnWatchQuery } from '../../features/yarns/watch';
import { useFocusLoad } from '../../features/useFocusLoad';
import { MIN_TOUCH, colors, fonts, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'WatchRules'>;

// "N eşleşme · son: 3 gün önce" — formatRelativeTime kısaltmaları ("3 gün")
// burada "önce" ile tamamlanmıyor, satır kendi cümlesini kuruyor.
function lastMatchLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'son: bugün';
  if (days === 1) return 'son: dün';
  if (days < 30) return `son: ${days} gün önce`;
  return `son: ${date.toLocaleDateString('tr-TR')}`;
}

function ruleSubtitle(rule: WatchRule): string {
  const parts = [rule.matchCount > 0 ? `${rule.matchCount} eşleşme` : 'Henüz eşleşme yok'];
  if (rule.lastMatchedAt) parts.push(lastMatchLabel(rule.lastMatchedAt));
  if (!rule.active) parts.push('duraklatıldı');
  return parts.join(' · ');
}

// Faz 2, Adım 1: "İzlediklerim". Kural = ürün süzgecinin alt kümesi; yeni kural
// mevcut süzgeç ekranının "izleme kipinde" açılmasıyla kuruluyor.
export function WatchRulesScreen({ navigation }: Props) {
  const { data, setData, status, error, refreshing, reload, refresh } = useFocusLoad(fetchWatchRules);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rules = data?.rules ?? [];
  const max = data?.max ?? 20;
  const full = rules.length >= max;

  const toggleActive = useCallback(
    async (rule: WatchRule, next: boolean) => {
      setBusyId(rule.id);
      // İyimser: anahtar hemen döner, hata olursa geri alınır.
      setData((prev) =>
        prev ? { ...prev, rules: prev.rules.map((r) => (r.id === rule.id ? { ...r, active: next } : r)) } : prev
      );
      try {
        await updateWatchRule(rule.id, { active: next });
        setActionError(null);
      } catch {
        haptics.error();
        setData((prev) =>
          prev ? { ...prev, rules: prev.rules.map((r) => (r.id === rule.id ? { ...r, active: !next } : r)) } : prev
        );
        setActionError('İzleme güncellenemedi, tekrar deneyin.');
      } finally {
        setBusyId(null);
      }
    },
    [setData]
  );

  const remove = useCallback(
    async (rule: WatchRule) => {
      const ok = await confirmAction({
        title: 'İzleme silinsin mi?',
        message: `"${rule.name}" izlemesi kalıcı olarak silinecek, bu süzgeç için bildirim almazsınız.`,
        confirmLabel: 'Sil',
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteWatchRule(rule.id);
        haptics.success();
        setActionError(null);
        setData((prev) => (prev ? { ...prev, rules: prev.rules.filter((r) => r.id !== rule.id) } : prev));
      } catch {
        haptics.error();
        setActionError('İzleme silinemedi, tekrar deneyin.');
      }
    },
    [setData]
  );

  // İplik kuralına basınca iplik dizini o süzgeçle açılır (kumaş kuralları
  // şimdilik yalnızca listede duruyor).
  const openYarnRule = (rule: WatchRule) => {
    if (!isYarnWatchQuery(rule.query)) return;
    navigation.navigate('YarnDirectory', {
      preset: presetFromYarnWatchQuery(rule.query),
      presetKey: Date.now(),
    });
  };

  const newWatch = () =>
    navigation.navigate('ProductFilters', { filters: EMPTY_FILTERS, mode: 'watch' });

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
        <ErrorState error={error} fallback="İzlemeler alınamadı" onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {actionError ? <InlineError message={actionError} style={styles.banner} /> : null}
      <FlatList
        data={rules}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <View style={styles.block}>
            {full ? (
              <ListRow
                title="İzleme sınırına ulaştınız"
                subtitle={`En fazla ${max} izleme kurabilirsiniz. Yeni bir izleme için önce birini silin.`}
                left={<Ionicons name="alert-circle-outline" size={22} color={colors.warning} />}
                chevron={false}
                divider={false}
              />
            ) : (
              <ListRow
                title="Yeni izleme"
                subtitle="Süzgeci seçin, uyan ürün çıkınca haber verelim"
                left={<Ionicons name="add-circle-outline" size={22} color={colors.primary} />}
                divider={false}
                onPress={newWatch}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            compact
            icon="notifications-outline"
            title="Henüz izleme yok"
            message="Aradığınız kaliteyi süzgeçle tarif edin; o tarife uyan yeni bir ürün eklendiğinde bildirim alın."
            actionLabel="İzleme kur"
            onAction={newWatch}
          />
        }
        renderItem={({ item, index }) => (
          // Anahtar ve çöp satırın İÇİNDE değil YANINDA: web'de iç içe <button>
          // oluşmasın (MOBILE-DESIGN web kuralları).
          <View style={[styles.ruleRow, index < rules.length - 1 && styles.divider]}>
            <ListRow
              style={styles.rowFlex}
              title={item.name}
              subtitle={ruleSubtitle(item)}
              // İplik kuralının süzgeci kumaş alanlarıyla çözümlenemez: küçük
              // bir "İplik" etiketi kuralın hangi dizine ait olduğunu söyler.
              left={
                isYarnWatchQuery(item.query) ? (
                  <View style={styles.kindTag}>
                    <Text style={styles.kindTagText}>İplik</Text>
                  </View>
                ) : undefined
              }
              divider={false}
              chevron={isYarnWatchQuery(item.query)}
              onPress={isYarnWatchQuery(item.query) ? () => openYarnRule(item) : undefined}
            />
            <Switch
              value={item.active}
              onValueChange={(next) => void toggleActive(item, next)}
              disabled={busyId === item.id}
              accessibilityLabel={`${item.name} izlemesi ${item.active ? 'açık' : 'kapalı'}`}
              trackColor={{ true: colors.accent, false: colors.borderStrong }}
              thumbColor={colors.surface}
            />
            <Pressable
              onPress={() => void remove(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} izlemesini sil`}
              style={({ pressed }) => [styles.trash, pressed && styles.pressedFade]}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          rules.length ? (
            <Text style={styles.footerNote}>
              Kendi firmanızın ürünleri için bildirim gelmez. Bildirimler yalnızca uygulama içinde gösterilir.
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, marginBottom: spacing.blockGap },
  banner: { margin: spacing.gutter },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.xs,
    backgroundColor: colors.surface,
  },
  rowFlex: { flex: 1 },
  kindTag: {
    borderRadius: 4,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  kindTagText: { ...typography.caption, fontFamily: fonts.semibold, fontSize: 11, color: colors.primary },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  trash: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedFade: { opacity: 0.6 },
  footerNote: {
    ...typography.caption,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
});
