// Açık talep (ihale) detayı. Üç görünüm:
// - ALICI (talebi yayınlayan): gelen teklifler yan yana tabloda (RfqCompare
//   kalıbı), birini seçer ya da talebi kapatır.
// - SATICI (firması olan başka kullanıcı): teklif formu; gönderdiyse özet +
//   güncelle/geri çek. Talep kapalı/süresi dolmuşsa form yerine durum bandı.
// - Firması olmayan üçüncü kişi: yalnızca özet + "N teklif verildi".
// Satıcı yalnızca kendi teklifini görür (sunucu öyle döndürüyor).
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  acceptTenderOffer,
  closeTender,
  fetchTender,
  submitTenderOffer,
  withdrawTenderOffer,
  type Tender,
  type TenderCurrency,
  type TenderMedia,
  type TenderOffer,
  type TenderUnit,
} from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import { friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { formatMeasure, parseNumber } from '../../features/calculators/parse';
import { toDateInput } from '../../features/quotes/format';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { PostVideo } from '../../components/PostVideo';
import { loadTenderMedia, useTenderMedia } from '../../components/TenderCover';
import { openPdfDataUrl } from '../../features/docViewer';
import {
  TENDER_UNITS,
  accessoryTypeLabel,
  garmentDeliveryLabel,
  garmentTypeLabel,
  dateInputToIso,
  formatTenderDate,
  formatTenderQuantity,
  isValidDateInput,
  tenderBadge,
  tenderUnitShort,
} from '../../features/tenders/format';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, BottomSheet, Button, Card, EmptyState, Icon, Input, Screen, SectionTitle, SegmentControl } from '../../ui';

type Props = RootStackScreenProps<'TenderDetail'>;

// Tablo ölçüleri: RfqCompareScreen ile aynı mantık (375 px'te etiket
// sütunu + bir tam firma sütunu sığar, ikincinin başı görünür).
const LABEL_WIDTH = 96;
const COLUMN_WIDTH = 176;
const HEADER_HEIGHT = 72;
const FLAG_HEIGHT = 60;
const ROW_SINGLE = 48;
const ROW_DOUBLE = 64;
const ACTION_HEIGHT = 112;
const LONG_TEXT = 40;

const CURRENCIES: { value: TenderCurrency; label: string }[] = [
  { value: 'TRY', label: 'TL' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
];

function priceText(o: TenderOffer): string {
  return `${formatMeasure(o.price.value)} ${o.price.currency} / ${tenderUnitShort(o.price.unit)}`;
}

function Notice({ tone, text }: { tone: 'danger' | 'warning' | 'info' | 'success'; text: string }) {
  const t = useTheme();
  const bg = { danger: 'dangerSoft', warning: 'warningSoft', info: 'brandSoft', success: 'successSoft' } as const;
  const fg = { danger: 'danger', warning: 'warning', info: 'brand', success: 'success' } as const;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: t.colors[bg[tone]],
      }}
    >
      <Icon name={tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'warning'} size={t.size.iconSm} color={fg[tone]} />
      <Text style={[t.type.body14, { color: t.colors[fg[tone]], flex: 1, minWidth: 0 }]}>{text}</Text>
    </View>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[4] }}>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{label}</Text>
      <Text style={[mono ? t.type.mono14 : t.type.body14, { color: t.colors.ink, flexShrink: 1, textAlign: 'right' }]}>
        {value}
      </Text>
    </View>
  );
}

// --- Konfeksiyon / aksesuar özellikleri -------------------------------------

function SpecCard({ tender }: { tender: Tender }) {
  const t = useTheme();
  const spec = tender.spec;
  if (!spec) return null;
  if (tender.category === 'konfeksiyon') {
    const rows: [string, string | undefined][] = [
      ['Ürün', garmentTypeLabel(spec.garmentType) || undefined],
      ['Kumaş', spec.fabric],
      ['Kumaşı sağlayan', spec.fabricSupplied === 'alici' ? 'Alıcı' : spec.fabricSupplied === 'uretici' ? 'Üretici' : undefined],
      ['Bedenler', spec.sizes],
      ['Renkler', spec.colors],
    ];
    const delivery = spec.delivery ?? [];
    if (!rows.some(([, v]) => v) && !delivery.length) return null;
    return (
      <Card>
        <View style={{ gap: t.space[2] }}>
          <Text style={[t.type.title18, { color: t.colors.ink }]}>Ürün bilgileri</Text>
          {rows.map(([label, value]) => (value ? <InfoRow key={label} label={label} value={value} /> : null))}
          {delivery.length ? (
            <View style={{ gap: t.space[2], paddingTop: t.space[1] }}>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Teslim kapsamı</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {delivery.map((d) => (
                  <Badge key={d} kind="info" label={garmentDeliveryLabel(d)} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Card>
    );
  }
  if (tender.category === 'aksesuar') {
    const rows: [string, string | undefined][] = [
      ['Tür', accessoryTypeLabel(spec.accessoryType) || undefined],
      ['Malzeme', spec.material],
      ['Ölçü', spec.size],
      ['Renk', spec.color],
    ];
    if (!rows.some(([, v]) => v)) return null;
    return (
      <Card>
        <View style={{ gap: t.space[2] }}>
          <Text style={[t.type.title18, { color: t.colors.ink }]}>Aksesuar bilgileri</Text>
          {rows.map(([label, value]) => (value ? <InfoRow key={label} label={label} value={value} /> : null))}
        </View>
      </Card>
    );
  }
  return null;
}

// --- Galeri: fotoğraf, PDF, video ------------------------------------------

function GalleryThumb({
  tenderId,
  media,
  onOpen,
}: {
  tenderId: string;
  media: TenderMedia;
  onOpen: (url: string, caption: string | null) => void;
}) {
  const t = useTheme();
  const url = useTenderMedia(tenderId, media.id);
  return (
    <Pressable
      onPress={() => url && onOpen(url, media.caption)}
      disabled={!url}
      accessibilityRole="button"
      accessibilityLabel={media.caption ? `Fotoğraf: ${media.caption}, büyüt` : 'Fotoğrafı büyüt'}
      style={({ pressed }) => ({ width: t.size.thumb, gap: t.space[1], opacity: pressed ? 0.7 : 1 })}
    >
      <View
        style={{
          width: t.size.thumb,
          height: t.size.thumb,
          borderRadius: t.radius.md,
          overflow: 'hidden',
          backgroundColor: t.colors.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {url ? (
          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Icon name="image-outline" size={t.size.iconSm} color="ink3" />
        )}
      </View>
      {media.caption ? (
        <Text numberOfLines={1} style={[t.type.caption12, { color: t.colors.ink2, textAlign: 'center' }]}>
          {media.caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

function TenderGallery({ tender }: { tender: Tender }) {
  const t = useTheme();
  const [viewer, setViewer] = useState<{ url: string; caption: string | null } | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const media = [...(tender.media ?? [])].sort((a, b) => a.position - b.position);
  const images = media.filter((m) => m.kind === 'image');
  const pdfs = media.filter((m) => m.kind === 'pdf');
  const videos = tender.videos ?? [];
  if (!images.length && !pdfs.length && !videos.length) return null;

  const openPdf = async (m: TenderMedia) => {
    setPdfBusy(m.id);
    setPdfError(null);
    try {
      const dataUrl = await loadTenderMedia(tender.id, m.id);
      if (!dataUrl) throw new Error('pdf');
      await openPdfDataUrl(dataUrl, 'teknik-foy.pdf');
    } catch {
      setPdfError('PDF açılamadı, tekrar deneyin.');
    } finally {
      setPdfBusy(null);
    }
  };

  return (
    <View style={{ gap: t.space[4] }}>
      <SectionTitle title="Fotoğraf ve ekler" />
      <Card>
        <View style={{ gap: t.space[4] }}>
          {images.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[3] }}>
              {images.map((m) => (
                <GalleryThumb key={m.id} tenderId={tender.id} media={m} onOpen={(url, caption) => setViewer({ url, caption })} />
              ))}
            </View>
          ) : null}
          {pdfs.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <Icon name="document-text-outline" size={t.size.icon} color="ink2" />
              <Text numberOfLines={1} style={[t.type.body16, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
                {m.caption || 'Belge'}
              </Text>
              <Button
                kind="secondary"
                label="PDF'i aç"
                accessibilityLabel={`${m.caption || 'Belge'}, PDF'i aç`}
                loading={pdfBusy === m.id}
                onPress={() => openPdf(m)}
              />
            </View>
          ))}
          {pdfError ? <Notice tone="danger" text={pdfError} /> : null}
          {videos.map((v) => (
            <PostVideo key={v.id} video={v} />
          ))}
        </View>
      </Card>
      <ImageViewerModal
        visible={viewer !== null}
        imageUrl={viewer?.url ?? null}
        caption={viewer?.caption}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}

// --- Talep özeti kartı -------------------------------------------------------

function TenderSummaryCard({ tender, onOpenBuyer }: { tender: Tender; onOpenBuyer: () => void }) {
  const t = useTheme();
  const badge = tenderBadge(tender);
  const company = tender.buyer.company;
  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          <Badge kind="info" label={tender.categoryLabel || 'Açık talep'} />
          <Badge kind={badge.kind} label={badge.label} />
        </View>
        <Text style={[t.type.title22, { color: t.colors.ink }]}>{tender.title}</Text>
        {tender.summary ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tender.summary}</Text> : null}
        <Text style={[t.type.mono20, { color: t.colors.ink }]}>{formatTenderQuantity(tender.quantity, tender.unit)}</Text>
        <View style={{ gap: t.space[1] }}>
          {tender.targetDate ? <InfoRow label="İstenen termin" value={formatTenderDate(tender.targetDate)} mono /> : null}
          <InfoRow
            label="Son teklif"
            value={tender.deadline ? formatTenderDate(tender.deadline) : 'Talep kapanana kadar'}
            mono={!!tender.deadline}
          />
          <InfoRow label="Yayın" value={formatTenderDate(tender.createdAt)} mono />
        </View>
        {tender.note ? <Text style={[t.type.body16, { color: t.colors.ink }]}>“{tender.note}”</Text> : null}
        <Pressable
          onPress={onOpenBuyer}
          accessibilityRole="button"
          accessibilityLabel={`${company?.name ?? tender.buyer.name}, sayfayı aç`}
          style={({ pressed }) => ({
            minHeight: t.size.touchMin,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            borderTopWidth: 1,
            borderTopColor: t.colors.line,
            paddingTop: t.space[3],
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="user" size={t.size.iconSm} color="ink2" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[t.type.body16Strong, { color: t.colors.ink }]}>
              {company?.name ?? tender.buyer.name}
            </Text>
            {company ? (
              <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2 }]}>
                {tender.buyer.name}
              </Text>
            ) : null}
          </View>
          {company?.verification === 'dogrulanmis' ? <Badge kind="verified" /> : null}
          <Icon name="chevron" size={t.size.iconSm} color="ink3" />
        </Pressable>
      </View>
    </Card>
  );
}

// --- Alıcı: teklif tablosu ---------------------------------------------------

function OffersTable({
  tender,
  offers,
  busyId,
  onAccept,
  onMessage,
  onExpand,
}: {
  tender: Tender;
  offers: TenderOffer[];
  busyId: string | null;
  onAccept: (o: TenderOffer) => void;
  onMessage: (o: TenderOffer) => void;
  onExpand: (cell: { label: string; text: string }) => void;
}) {
  const t = useTheme();

  // "En düşük fiyat" yalnızca aynı para birimi + birim içinde; "en kısa
  // termin" tüm teklifler arasında. Tek teklifte işaret konmaz.
  const flags = useMemo(() => {
    const map = new Map<string, string[]>();
    if (offers.length < 2) return map;
    const groups = new Map<string, TenderOffer[]>();
    offers.forEach((o) => {
      const key = `${o.price.currency}/${o.price.unit}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    });
    groups.forEach((list) => {
      if (list.length < 2) return;
      const min = Math.min(...list.map((o) => o.price.value));
      list.filter((o) => o.price.value === min).forEach((o) => map.set(o.id, [...(map.get(o.id) ?? []), 'price']));
    });
    const leads = offers.filter((o) => o.leadTimeDays != null).map((o) => o.leadTimeDays as number);
    if (leads.length >= 2) {
      const min = Math.min(...leads);
      offers
        .filter((o) => o.leadTimeDays === min)
        .forEach((o) => map.set(o.id, [...(map.get(o.id) ?? []), 'lead']));
    }
    return map;
  }, [offers]);

  const cell = (height: number) => ({
    height,
    justifyContent: 'center' as const,
    paddingHorizontal: t.space[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.line,
  });

  const textCell = (label: string, text: string | null) => {
    if (!text) return <Text style={[t.type.body14, { color: t.colors.ink3 }]}>·</Text>;
    if (text.length <= LONG_TEXT)
      return (
        <Text style={[t.type.body14, { color: t.colors.ink }]} numberOfLines={2}>
          {text}
        </Text>
      );
    return (
      <Pressable
        onPress={() => onExpand({ label, text })}
        accessibilityRole="button"
        accessibilityLabel={`${label}, tamamını gör`}
        style={{ flex: 1, justifyContent: 'center' }}
      >
        <Text style={[t.type.body14, { color: t.colors.brand }]} numberOfLines={2}>
          {text}
        </Text>
      </Pressable>
    );
  };

  const mono = (text: string | null) =>
    text ? (
      <Text style={[t.type.mono14, { color: t.colors.ink }]} numberOfLines={1}>
        {text}
      </Text>
    ) : (
      <Text style={[t.type.body14, { color: t.colors.ink3 }]}>·</Text>
    );

  const rows: { key: string; label: string; height: number; render: (o: TenderOffer) => React.ReactNode }[] = [
    { key: 'price', label: 'Fiyat', height: ROW_SINGLE, render: (o) => mono(priceText(o)) },
    ...(tender.category === 'konfeksiyon'
      ? [
          {
            key: 'total',
            label: 'Toplam',
            height: ROW_SINGLE,
            render: (o: TenderOffer) =>
              mono(
                o.price.unit === tender.unit
                  ? `${formatMeasure(o.price.value * tender.quantity)} ${o.price.currency}`
                  : null
              ),
          },
        ]
      : []),
    {
      key: 'moq',
      label: 'En az sipariş',
      height: ROW_SINGLE,
      render: (o) => mono(o.moq != null ? `${formatMeasure(o.moq)} ${tenderUnitShort(o.moqUnit || tender.unit)}` : null),
    },
    { key: 'lead', label: 'Termin', height: ROW_SINGLE, render: (o) => mono(o.leadTimeDays != null ? `${o.leadTimeDays} gün` : null) },
    { key: 'valid', label: 'Geçerlilik', height: ROW_SINGLE, render: (o) => mono(o.validUntil ? formatTenderDate(o.validUntil) : null) },
    { key: 'pay', label: 'Ödeme', height: ROW_DOUBLE, render: (o) => textCell('Ödeme', o.paymentTerms) },
    { key: 'note', label: 'Not', height: ROW_DOUBLE, render: (o) => textCell('Not', o.note) },
  ];

  const awarded = tender.status === 'awarded';
  const canPick = tender.status === 'open';

  return (
    <Card noPadding style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', minWidth: 0 }}>
        <View style={{ width: LABEL_WIDTH, borderRightWidth: 1, borderRightColor: t.colors.line }}>
          <View style={cell(HEADER_HEIGHT)}>
            <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Firma</Text>
          </View>
          <View style={cell(FLAG_HEIGHT)} />
          {rows.map((r) => (
            <View key={r.key} style={cell(r.height)}>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]} numberOfLines={2}>
                {r.label}
              </Text>
            </View>
          ))}
          <View style={[cell(ACTION_HEIGHT), { borderBottomWidth: 0 }]} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ flexDirection: 'row' }}>
          {offers.map((o) => {
            const chosen = tender.awardedOfferId === o.id || o.status === 'accepted';
            const f = flags.get(o.id) ?? [];
            const companyName = o.seller?.company?.name ?? o.seller?.name ?? 'Firma';
            return (
              <View
                key={o.id}
                style={{
                  width: COLUMN_WIDTH,
                  borderRightWidth: 1,
                  borderRightColor: t.colors.line,
                  backgroundColor: chosen ? t.colors.successSoft : 'transparent',
                  opacity: awarded && !chosen ? 0.6 : 1,
                }}
              >
                <View style={[cell(HEADER_HEIGHT), { backgroundColor: chosen ? t.colors.successSoft : t.colors.surface2 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] }}>
                    <Text style={[t.type.body16Strong, { color: t.colors.ink, flexShrink: 1 }]} numberOfLines={2}>
                      {companyName}
                    </Text>
                    {o.seller?.company?.verification === 'dogrulanmis' ? (
                      <View accessibilityLabel="Doğrulanmış firma" accessibilityRole="image">
                        <Icon name="shield-checkmark-outline" size={t.size.iconSm} color="success" />
                      </View>
                    ) : null}
                  </View>
                  {o.seller?.company ? (
                    <Text style={[t.type.caption12, { color: t.colors.ink3 }]} numberOfLines={1}>
                      {o.seller.name}
                    </Text>
                  ) : null}
                </View>
                <View style={cell(FLAG_HEIGHT)}>
                  <View style={{ gap: t.space[1] }}>
                    {chosen ? <Badge kind="delivered" label="Seçildi" /> : null}
                    {!chosen && f.includes('price') ? <Badge kind="delivered" label="En düşük fiyat" /> : null}
                    {!chosen && f.includes('lead') ? <Badge kind="new" label="En kısa termin" /> : null}
                  </View>
                </View>
                {rows.map((r) => (
                  <View key={r.key} style={cell(r.height)}>
                    {r.render(o)}
                  </View>
                ))}
                <View style={[cell(ACTION_HEIGHT), { borderBottomWidth: 0, gap: t.space[2] }]}>
                  {canPick ? (
                    <Button
                      kind="secondary"
                      fullWidth
                      label="Bu teklifi seç"
                      loading={busyId === o.id}
                      accessibilityLabel={`${companyName} teklifini seç`}
                      onPress={() => onAccept(o)}
                    />
                  ) : null}
                  <Button
                    kind="quiet"
                    fullWidth
                    icon="message"
                    label="Mesaj"
                    disabled={!o.seller?.id}
                    accessibilityLabel={`${companyName} ile mesajlaş`}
                    onPress={() => onMessage(o)}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Card>
  );
}

// --- Satıcı: teklif formu ----------------------------------------------------

function OfferForm({
  tender,
  myOffer,
  onSaved,
}: {
  tender: Tender;
  myOffer: TenderOffer | null;
  onSaved: () => Promise<void> | void;
}) {
  const t = useTheme();
  const active = myOffer && myOffer.status !== 'withdrawn' ? myOffer : null;
  const [editing, setEditing] = useState(!active);
  const [price, setPrice] = useState(active ? String(active.price.value).replace('.', ',') : '');
  const [currency, setCurrency] = useState<TenderCurrency>(active?.price.currency ?? 'USD');
  const garment = tender.category === 'konfeksiyon';
  const [priceUnit, setPriceUnit] = useState<TenderUnit>(active?.price.unit ?? (garment ? 'adet' : tender.unit));
  const [moq, setMoq] = useState(active?.moq != null ? String(active.moq) : '');
  const [lead, setLead] = useState(active?.leadTimeDays != null ? String(active.leadTimeDays) : '');
  const [validUntil, setValidUntil] = useState(active?.validUntil ? toDateInput(active.validUntil) : '');
  const [payment, setPayment] = useState(active?.paymentTerms ?? '');
  const [note, setNote] = useState(active?.note ?? '');
  const [busy, setBusy] = useState<'save' | 'withdraw' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const priceValue = parseNumber(price);
  const validInvalid = !isValidDateInput(validUntil);
  const canSubmit = priceValue > 0 && !validInvalid && busy === null;

  const handleError = (err: unknown, fallback: string) => {
    haptics.error();
    const code = err instanceof ApiError ? err.code : null;
    if (code === 'no_company') setError('Teklif vermek için önce firma sayfanızı oluşturun.');
    else if (code === 'own_tender') setError('Kendi talebinize teklif veremezsiniz.');
    else if (code === 'tender_closed') setError('Bu talep artık teklif kabul etmiyor.');
    else setError(friendlyMessage(err, fallback));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy('save');
    setError(null);
    try {
      await submitTenderOffer(tender.id, {
        priceValue,
        priceCurrency: currency,
        priceUnit,
        moq: parseNumber(moq) > 0 ? parseNumber(moq) : null,
        moqUnit: parseNumber(moq) > 0 ? priceUnit : undefined,
        leadTimeDays: lead.trim() ? Math.round(parseNumber(lead)) : null,
        validUntil: dateInputToIso(validUntil, true),
        paymentTerms: payment.trim() || undefined,
        note: note.trim() || undefined,
      });
      haptics.success();
      setEditing(false);
      await onSaved();
    } catch (err) {
      handleError(err, 'Teklif gönderilemedi');
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    const ok = await confirmAction({
      title: 'Teklif geri çekilsin mi?',
      message: 'Alıcı teklifinizi artık görmez. İsterseniz talep açıkken yeniden teklif verebilirsiniz.',
      confirmLabel: 'Geri çek',
      destructive: true,
    });
    if (!ok) return;
    setBusy('withdraw');
    setError(null);
    try {
      await withdrawTenderOffer(tender.id);
      haptics.success();
      setEditing(true);
      await onSaved();
    } catch (err) {
      handleError(err, 'Teklif geri çekilemedi');
    } finally {
      setBusy(null);
    }
  };

  const errorBox = error ? <Notice tone="danger" text={error} /> : null;

  // Teklif gönderilmiş: özet + güncelle / geri çek.
  if (active && !editing) {
    const chosen = active.status === 'accepted';
    return (
      <Card>
        <View style={{ gap: t.space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2] }}>
            <Text style={[t.type.title18, { color: t.colors.ink }]}>Teklifiniz</Text>
            <Badge
              kind={chosen ? 'delivered' : active.status === 'declined' ? 'cancelled' : 'pending'}
              label={chosen ? 'Seçildi' : active.status === 'declined' ? 'Seçilmedi' : 'Gönderildi'}
            />
          </View>
          <Text style={[t.type.mono20, { color: t.colors.ink }]}>{priceText(active)}</Text>
          <View style={{ gap: t.space[1] }}>
            {active.moq != null ? (
              <InfoRow label="En az sipariş" value={`${formatMeasure(active.moq)} ${tenderUnitShort(active.moqUnit || tender.unit)}`} mono />
            ) : null}
            {active.leadTimeDays != null ? <InfoRow label="Termin" value={`${active.leadTimeDays} gün`} mono /> : null}
            {active.validUntil ? <InfoRow label="Geçerlilik" value={formatTenderDate(active.validUntil)} mono /> : null}
            {active.paymentTerms ? <InfoRow label="Ödeme" value={active.paymentTerms} /> : null}
          </View>
          {active.note ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>“{active.note}”</Text> : null}
          {chosen ? <Notice tone="success" text="Alıcı teklifinizi seçti. Ayrıntılar için alıcıyla mesajlaşın." /> : null}
          {errorBox}
          {tender.acceptingOffers && active.status === 'sent' ? (
            <View style={{ gap: t.space[2] }}>
              <Button kind="secondary" label="Teklifi güncelle" onPress={() => setEditing(true)} />
              <Button kind="danger" label="Geri çek" loading={busy === 'withdraw'} onPress={withdraw} />
            </View>
          ) : null}
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ gap: t.space[4] }}>
        <Text style={[t.type.title18, { color: t.colors.ink }]}>{active ? 'Teklifi güncelle' : 'Teklif ver'}</Text>
        <Input
          label={garment && priceUnit === 'adet' ? 'Adet başı paket fiyat' : 'Birim fiyat'}
          helper={garment ? 'Alıcının istediği teslim kapsamı (ütü, paket, poşet...) dahil adet fiyatı.' : undefined}
          value={price}
          onChangeText={setPrice}
          inputMode="decimal"
          keyboardType="decimal-pad"
          placeholder="Örn. 2,35"
          unit={`${currency} / ${tenderUnitShort(priceUnit)}`}
        />
        <SegmentControl<TenderCurrency> stretch accessibilityLabel="Para birimi" value={currency} onChange={setCurrency} options={CURRENCIES} />
        <SegmentControl<TenderUnit> stretch accessibilityLabel="Fiyat birimi" value={priceUnit} onChange={setPriceUnit} options={TENDER_UNITS} />
        {priceValue > 0 && priceUnit === tender.unit ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[3] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2, flexShrink: 1 }]}>
              {`Toplam: ${formatTenderQuantity(tender.quantity, tender.unit)} × ${formatMeasure(priceValue)} ${currency}`}
            </Text>
            <Text style={[t.type.mono14, { color: t.colors.ink }]}>
              {`${formatMeasure(priceValue * tender.quantity)} ${currency}`}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          <Input
            containerStyle={{ flex: 1, minWidth: 0 }}
            label="En az sipariş"
            value={moq}
            onChangeText={setMoq}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder="İsteğe bağlı"
            unit={tenderUnitShort(priceUnit)}
          />
          <Input
            containerStyle={{ flex: 1, minWidth: 0 }}
            label="Termin"
            value={lead}
            onChangeText={setLead}
            inputMode="numeric"
            keyboardType="number-pad"
            placeholder="İsteğe bağlı"
            unit="gün"
          />
        </View>
        <Input
          label="Teklif geçerlilik tarihi (isteğe bağlı)"
          value={validUntil}
          onChangeText={setValidUntil}
          placeholder="2026-10-31"
          autoCapitalize="none"
          error={validInvalid ? 'Tarihi YYYY-AA-GG biçiminde yazın.' : null}
        />
        <Input label="Ödeme koşulu (isteğe bağlı)" value={payment} onChangeText={setPayment} placeholder="Örn. 60 gün vadeli" />
        <Input label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örn. Stoktan 3 ton hemen" multiline />
        {errorBox}
        <Button
          size="lg"
          label={active ? 'Teklifi güncelle' : 'Teklif gönder'}
          loading={busy === 'save'}
          disabled={!canSubmit}
          onPress={submit}
        />
        {active ? <Button kind="quiet" label="Vazgeç" onPress={() => setEditing(false)} /> : null}
      </View>
    </Card>
  );
}

// --- Ekran -------------------------------------------------------------------

export function TenderDetailScreen({ route, navigation }: Props) {
  const t = useTheme();
  const { tenderId, notified } = route.params;
  const { user } = useSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ label: string; text: string } | null>(null);
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() => fetchTender(tenderId));

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const shell = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Açık talep" leading="back" onBack={() => navigation.goBack()} />
      {children}
    </View>
  );

  if (status === 'loading') return shell(<SkeletonDetail variant="product" />);

  if (!data) {
    return shell(
      <Screen>
        {error && !isNotFound(error) ? (
          <EmptyState
            icon="warning"
            title="Yüklenemedi"
            description={friendlyMessage(error, 'Talep alınamadı')}
            actionLabel="Tekrar dene"
            onAction={reload}
          />
        ) : (
          <EmptyState icon="megaphone-outline" title="Talep bulunamadı" description="Talep kaldırılmış olabilir." />
        )}
      </Screen>
    );
  }

  const { tender, offers, myOffer } = data;
  const visibleOffers = offers.filter((o) => o.status !== 'withdrawn');
  const isBuyer = tender.isMine;
  const hasCompany = !!user?.companyId;

  const openBuyer = () => {
    if (tender.buyer.company) navigation.navigate('CompanyProfile', { companyId: tender.buyer.company.id });
    else navigation.navigate('Profile', { userId: tender.buyer.id });
  };

  const accept = async (o: TenderOffer) => {
    const name = o.seller?.company?.name ?? 'Bu firma';
    const ok = await confirmAction({
      title: 'Bu teklif seçilsin mi?',
      message: `${name} teklifi (${priceText(o)}) seçilir, talep kapanır ve diğer firmalara seçilmedikleri bildirilir.`,
      confirmLabel: 'Teklifi seç',
    });
    if (!ok) return;
    setBusyId(o.id);
    setActionError(null);
    try {
      await acceptTenderOffer(tender.id, o.id);
      haptics.success();
      await reload();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'Teklif seçilemedi'));
    } finally {
      setBusyId(null);
    }
  };

  const close = async () => {
    const ok = await confirmAction({
      title: 'Talep kapatılsın mı?',
      message: 'Yeni teklif gelmez. Gelen teklifler burada görünmeye devam eder.',
      confirmLabel: 'Talebi kapat',
      destructive: true,
    });
    if (!ok) return;
    setClosing(true);
    setActionError(null);
    try {
      await closeTender(tender.id);
      haptics.success();
      await reload();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'Talep kapatılamadı'));
    } finally {
      setClosing(false);
    }
  };

  const message = (o: TenderOffer) => {
    if (o.seller?.id) navigation.navigate('Profile', { userId: o.seller.id });
  };

  const stateText =
    tender.status === 'awarded'
      ? 'Alıcı bir teklif seçti; bu talep kapandı.'
      : tender.status === 'closed'
        ? 'Bu talep kapatıldı, yeni teklif alınmıyor.'
        : tender.expired
          ? 'Son teklif tarihi geçti, yeni teklif alınmıyor.'
          : null;

  return shell(
    <Screen scroll={false} noPadding>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], paddingBottom: t.space[10], gap: t.space[6] }}
        refreshControl={refreshControl(refreshing, refresh)}
        keyboardShouldPersistTaps="handled"
      >
        {isBuyer && notified !== undefined ? (
          <Notice
            tone="success"
            text={notified > 0 ? `Talebiniz yayınlandı. ${notified} firmaya haber verildi.` : 'Talebiniz yayınlandı. Uygun firmalar gördükçe teklif verecek.'}
          />
        ) : null}

        <TenderSummaryCard tender={tender} onOpenBuyer={openBuyer} />
        <SpecCard tender={tender} />
        <TenderGallery tender={tender} />

        {actionError ? <Notice tone="danger" text={actionError} /> : null}
        {error ? <Notice tone="danger" text={friendlyMessage(error, 'Talep yenilenemedi')} /> : null}

        {isBuyer ? (
          <View style={{ gap: t.space[4] }}>
            <SectionTitle title={`Gelen teklifler (${visibleOffers.length})`} />
            {stateText ? <Notice tone="info" text={stateText} /> : null}
            {visibleOffers.length ? (
              <>
                <OffersTable
                  tender={tender}
                  offers={visibleOffers}
                  busyId={busyId}
                  onAccept={accept}
                  onMessage={message}
                  onExpand={setExpanded}
                />
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                  Para birimi çevrilmez; en düşük fiyat işareti aynı para birimi ve birim içinde verilir.
                </Text>
              </>
            ) : (
              <EmptyState
                icon="time-outline"
                title="Henüz teklif gelmedi"
                description="Firmalar teklif verdikçe burada yan yana görünür; size bildirim de gelir."
              />
            )}
            {tender.status === 'open' ? (
              <Button kind="danger" label="Talebi kapat" loading={closing} onPress={close} />
            ) : null}
          </View>
        ) : hasCompany && (tender.acceptingOffers || (myOffer && myOffer.status !== 'withdrawn')) ? (
          <View style={{ gap: t.space[4] }}>
            {stateText ? <Notice tone="info" text={stateText} /> : null}
            <OfferForm key={myOffer?.id ?? 'new'} tender={tender} myOffer={myOffer} onSaved={reload} />
          </View>
        ) : (
          <View style={{ gap: t.space[3] }}>
            {stateText ? <Notice tone="info" text={stateText} /> : null}
            <Card>
              <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>
                {tender.offerCount > 0 ? `${tender.offerCount} teklif verildi` : 'Henüz teklif verilmedi'}
              </Text>
              {!hasCompany && tender.acceptingOffers ? (
                <Text style={[t.type.body14, { color: t.colors.ink2, paddingTop: t.space[1] }]}>
                  Teklif vermek için bir firmaya bağlı olmalısınız.
                </Text>
              ) : null}
            </Card>
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={expanded !== null} onClose={() => setExpanded(null)} title={expanded?.label}>
        <Text style={[t.type.body16, { color: t.colors.ink }]}>{expanded?.text}</Text>
        <Button kind="secondary" label="Kapat" onPress={() => setExpanded(null)} />
      </BottomSheet>
    </Screen>
  );
}
