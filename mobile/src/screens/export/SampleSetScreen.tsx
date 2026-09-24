// Kartela önerisi: alıcı profiline göre katalogdan seçilen ilk numune seti (backend/src/export/sampleSets.ts).
// Yeni öneri (buyerId) ya da kayıtlı set (setId) açılır. Seçimler kaydedilir; paylaşım bağlantısı
// alıcıya giden, yazdırılabilir numune-seti.html sayfasıdır (fiyat/stok içermez).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { tr } from '../../i18n';
import {
  ApiError,
  fetchSampleSet,
  markSampleSetSent,
  shareSampleSet,
  suggestSampleSet,
  updateSampleSet,
  type SampleSet,
  type SampleSetItem,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, Button, ButtonRow, Card, EmptyState, Icon, SectionTitle, SkeletonRow, useBottomPadding } from '../../ui';
import { scoreColor } from './buyerShared';

type Props = RootStackScreenProps<'SampleSet'>;

function errorText(err: unknown, fallback: string) {
  if (err instanceof ApiError) {
    if (err.code === 'daily_limit') return tr('Bugünkü öneri hakkınız doldu (günde 20). Yarın tekrar deneyin.');
    if (err.code === 'empty_catalog') return tr('Kataloğunuzda ürün yok; önce ürün ekleyin.');
    if (err.code === 'llm_not_configured') return tr('Öneri servisi şu an kullanılamıyor.');
    if (err.code === 'llm_output' || err.code === 'no_suggestions') return tr('Uygun öneri üretilemedi. Tekrar deneyin.');
    if (err.code === 'nothing_selected') return tr('Paylaşmak için en az bir ürün seçin.');
  }
  return friendlyMessage(err, fallback);
}

export function SampleSetScreen({ navigation, route }: Props) {
  const t = useTheme();
  const bottom = useBottomPadding();
  const { buyerId, buyerName, setId } = route.params;
  const [set, setSet] = useState<SampleSet | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | 'sent' | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const apply = (s: SampleSet) => {
    setSet(s);
    setSelected(new Set(s.items.filter((i) => i.selected).map((i) => i.productId)));
  };

  const load = useCallback(async () => {
    setError(null);
    setSet(null);
    try {
      const res = setId ? await fetchSampleSet(setId) : await suggestSampleSet(buyerId);
      apply(res.set);
    } catch (err) {
      setError(errorText(err, tr('Kartela önerisi alınamadı')));
    }
  }, [buyerId, setId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => !!set && set.items.some((i) => i.selected !== selected.has(i.productId)), [set, selected]);

  const toggle = (id: string) => {
    haptics.selection();
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const persist = async () => {
    if (!set) return null;
    const res = await updateSampleSet(set.id, { selected: [...selected] });
    apply(res.set);
    return res.set;
  };

  const save = async () => {
    setBusy('save');
    setActionError(null);
    try {
      await persist();
      haptics.success();
      setSaved(true);
    } catch (err) {
      setActionError(errorText(err, tr('Kaydedilemedi')));
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!set) return;
    setBusy('share');
    setActionError(null);
    try {
      if (dirty) await persist();
      const res = await shareSampleSet(set.id);
      setSet((s) => (s ? { ...s, shareUrl: res.url } : s));
      haptics.success();
    } catch (err) {
      setActionError(errorText(err, tr('Bağlantı oluşturulamadı')));
    } finally {
      setBusy(null);
    }
  };

  const markSent = async () => {
    if (!set) return;
    setBusy('sent');
    setActionError(null);
    try {
      if (dirty) await persist();
      const res = await markSampleSetSent(set.id);
      apply(res.set);
      haptics.success();
    } catch (err) {
      setActionError(errorText(err, tr('Kaydedilemedi')));
    } finally {
      setBusy(null);
    }
  };

  // Alıcıya giden metin İngilizce (alıcı yabancı).
  const shareText = set?.shareUrl ? `Hello, please find our fabric swatch set for ${buyerName}: ${set.shareUrl}` : '';

  const copyLink = async () => {
    if (!set?.shareUrl) return;
    const clipboard = (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator?.clipboard;
    if (Platform.OS === 'web' && clipboard) {
      try {
        await clipboard.writeText(set.shareUrl);
        setCopied(true);
        return;
      } catch {
        // sistem paylaşımına düş
      }
    }
    Share.share({ message: set.shareUrl }).catch(() => {});
  };

  const openWhatsApp = () => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`).catch(() => {});
  const openMail = () =>
    Linking.openURL(`mailto:?subject=${encodeURIComponent(`Fabric swatch set for ${buyerName}`)}&body=${encodeURIComponent(shareText)}`).catch(() => {});

  const content = error ? (
    <EmptyState icon="warning" title={tr('Kartela önerisi alınamadı')} description={error} actionLabel={tr('Tekrar dene')} onAction={load} />
  ) : !set ? (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center' }}>
          <Icon name="time-outline" color="ink2" size={t.size.iconSm} />
          <Text style={[t.type.label14, { color: t.colors.ink, flex: 1 }]}>{setId ? tr('Yükleniyor…') : tr('Kataloğunuz ve alıcı inceleniyor…')}</Text>
        </View>
        {setId ? null : <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Bu işlem yarım dakika kadar sürebilir.')}</Text>}
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    </Card>
  ) : (
    <>
      <Card>
        <View style={{ gap: t.space[2] }}>
          <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={[t.type.body16Strong, { color: t.colors.ink, flex: 1 }]}>{set.title}</Text>
            <Badge kind={set.status === 'gonderildi' ? 'pending' : 'info'} label={set.status === 'gonderildi' ? tr('Numune gönderildi') : tr('Taslak')} />
          </View>
          {set.summary ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{set.summary}</Text> : null}
          <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
            {tr('{n} / {total} ürün seçili', { n: selected.size, total: set.items.length })}
          </Text>
        </View>
      </Card>

      <View style={{ gap: t.space[3] }}>
        <SectionTitle title={tr('Önerilen ürünler')} />
        {set.items.map((item) => (
          <ItemCard
            key={item.productId}
            item={item}
            checked={selected.has(item.productId)}
            onToggle={() => toggle(item.productId)}
            onOpen={() => navigation.navigate('ProductDetail', { productId: item.productId })}
          />
        ))}
      </View>

      <View style={{ gap: t.space[3] }}>
        {actionError ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{actionError}</Text> : null}
        {saved && !dirty ? <Text style={[t.type.body14, { color: t.colors.success }]}>{tr('Kaydedildi')}</Text> : null}
        <Button kind="secondary" icon="save-outline" label={tr('Seti kaydet')} onPress={save} loading={busy === 'save'} disabled={!dirty || !!busy} fullWidth />
        <Button
          kind="primary"
          icon="link-outline"
          label={set.shareUrl ? tr('Bağlantıyı güncelle') : tr('Paylaşım bağlantısı oluştur')}
          onPress={share}
          loading={busy === 'share'}
          disabled={selected.size === 0 || !!busy}
          fullWidth
        />
        {set.shareUrl ? (
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Text style={[t.type.label14, { color: t.colors.ink }]}>{tr('Alıcıya gönderilecek bağlantı')}</Text>
              <Text selectable style={[t.type.mono14, { color: t.colors.ink2 }]}>
                {set.shareUrl}
              </Text>
              <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
                {tr('Sayfa İngilizce açılır; alıcı yazdırıp PDF olarak kaydedebilir. Fiyat ve stok görünmez.')}
              </Text>
              <ButtonRow>
                <Button kind="secondary" icon="copy-outline" label={copied ? tr('Kopyalandı') : tr('Kopyala')} onPress={copyLink} />
                <Button kind="secondary" icon="logo-whatsapp" label="WhatsApp" onPress={openWhatsApp} />
                <Button kind="quiet" icon="mail-outline" label={tr('E-posta')} onPress={openMail} />
              </ButtonRow>
              <Button kind="quiet" icon="open-outline" label={tr('Sayfayı aç')} onPress={() => Linking.openURL(set.shareUrl!).catch(() => {})} />
            </View>
          </Card>
        ) : null}
        <Button
          kind="secondary"
          icon="paper-plane-outline"
          label={set.status === 'gonderildi' ? tr('Numune gönderildi') : tr('Numune gönderildi olarak işaretle')}
          onPress={markSent}
          loading={busy === 'sent'}
          disabled={set.status === 'gonderildi' || !!busy}
          fullWidth
        />
        {set.status === 'gonderildi' ? (
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Alıcı takip listenizde "Numune gönderildi" durumunda.')}</Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Kartela · {buyer}', { buyer: buyerName })} leading="back" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], paddingBottom: bottom, gap: t.space[6], maxWidth: t.size.maxContentWidth, width: '100%', alignSelf: 'center' }}
      >
        {content}
      </ScrollView>
    </View>
  );
}

function ItemCard({ item, checked, onToggle, onOpen }: { item: SampleSetItem; checked: boolean; onToggle: () => void; onOpen: () => void }) {
  const t = useTheme();
  const p = item.product;
  const specs = [p.weightGsm ? `${p.weightGsm} g/m²` : null, p.widthCm ? tr('en {n} cm', { n: p.widthCm }) : null, p.stock ? tr('stok {n} {unit}', { n: p.stock, unit: p.stockUnit }) : tr('stok yok')]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' }}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={tr('{code} sete dahil', { code: p.code })}
          hitSlop={t.space[2]}
          style={{ paddingTop: t.space[1] }}
        >
          <Icon name={checked ? 'checkbox-outline' : 'square-outline'} color={checked ? 'brand' : 'ink3'} size={t.size.iconSm} />
        </Pressable>
        <Pressable onPress={onOpen} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', gap: t.space[3] }}>
          <ProductThumbnail productId={p.id} hasImage={p.hasImage} />
          <View style={{ flex: 1, gap: t.space[1] }}>
            <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={[t.type.mono14, { color: t.colors.ink }]}>{p.code}</Text>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{[p.typeLabel, p.subtypeLabel].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text accessibilityLabel={tr('Uyum puanı {n}', { n: item.score })} style={[t.type.title18, { color: t.colors[scoreColor(item.score)] }]}>
                {item.score}
              </Text>
            </View>
            {p.composition ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{p.composition}</Text> : null}
            {specs ? <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{specs}</Text> : null}
            {item.reason ? <Text style={[t.type.body14, { color: t.colors.ink }]}>{item.reason}</Text> : null}
          </View>
        </Pressable>
      </View>
    </Card>
  );
}
