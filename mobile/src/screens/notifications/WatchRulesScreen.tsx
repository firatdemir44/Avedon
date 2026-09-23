// İzlediklerim (yeni tasarım, 4. adım — DESIGN.md §3).
//
// Veri katmanı AYNI: uçlar, iyimser güncelleme, navigasyon hedefleri ve rota
// adları değişmedi. Yalnızca görünüm yeni: `ui/ListRow`, `ui/Badge`, `ui/Input`,
// `ui/Button`, `ui/EmptyState`. Üst bant stack navigator'dan geliyor.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, Switch } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { deleteWatchRule, fetchWatchRules, updateWatchRule, type WatchRule } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { EMPTY_FILTERS, isYarnWatchQuery } from '../../features/products/filters';
import { presetFromYarnWatchQuery } from '../../features/yarns/watch';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, Badge, Button, EmptyState, Icon, Input, ListRow, Screen, SkeletonRow } from '../../ui';

type Props = RootStackScreenProps<'WatchRules'>;

// Sunucu kuralı: ad 1-80 karakter (PATCH /api/watch-rules/:id).
const NAME_MAX = 80;

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
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, setData, status, error, refreshing, reload, refresh } = useFocusLoad(fetchWatchRules);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Adı değiştirilen kural ve taslak metin (satır içi düzenleme).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

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

  // Adı değiştirme: satır içinde metin girişi (ayrı ekran açılmıyor).
  const startRename = (rule: WatchRule) => {
    setActionError(null);
    setEditingId(rule.id);
    setDraft(rule.name);
  };

  const cancelRename = () => {
    setEditingId(null);
    setDraft('');
  };

  const saveRename = useCallback(
    async (rule: WatchRule) => {
      const name = draft.trim().slice(0, NAME_MAX);
      if (!name) {
        setActionError('İzleme adı boş olamaz.');
        return;
      }
      if (name === rule.name) {
        cancelRename();
        return;
      }
      setSavingName(true);
      try {
        const { rule: updated } = await updateWatchRule(rule.id, { name });
        haptics.success();
        setActionError(null);
        setData((prev) =>
          prev ? { ...prev, rules: prev.rules.map((r) => (r.id === rule.id ? { ...r, name: updated.name } : r)) } : prev
        );
        cancelRename();
      } catch {
        haptics.error();
        setActionError('İzleme adı değiştirilemedi, tekrar deneyin.');
      } finally {
        setSavingName(false);
      }
    },
    [draft, setData]
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

  // 44px dokunma hedefli ikon düğmesi (`ui`de ikon-yalnız düğme yok; token'larla inline).
  const iconButtonStyle = ({ pressed }: { pressed: boolean }) => ({
    width: t.size.touchMin,
    height: t.size.touchMin,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: t.radius.md,
    backgroundColor: pressed ? t.colors.surface2 : 'transparent',
  });

  if (status === 'loading') {
    return (
      <Screen scroll={false}>
        <View style={{ gap: t.space[4] }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="warning"
          title="İzlemeler alınamadı"
          description={friendlyMessage(error, 'İzlemeler alınamadı')}
          actionLabel="Tekrar dene"
          onAction={reload}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} noPadding>
      <FlatList
        data={rules}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <View style={{ gap: t.space[3], paddingBottom: t.space[2] }}>
            {actionError ? (
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
                <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{actionError}</Text>
              </View>
            ) : null}
            {full ? (
              <ListRow
                title="İzleme sınırına ulaştınız"
                subtitle={`En fazla ${max} izleme kurabilirsiniz. Önce birini silin.`}
                left={<Icon name="warning" color="warning" />}
                divider={false}
              />
            ) : (
              <ListRow
                title="Yeni izleme"
                subtitle="Süzgeci seçin, uyan ürün çıkınca haber verelim"
                left={<Icon name="plus" color="brand" />}
                divider={false}
                onPress={newWatch}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="bell"
            title="Henüz izleme yok"
            description="Aradığınız kaliteyi süzgeçle tarif edin; uyan yeni ürün eklendiğinde bildirim alın."
            actionLabel="İzleme kur"
            onAction={newWatch}
          />
        }
        renderItem={({ item, index }) => {
          const last = index === rules.length - 1;
          const yarn = isYarnWatchQuery(item.query);

          // Adı değiştirme kipi: satırın yerini tek satırlık form alır.
          if (editingId === item.id) {
            return (
              <View
                style={{
                  gap: t.space[3],
                  paddingVertical: t.space[3],
                  borderBottomWidth: last ? 0 : 1,
                  borderBottomColor: t.colors.line,
                }}
              >
                <Input
                  label="İzleme adı"
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={NAME_MAX}
                  autoFocus
                  selectTextOnFocus
                  placeholder="İzleme adı"
                  returnKeyType="done"
                  onSubmitEditing={() => void saveRename(item)}
                />
                <View style={{ flexDirection: 'row', gap: t.space[2], justifyContent: 'flex-end' }}>
                  <Button kind="quiet" label="Vazgeç" onPress={cancelRename} />
                  <Button
                    label="Kaydet"
                    loading={savingName}
                    disabled={savingName}
                    onPress={() => void saveRename(item)}
                  />
                </View>
              </View>
            );
          }

          // Kalem, anahtar ve çöp satırın İÇİNDE değil YANINDA: web'de iç içe
          // <button> oluşmasın (DESIGN.md §6).
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[1],
                minWidth: 0,
                borderBottomWidth: last ? 0 : 1,
                borderBottomColor: t.colors.line,
              }}
            >
              <ListRow
                style={{ flex: 1, minWidth: 0 }}
                title={item.name}
                subtitle={ruleSubtitle(item)}
                // İplik kuralının süzgeci kumaş alanlarıyla çözümlenemez: küçük
                // bir "İplik" rozeti kuralın hangi dizine ait olduğunu söyler.
                right={yarn ? <Badge kind="info" label="İplik" /> : undefined}
                divider={false}
                onPress={yarn ? () => openYarnRule(item) : undefined}
              />
              <Pressable
                onPress={() => startRename(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} izlemesinin adını değiştir`}
                style={iconButtonStyle}
              >
                <Icon name="pencil-outline" size={t.size.iconSm} color="brand" />
              </Pressable>
              <Switch
                value={item.active}
                onValueChange={(next) => void toggleActive(item, next)}
                disabled={busyId === item.id}
                accessibilityLabel={`${item.name} izlemesi ${item.active ? 'açık' : 'kapalı'}`}
                trackColor={{ true: t.colors.brand, false: t.colors.lineStrong }}
                thumbColor={t.colors.surface1}
              />
              <Pressable
                onPress={() => void remove(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} izlemesini sil`}
                style={iconButtonStyle}
              >
                <Icon name="trash-outline" size={t.size.iconSm} color="danger" />
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          rules.length ? (
            <Text style={[t.type.body14, { color: t.colors.ink3, paddingTop: t.space[4] }]}>
              Kendi firmanızın ürünleri için bildirim gelmez. Bildirimler yalnızca uygulama içinde gösterilir.
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}
