// Konfeksiyona "Teklif iste" formu (docs/konfeksiyon-plani.md Bölüm B, madde 7).
// Kumaş ürününe bağlı teklif isteğinden (QuoteRequestForm) ayrı yeni talep türü:
// ürün grubu, adet, hedef termin, kumaş (katalogdan seç / kumaşı ben sağlayacağım /
// firma önersin), teknik föy ya da görseller (en çok 4 görsel YA DA tek PDF), not.
// Katalogdan kumaş seçilirse talep o kumaşa bağlanır.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  createApparelRequest,
  fetchApparelOptions,
  fetchProduction,
  fetchProducts,
  type ApparelFabricMode,
  type ApparelOptions,
} from '../../api/client';
import type { Product } from '../../types';
import { useSession } from '../../context/SessionContext';
import { friendlyMessage } from '../../components/StateView';
import { parseNumber } from '../../features/calculators/parse';
import { dateInputToIso, isValidDateInput } from '../../features/tenders/format';
import { fitDataUrl, pickCompressedImages } from '../../features/imagePicker';
import { pickDocPdf } from '../../components/passport/rows';
import { categoryLabel } from '../../features/products/catalog';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { AppBar, BottomSheet, Button, Card, Chip, ChipRow, Icon, Input, ListRow, Screen, SearchBox, SectionTitle, SkeletonRow } from '../../ui';

type Props = RootStackScreenProps<'ApparelQuoteForm'>;

// Sunucu sınırlarıyla aynı (backend/src/apparelRequests.ts).
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 700_000;
const SEARCH_DEBOUNCE_MS = 300;

type Attachment = { key: string; kind: 'image' | 'pdf'; dataUrl: string };
let seq = 0;

const fabricOptions = (): { key: ApparelFabricMode; label: string }[] => [
  { key: 'katalog', label: tr('Katalogdan seç') },
  { key: 'musteri', label: tr('Kumaşı ben sağlayacağım') },
  { key: 'firma_onersin', label: tr('Firma önersin') },
];

export function ApparelQuoteFormScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const { companyId, companyName } = route.params;
  const [options, setOptions] = useState<ApparelOptions | null>(null);
  const [group, setGroup] = useState(route.params.productGroup ?? '');
  const [quantity, setQuantity] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [fabricMode, setFabricMode] = useState<ApparelFabricMode>('firma_onersin');
  const [fabric, setFabric] = useState<Product | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetchApparelOptions().then(setOptions).catch(() => setError(tr('Seçenekler alınamadı')));
    // Ürün grubu verilmediyse firmanın ilk ana uzmanlığı.
    if (!route.params.productGroup) {
      fetchProduction(companyId)
        .then((v) => setGroup((g) => g || v.production.mainGroups[0] || v.production.productGroups[0] || ''))
        .catch(() => {});
    }
  }, [companyId, route.params.productGroup]);

  const qty = Math.round(parseNumber(quantity.replace(/\./g, '')));
  const dateInvalid = !isValidDateInput(targetDate);
  const needsFabric = fabricMode === 'katalog' && !fabric;
  const canSubmit = !!group && qty > 0 && !dateInvalid && !needsFabric && !submitting && !picking;

  const pdf = attachments.find((a) => a.kind === 'pdf');
  const imageCount = attachments.filter((a) => a.kind === 'image').length;

  const pickImages = async () => {
    if (pdf || imageCount >= MAX_IMAGES || picking) return;
    setMediaError(null);
    setPicking(true);
    try {
      const picked = await pickCompressedImages(MAX_IMAGES - imageCount);
      const added: Attachment[] = [];
      let tooLarge = false;
      for (const p of picked) {
        const fitted = await fitDataUrl(p.dataUrl, MAX_IMAGE_CHARS);
        if (fitted) added.push({ key: `img-${++seq}`, kind: 'image', dataUrl: fitted.dataUrl });
        else tooLarge = true;
      }
      setAttachments((prev) => [...prev, ...added].slice(0, MAX_IMAGES));
      if (tooLarge) setMediaError(tr('Bir fotoğraf çok büyük olduğu için eklenemedi.'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setMediaError(msg === 'permission_denied' ? tr('Galeriye erişim izni verilmedi.') : tr('Fotoğraf eklenemedi, tekrar deneyin.'));
    } finally {
      setPicking(false);
    }
  };

  const pickPdf = async () => {
    if (attachments.length || picking) return;
    setMediaError(null);
    setPicking(true);
    try {
      const res = await pickDocPdf();
      if (!res) return;
      if ('error' in res) {
        setMediaError(res.error);
        return;
      }
      if (res.image.kind !== 'new') return;
      setAttachments([{ key: `pdf-${++seq}`, kind: 'pdf', dataUrl: res.image.dataUrl }]);
    } finally {
      setPicking(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { request } = await createApparelRequest({
        targetCompanyId: companyId,
        productGroup: group,
        quantity: qty,
        targetDate: dateInputToIso(targetDate),
        fabricMode,
        fabricProductId: fabricMode === 'katalog' ? fabric?.id ?? null : null,
        attachments: attachments.map((a) => a.dataUrl),
        note: note.trim(),
      });
      haptics.success();
      navigation.replace('ApparelRequestDetail', { requestId: request.id });
    } catch (err) {
      haptics.error();
      const code = err instanceof ApiError ? err.code : undefined;
      setError(
        code === 'own_company'
          ? tr('Kendi firmanıza teklif isteği gönderemezsiniz.')
          : code === 'fabric_product_not_found'
            ? tr('Seçilen kumaş artık görünmüyor; başka bir kumaş seçin.')
            : code === 'daily_limit'
              ? tr('Bugün için teklif isteği sınırına ulaştınız.')
              : friendlyMessage(err, tr('Teklif isteği gönderilemedi'))
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Teklif iste')} leading="back" onBack={() => navigation.goBack()} />
      <Screen

        sticky={<Button size="lg" label={tr('Teklif isteği gönder')} loading={submitting} disabled={!canSubmit} onPress={submit} />}
      >
        <View style={{ gap: t.space[5] }}>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('{company} firmasına üretim için teklif isteği', { company: companyName })}</Text>

          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Ürün grubu')} />
            {options ? (
              <ChipRow wrap>
                {options.productGroups.map((o) => (
                  <Chip key={o.key} label={o.label} selected={group === o.key} onPress={() => setGroup(o.key)} />
                ))}
              </ChipRow>
            ) : (
              <SkeletonRow />
            )}
          </View>

          <Input
            label={tr('Adet')}
            unit={tr('adet')}
            keyboardType="number-pad"
            value={quantity}
            onChangeText={setQuantity}
            placeholder={tr('Örn. 5000')}
            maxLength={12}
          />
          <Input
            label={tr('Hedef termin (isteğe bağlı)')}
            value={targetDate}
            onChangeText={setTargetDate}
            placeholder="2026-12-15"
            autoCapitalize="none"
            helper={tr('YYYY-AA-GG biçiminde yazın.')}
            error={dateInvalid ? tr('Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).') : null}
          />

          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Kumaş')} />
            <ChipRow wrap>
              {fabricOptions().map((o) => (
                <Chip
                  key={o.key}
                  label={o.label}
                  selected={fabricMode === o.key}
                  onPress={() => {
                    setFabricMode(o.key);
                    if (o.key === 'katalog' && !fabric) setPickerOpen(true);
                  }}
                />
              ))}
            </ChipRow>
            {fabricMode === 'katalog' ? (
              fabric ? (
                <Card onPress={() => setPickerOpen(true)} accessibilityLabel={tr('Kumaşı değiştir')}>
                  <View style={{ gap: t.space[1] }}>
                    <Text style={[t.type.label14, { color: t.colors.ink }]}>{fabric.code}</Text>
                    <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                      {[categoryLabel(fabric.type, fabric.subtype ?? ''), fabric.company?.name].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </Card>
              ) : (
                <Button kind="secondary" icon="fabric" label={tr('Katalogdan kumaş seç')} onPress={() => setPickerOpen(true)} />
              )
            ) : null}
          </View>

          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Teknik föy ya da görsel')} />
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('En çok 4 görsel ya da tek PDF (teknik föy, ölçü tablosu).')}</Text>
            {attachments.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {attachments.map((a) => (
                  <View key={a.key} style={{ gap: t.space[1], alignItems: 'center' }}>
                    {a.kind === 'image' ? (
                      <Image source={{ uri: a.dataUrl }} style={{ width: t.size.row, height: t.size.row, borderRadius: t.radius.md }} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                        <Icon name="document-text-outline" size={t.size.iconSm} color="ink2" />
                        <Text style={[t.type.body14, { color: t.colors.ink }]}>{tr('Teknik föy (PDF)')}</Text>
                      </View>
                    )}
                    <Button kind="quiet" label={tr('Kaldır')} onPress={() => setAttachments((prev) => prev.filter((x) => x.key !== a.key))} />
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: t.space[2], flexWrap: 'wrap' }}>
              <Button kind="secondary" icon="camera" label={tr('Görsel ekle')} disabled={!!pdf || imageCount >= MAX_IMAGES || picking} onPress={pickImages} />
              <Button kind="secondary" icon="document-text-outline" label={tr('PDF ekle')} disabled={attachments.length > 0 || picking} onPress={pickPdf} />
            </View>
            {mediaError ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{mediaError}</Text> : null}
          </View>

          <Input label={tr('Not (isteğe bağlı)')} value={note} onChangeText={setNote} multiline maxLength={2000} placeholder={tr('Model, beden dağılımı, aksesuar, paketleme…')} />

          {error ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], padding: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.dangerSoft }}>
              <Icon name="warning" size={t.size.iconSm} color="danger" />
              <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{error}</Text>
            </View>
          ) : null}
        </View>
      </Screen>

      <FabricPicker
        visible={pickerOpen}
        myCompanyId={user?.companyId ?? null}
        targetCompanyId={companyId}
        onClose={() => {
          setPickerOpen(false);
          if (!fabric) setFabricMode('firma_onersin');
        }}
        onPick={(p) => {
          setFabric(p);
          setFabricMode('katalog');
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

// Katalogdan kumaş seçimi: arama sunucuda; yalnızca alıcının görebildiği (stokta ya da
// kendi / hedef firmanın) kumaşlar seçilebilir — sunucu da aynı kuralla doğrular.
function FabricPicker({
  visible,
  myCompanyId,
  targetCompanyId,
  onClose,
  onPick,
}: {
  visible: boolean;
  myCompanyId: string | null;
  targetCompanyId: string;
  onClose: () => void;
  onPick: (p: Product) => void;
}) {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchProducts(search.trim() || undefined)
        .then((r) => {
          if (cancelled) return;
          setItems(r.products.filter((p) => p.stock > 0 || p.companyId === myCompanyId || p.companyId === targetCompanyId).slice(0, 30));
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, search, myCompanyId, targetCompanyId]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('Katalogdan kumaş seç')}>
      <SearchBox value={search} onChangeText={setSearch} placeholder={tr('Kod, çeşit ya da firma')} accessibilityLabel={tr('Kumaş ara')} />
      {failed ? (
        <Text style={[t.type.body14, { color: t.colors.danger }]}>{tr('Kumaşlar alınamadı')}</Text>
      ) : items === null ? (
        <SkeletonRow />
      ) : items.length === 0 ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Uyan kumaş yok')}</Text>
      ) : (
        items.map((p, i) => (
          <ListRow
            key={p.id}
            title={p.code}
            subtitle={[categoryLabel(p.type, p.subtype ?? ''), p.company?.name].filter(Boolean).join(' · ')}
            divider={i < items.length - 1}
            onPress={() => onPick(p)}
          />
        ))
      )}
    </BottomSheet>
  );
}
