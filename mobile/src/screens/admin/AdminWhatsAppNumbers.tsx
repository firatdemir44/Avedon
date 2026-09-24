// WhatsApp numaraları (yönetici, 2026-10-05). "Admin" ekranının "WhatsApp" sekmesi.
// Meta test numarasından gerçek işletme numarasına geçiş, ortam değişkenine dokunmadan:
// numara WhatsApp Yöneticisi'nde eklenir → burada iki adımlı PIN ile Cloud API'ye kaydedilir
// → "Bu numarayı kullan" ile aktif olur (sunucuda AppSetting). PIN hiçbir yerde saklanmaz.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  activateAdminWhatsAppNumber,
  fetchAdminWhatsAppNumbers,
  registerAdminWhatsAppNumber,
  type AdminWhatsAppNumber,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { useBottomPadding, Badge, Button, Card, EmptyState, Icon, Input, SkeletonRow } from '../../ui';
import type { BadgeKind } from '../../ui/Badge';

// Meta durum değerleri → rozet türü (metin Meta'nın kendi değeri; ikon + metin).
function metaBadgeKind(value: string | null): BadgeKind {
  const v = (value ?? '').toUpperCase();
  if (['APPROVED', 'CONNECTED', 'VERIFIED', 'GREEN'].includes(v)) return 'verified';
  if (['DECLINED', 'DISCONNECTED', 'BANNED', 'FLAGGED', 'RESTRICTED', 'RED', 'NOT_VERIFIED'].includes(v)) return 'cancelled';
  if (['YELLOW', 'PENDING', 'PENDING_REVIEW', 'AVAILABLE_WITHOUT_REVIEW'].includes(v)) return 'pending';
  return 'info';
}

function isRegistered(n: AdminWhatsAppNumber) {
  return (n.platformType ?? '').toUpperCase() === 'CLOUD_API';
}

const STEPS = [
  'Numaranın SIM kartı elinizde olmalı ve numara WhatsApp ya da WhatsApp Business uygulamasında kayıtlı olmamalı (kayıtlıysa önce uygulamadan hesabı silin).',
  "WhatsApp Yöneticisi > Hesap araçları > Telefon numaraları > Numara ekle: numarayı girin, SMS ya da sesli aramayla gelen kodu yazın.",
  'Numara aşağıda görünür: 6 haneli PIN ile "Numarayı kaydet (Cloud API)", ardından "Bu numarayı kullan".',
];

export function AdminWhatsAppNumbers() {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() => fetchAdminWhatsAppNumbers());
  const [pins, setPins] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [notices, setNotices] = useState<Record<string, string | null>>({});

  const setFor = (setter: typeof setErrors, id: string, value: string | null) => setter((m) => ({ ...m, [id]: value }));

  const register = async (n: AdminWhatsAppNumber) => {
    const pin = pins[n.id] ?? '';
    if (!/^\d{6}$/.test(pin)) {
      setFor(setErrors, n.id, tr('PIN 6 haneli bir sayı olmalı.'));
      return;
    }
    setBusyId(n.id);
    setFor(setErrors, n.id, null);
    setFor(setNotices, n.id, null);
    try {
      await registerAdminWhatsAppNumber(n.id, pin);
      setPins((m) => ({ ...m, [n.id]: '' }));
      setFor(setNotices, n.id, tr('Numara Cloud API için kaydedildi.'));
      await reload();
    } catch (err) {
      setFor(setErrors, n.id, friendlyMessage(err, tr('Numara kaydedilemedi')));
    } finally {
      setBusyId(null);
    }
  };

  const activate = async (n: AdminWhatsAppNumber) => {
    const ok = await confirmAction({
      title: tr('Bu numara kullanılsın mı?'),
      message: tr('Takyon bundan sonra WhatsApp mesajlarını {number} numarasından gönderir ve yalnızca bu numaraya gelen mesajları işler.', { number: n.displayPhoneNumber }),
      confirmLabel: tr('Bu numarayı kullan'),
    });
    if (!ok) return;
    setBusyId(n.id);
    setFor(setErrors, n.id, null);
    setFor(setNotices, n.id, null);
    try {
      await activateAdminWhatsAppNumber(n.id);
      setFor(setNotices, n.id, tr('Aktif numara değişti.'));
      await reload();
    } catch (err) {
      setFor(setErrors, n.id, friendlyMessage(err, tr('Numara etkinleştirilemedi')));
    } finally {
      setBusyId(null);
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
          title={tr('Numaralar alınamadı')}
          description={friendlyMessage(error, tr('Bağlantıyı kontrol edip tekrar deneyin.'))}
          actionLabel={tr('Tekrar dene')}
          onAction={reload}
        />
      </View>
    );
  }

  const numbers = data?.numbers ?? [];
  const active = data?.active;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad, gap: t.space[4] }}
      refreshControl={refreshControl(refreshing, refresh)}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <View style={{ gap: t.space[3], minWidth: 0 }}>
          <Text style={[t.type.title18, { color: t.colors.ink }]}>{tr('Gerçek numaraya geçiş')}</Text>
          {STEPS.map((step, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: t.space[2], minWidth: 0 }}>
              <Text style={[t.type.mono14, { color: t.colors.brand }]}>{i + 1}</Text>
              <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>{tr(step)}</Text>
            </View>
          ))}
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            {tr('Şu an kullanılan:')}{' '}
            <Text style={[t.type.mono14, { color: t.colors.ink }]}>{active?.displayNumber ?? active?.id ?? tr('Yok')}</Text>
            {' · '}
            {active?.source === 'setting' ? tr('bu ekrandan seçildi') : active?.source === 'env' ? tr('sunucu ayarından') : tr('tanımlı değil')}
          </Text>
          {data?.mock ? <Text style={[t.type.body14, { color: t.colors.warning }]}>{tr('Deneme kipi: Meta çağrılmıyor, örnek numaralar gösteriliyor.')}</Text> : null}
        </View>
      </Card>

      {numbers.length === 0 ? (
        <EmptyState
          icon="call-outline"
          title={tr('Numara bulunamadı')}
          description={tr('WhatsApp Yöneticisi’nde numara ekledikten sonra listeyi aşağı çekip yenileyin.')}
        />
      ) : null}

      {numbers.map((n) => {
        const registered = isRegistered(n);
        const busy = busyId === n.id;
        const err = errors[n.id];
        const notice = notices[n.id];
        return (
          <Card key={n.id}>
            <View style={{ gap: t.space[3], minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
                <Text style={[t.type.title18, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>{n.displayPhoneNumber}</Text>
                {n.active ? <Badge kind="verified" label={tr('Aktif')} /> : null}
              </View>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                {n.verifiedName ?? tr('Görünen ad yok')} · <Text style={t.type.mono14}>{n.id}</Text>
              </Text>
              <View style={{ gap: t.space[2], minWidth: 0 }}>
                <MetaRow label={tr('Görünen ad onayı')} value={n.nameStatus} />
                <MetaRow label={tr('Bağlantı')} value={n.status} />
                <MetaRow label={tr('Kalite')} value={n.qualityRating} />
                <MetaRow label={tr('Cloud API')} value={registered ? 'CLOUD_API' : n.platformType ?? 'NOT_APPLICABLE'} />
              </View>

              {!registered ? (
                <View style={{ gap: t.space[3], minWidth: 0 }}>
                  <Input
                    label={tr('İki adımlı doğrulama PIN’i')}
                    value={pins[n.id] ?? ''}
                    onChangeText={(v) => setPins((m) => ({ ...m, [n.id]: v.replace(/\D/g, '').slice(0, 6) }))}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="off"
                    textContentType="oneTimeCode"
                    helper={tr("WhatsApp Yöneticisi'nde belirlediğiniz ya da şimdi belirleyeceğiniz 6 haneli iki adımlı doğrulama PIN'i. Bir yere not edin; sohbete yazmayın.")}
                  />
                  <Button
                    label={tr('Numarayı kaydet (Cloud API)')}
                    kind="secondary"
                    fullWidth
                    loading={busy}
                    disabled={busy || (pins[n.id] ?? '').length !== 6}
                    onPress={() => register(n)}
                  />
                </View>
              ) : null}

              {!n.active ? (
                <Button
                  label={tr('Bu numarayı kullan')}
                  kind="primary"
                  fullWidth
                  loading={busy && registered}
                  disabled={busy || !registered}
                  onPress={() => activate(n)}
                />
              ) : null}
              {!n.active && !registered ? (
                <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{tr('Önce numarayı PIN ile kaydedin.')}</Text>
              ) : null}

              {err ? (
                <View style={{ flexDirection: 'row', gap: t.space[2], padding: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.dangerSoft, minWidth: 0 }}>
                  <Icon name="warning" size={t.size.iconSm} color="danger" />
                  <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{err}</Text>
                </View>
              ) : null}
              {notice ? <Text style={[t.type.body14, { color: t.colors.success }]}>{notice}</Text> : null}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

function MetaRow({ label, value }: { label: string; value: string | null }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2], flexWrap: 'wrap', minWidth: 0 }}>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{label}</Text>
      {value ? <Badge kind={metaBadgeKind(value)} label={value.replace(/_/g, ' ')} /> : <Text style={[t.type.body14, { color: t.colors.ink3 }]}>–</Text>}
    </View>
  );
}
