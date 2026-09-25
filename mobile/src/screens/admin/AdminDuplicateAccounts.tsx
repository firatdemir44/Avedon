// Çift hesaplar (yönetici, 2026-09-24). "Admin" ekranının "Çift hesaplar" sekmesi.
// Aynı telefonun farklı yazımıyla ("0538…" / "+90538…") açılmış hesaplar gruplanır; yönetici
// tutulacak hesabı seçer (varsayılan: en eski), diğer hesapların tüm kayıtları ona taşınır ve
// fazla hesap silinir. Geri alınamaz; onay penceresi bunu açıkça söyler.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ApiError, fetchDuplicateAccounts, mergeDuplicateAccounts, type DuplicateAccount, type DuplicateGroup } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { useBottomPadding, Badge, Button, Card, EmptyState, Icon, SkeletonRow } from '../../ui';

const COUNT_LABELS: [keyof DuplicateAccount['counts'], string][] = [
  ['posts', 'Paylaşım'],
  ['comments', 'Yorum'],
  ['messages', 'Mesaj'],
  ['conversations', 'Sohbet'],
  ['connections', 'Bağlantı'],
  ['assistantThreads', 'Asistan sohbeti'],
  ['sampleRequests', 'Numune talebi'],
  ['quoteRequests', 'Teklif talebi'],
  ['quotes', 'Verilen teklif'],
  ['productDrafts', 'Ürün taslağı'],
];

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupKey(g: DuplicateGroup) {
  return g.accounts.map((a) => a.id).join(':');
}

export function AdminDuplicateAccounts() {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() => fetchDuplicateAccounts());
  const [keepBy, setKeepBy] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const merge = async (g: DuplicateGroup) => {
    const key = groupKey(g);
    const keep = g.accounts.find((a) => a.id === (keepBy[key] ?? g.accounts[0].id)) ?? g.accounts[0];
    const removes = g.accounts.filter((a) => a.id !== keep.id);
    const ok = await confirmAction({
      title: tr('Hesaplar birleştirilsin mi?'),
      message: tr(
        '{keep} ({date}) hesabı kalır. Diğer {n} hesabın paylaşımları, mesajları, bağlantıları ve talepleri bu hesaba taşınır, sonra o hesaplar silinir. Bu işlem geri alınamaz.',
        { keep: `${keep.firstName} ${keep.lastName}`, date: fmtDate(keep.createdAt), n: removes.length }
      ) +
        (g.reason === 'ad' ? ' ' + tr('Telefon numaraları farklı; bundan sonra yalnızca kalan hesabın numarasıyla giriş yapılır.') : ''),
      confirmLabel: tr('Birleştir'),
      destructive: true,
    });
    if (!ok) return;
    setBusyKey(key);
    setErrors((m) => ({ ...m, [key]: null }));
    setNotice(null);
    try {
      for (const r of removes) {
        try {
          await mergeDuplicateAccounts(keep.id, r.id, false, g.reason === 'ad');
        } catch (err) {
          if (!(err instanceof ApiError && err.code === 'different_companies')) throw err;
          const force = await confirmAction({
            title: tr('Hesaplar farklı firmalarda'),
            message: tr('{keep} hesabı "{a}", silinecek hesap "{b}" firmasında. Yine de birleştirilsin mi? Kalan hesap "{a}" firmasında kalır.', {
              keep: `${keep.firstName} ${keep.lastName}`,
              a: keep.company?.name ?? '—',
              b: r.company?.name ?? '—',
            }),
            confirmLabel: tr('Yine de birleştir'),
            destructive: true,
          });
          if (!force) return;
          await mergeDuplicateAccounts(keep.id, r.id, true, g.reason === 'ad');
        }
      }
      setNotice(tr('Hesaplar birleştirildi.'));
      await reload();
    } catch (err) {
      setErrors((m) => ({ ...m, [key]: friendlyMessage(err, tr('Hesaplar birleştirilemedi')) }));
      await reload();
    } finally {
      setBusyKey(null);
    }
  };

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, paddingHorizontal: t.space[4], gap: t.space[4] }}>
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState
          icon="warning"
          title={tr('Çift hesaplar alınamadı')}
          description={friendlyMessage(error, tr('Bağlantıyı kontrol edip tekrar deneyin.'))}
          actionLabel={tr('Tekrar dene')}
          onAction={reload}
        />
      </View>
    );
  }

  const groups = data?.groups ?? [];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad, gap: t.space[4] }}
      refreshControl={refreshControl(refreshing, refresh)}
    >
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
        {tr('Aynı telefon numarasının farklı yazımıyla açılmış hesaplar. Tutulacak hesabı seçin; diğerinin kayıtları ona taşınır.')}
      </Text>
      {notice ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
          <Icon name="checkmark-circle-outline" size={t.size.iconSm} color="success" />
          <Text style={[t.type.body14, { color: t.colors.success, flex: 1, minWidth: 0 }]}>{notice}</Text>
        </View>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title={tr('Çift hesap yok')} description={tr('Aynı numarayla açılmış birden fazla hesap bulunmuyor.')} />
      ) : null}

      {groups.map((g) => {
        const key = groupKey(g);
        const keepId = keepBy[key] ?? g.accounts[0].id;
        const busy = busyKey === key;
        const err = errors[key];
        return (
          <Card key={key}>
            <View style={{ gap: t.space[3], minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
                <Icon name={g.reason === 'ad' ? 'person-outline' : 'call-outline'} size={t.size.iconSm} color="ink2" />
                <Text style={[g.reason === 'ad' ? t.type.label14 : t.type.mono14, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>{g.phone}</Text>
                <Badge kind="pending" label={tr('{n} hesap', { n: g.accounts.length })} />
              </View>

              {g.accounts.map((a, i) => {
                const selected = a.id === keepId;
                const nonZero = COUNT_LABELS.filter(([k]) => a.counts[k] > 0);
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: busy }}
                    accessibilityLabel={tr('{name} hesabını tut', { name: `${a.firstName} ${a.lastName}` })}
                    disabled={busy}
                    onPress={() => setKeepBy((m) => ({ ...m, [key]: a.id }))}
                    style={{
                      flexDirection: 'row',
                      gap: t.space[3],
                      padding: t.space[3],
                      borderRadius: t.radius.md,
                      backgroundColor: selected ? t.colors.brandSoft : t.colors.surface0,
                      minWidth: 0,
                    }}
                  >
                    <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={t.size.iconSm} color={selected ? 'brand' : 'ink2'} />
                    <View style={{ flex: 1, gap: t.space[1], minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], flexWrap: 'wrap', minWidth: 0 }}>
                        <Text style={[t.type.title18, { color: t.colors.ink }]}>
                          {a.firstName} {a.lastName}
                        </Text>
                        {selected ? <Badge kind="verified" label={tr('Kalacak')} /> : <Badge kind="cancelled" label={tr('Silinecek')} />}
                        {i === 0 ? <Badge kind="info" label={tr('En eski')} /> : null}
                      </View>
                      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                        {[a.position, a.company?.name ?? tr('Firmasız')].filter(Boolean).join(' · ')}
                      </Text>
                      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                        {tr('Kayıt: {d}', { d: fmtDate(a.createdAt) })} · {tr('Son etkinlik: {d}', { d: fmtDate(a.lastActive) })}
                      </Text>
                      <Text style={[t.type.caption12, { color: t.colors.ink2 }]}>
                        {nonZero.length ? nonZero.map(([k, label]) => `${tr(label)}: ${a.counts[k]}`).join(' · ') : tr('Kayıtlı içerik yok')}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

              {err ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], padding: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.dangerSoft }}>
                  <Icon name="warning" size={t.size.iconSm} color="danger" />
                  <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{err}</Text>
                </View>
              ) : null}

              <Button label={tr('Birleştir')} kind="danger" fullWidth loading={busy} disabled={busy} onPress={() => merge(g)} />
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
