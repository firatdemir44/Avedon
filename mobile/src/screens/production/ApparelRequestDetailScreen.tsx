// Konfeksiyon teklif isteği ayrıntısı (docs/konfeksiyon-plani.md Bölüm B, madde 7).
// Hedef firma "Yanıtla" ile alıcıyla sohbet açar (ilk mesaj talebin özeti, durum
// Yanıtlandı); alıcı talebi kapatabilir. Ekler tek tek çekilir, dokununca tam ekran.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  closeApparelRequest,
  fetchApparelAttachment,
  fetchApparelRequest,
  replyApparelRequest,
  type ApparelRequest,
} from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { ErrorState, friendlyMessage } from '../../components/StateView';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { formatRelativeTime } from '../../features/time';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { tr, locale } from '../../i18n';
import { AppBar, Badge, Button, Card, Icon, Screen, SectionTitle, SkeletonRow, type BadgeKind } from '../../ui';

type Props = RootStackScreenProps<'ApparelRequestDetail'>;

export const APPAREL_STATUS_BADGE: Record<ApparelRequest['status'], BadgeKind> = {
  gonderildi: 'pending',
  yanitlandi: 'new',
  kapandi: 'cancelled',
};

export function ApparelRequestDetailScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { requestId } = route.params;
  const { data, status, error, reload } = useFocusLoad(() => fetchApparelRequest(requestId));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [loadingAtt, setLoadingAtt] = useState<number | null>(null);

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        <AppBar title={tr('Teklif isteği')} leading="back" onBack={() => navigation.goBack()} />
        {status === 'error' ? (
          <ErrorState error={error} fallback={tr('Talep alınamadı')} onRetry={reload} />
        ) : (
          <View style={{ padding: t.space[4] }}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        )}
      </View>
    );
  }
  const { request: r, role } = data;
  const seller = role === 'seller';
  const buyerLine = [r.buyer.name, r.buyer.company?.name].filter(Boolean).join(' · ');
  const num = (n: number) => n.toLocaleString(locale());

  const openChat = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const out = await replyApparelRequest(r.id);
      haptics.success();
      navigation.navigate('Chat', { conversationId: out.conversationId, title: out.title, userId: out.userId, avatarUpdatedAt: out.avatarUpdatedAt });
      reload();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, tr('Sohbet açılamadı')));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await closeApparelRequest(r.id);
      await reload();
    } catch (err) {
      setActionError(friendlyMessage(err, tr('Talep kapatılamadı')));
    } finally {
      setBusy(false);
    }
  };

  const openAttachment = async (position: number, kind: 'image' | 'pdf') => {
    setLoadingAtt(position);
    try {
      const att = await fetchApparelAttachment(r.id, position);
      if (kind === 'image') setViewer(att.dataUrl);
      else await Linking.openURL(att.dataUrl);
    } catch (err) {
      setActionError(friendlyMessage(err, tr('Ek açılamadı')));
    } finally {
      setLoadingAtt(null);
    }
  };

  const row = (label: string, value: string, mono = false) => (
    <View style={{ gap: t.space[1] }}>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{label}</Text>
      <Text style={[mono ? t.type.mono14 : t.type.body16, { color: t.colors.ink }]}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Teklif isteği')} leading="back" onBack={() => navigation.goBack()} />
      <Screen
        sticky={
          seller && r.status !== 'kapandi' ? (
            <Button size="lg" icon="message" label={r.conversationId ? tr('Sohbete git') : tr('Yanıtla')} loading={busy} onPress={openChat} />
          ) : !seller && r.status !== 'kapandi' ? (
            <Button size="lg" kind="secondary" label={tr('Talebi kapat')} loading={busy} onPress={close} />
          ) : undefined
        }
      >
        <View style={{ gap: t.space[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], flexWrap: 'wrap' }}>
            <Text style={[t.type.title18, { color: t.colors.ink, flexShrink: 1 }]}>{r.productGroupLabel}</Text>
            <Badge kind={APPAREL_STATUS_BADGE[r.status]} label={r.statusLabel} />
          </View>
          <Card>
            <View style={{ gap: t.space[3] }}>
              {row(seller ? tr('Talep eden') : tr('Firma'), seller ? buyerLine : r.targetCompany.name)}
              {row(tr('Adet'), tr('{n} adet', { n: num(r.quantity) }), true)}
              {r.targetDate ? row(tr('Hedef termin'), new Date(r.targetDate).toLocaleDateString(locale()), true) : null}
              {row(tr('Kumaş'), r.fabricMode === 'katalog' && r.fabricProduct ? `${r.fabricProduct.code} · ${r.fabricProduct.company.name}` : r.fabricModeLabel)}
              {r.note ? row(tr('Not'), r.note) : null}
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{formatRelativeTime(r.createdAt)}</Text>
            </View>
          </Card>
          {r.fabricProduct ? (
            <Button kind="secondary" icon="fabric" label={tr('Kumaşı gör')} onPress={() => navigation.navigate('ProductDetail', { productId: r.fabricProduct!.id })} />
          ) : null}
          {r.attachments.length ? (
            <View style={{ gap: t.space[2] }}>
              <SectionTitle title={tr('Ekler')} />
              {r.attachments.map((a) => (
                <Pressable
                  key={a.position}
                  onPress={() => openAttachment(a.position, a.kind)}
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minHeight: t.size.touchMin }}
                >
                  <Icon name={a.kind === 'pdf' ? 'document-text-outline' : 'image-outline'} size={t.size.iconSm} color="ink2" />
                  <Text style={[t.type.body16, { color: t.colors.ink, flex: 1 }]}>
                    {a.kind === 'pdf' ? tr('Teknik föy (PDF)') : tr('Görsel {n}', { n: a.position + 1 })}
                  </Text>
                  {loadingAtt === a.position ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>…</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          {!seller ? (
            <Button kind="quiet" label={tr('Firmayı gör')} onPress={() => navigation.navigate('CompanyProfile', { companyId: r.targetCompany.id, initialTab: 'production' })} />
          ) : null}
          {actionError ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{actionError}</Text> : null}
        </View>
      </Screen>
      <ImageViewerModal visible={!!viewer} imageUrl={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

