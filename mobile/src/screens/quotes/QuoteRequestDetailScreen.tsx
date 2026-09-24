// Teklif isteği detayı (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri/işlev katmanı Faz 2, Adım 2 / Faz 3, Adım 4–6'daki gibi: uçlar,
// gövdeler, doğrulama ve durum mantığı aynı; yalnızca sunum yeni.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  cancelQuoteRequest,
  draftQuote,
  fetchDealByQuoteRequest,
  fetchQuoteRequest,
  respondQuote,
  saveQuote,
  sendQuote,
  type Quote,
  type QuoteDraftInfo,
  type QuoteFieldsInput,
  type QuoteRequestRow,
  type PriceCurrency,
} from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import { friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { PriceIndexCard } from '../../components/PriceIndexCard';
import { PRICE_CURRENCIES, STOCK_UNITS, STOCK_UNIT_LABELS, type StockUnit } from '../../features/products/catalog';
import { formatMeasure, parseNumber, toInputNumber } from '../../features/calculators/parse';
import { formatRelativeTime } from '../../features/time';
import {
  DATE_PATTERN,
  formatQuantity,
  formatQuoteDate,
  formatUnitPrice,
  quoteTotal,
  toDateInput,
  unitShort,
} from '../../features/quotes/format';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  AppBar,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Screen,
  SectionTitle,
  SegmentControl,
  type BadgeKind,
} from '../../ui';
import { tr } from '../../i18n';

type Props = RootStackScreenProps<'QuoteRequestDetail'>;

const UNIT_OPTIONS = STOCK_UNITS.map((unit) => ({ value: unit, label: STOCK_UNIT_LABELS[unit].short }));
const CURRENCY_OPTIONS = PRICE_CURRENCIES.map((currency) => ({ value: currency, label: currency }));

// Teklif isteği durumu → rozet (components/QuoteStatusBadge ile aynı eşleme).
const STATUS_BADGE = (): Record<QuoteRequestRow['status'], { kind: BadgeKind; label: string }> => ({
  open: { kind: 'pending', label: tr('Teklif bekleniyor') },
  quoted: { kind: 'info', label: tr('Teklif verildi') },
  accepted: { kind: 'delivered', label: tr('Kabul edildi') },
  declined: { kind: 'cancelled', label: tr('Reddedildi') },
  cancelled: { kind: 'cancelled', label: tr('Geri çekildi') },
});

// Satıcının teklif formunun alanları (hepsi metin: kullanıcı ne yazdıysa o).
interface QuoteForm {
  priceValue: string;
  priceCurrency: PriceCurrency;
  priceUnit: StockUnit;
  moq: string;
  moqUnit: StockUnit;
  leadTimeDays: string;
  validUntil: string;
  paymentTerms: string;
  note: string;
}

function emptyForm(request: QuoteRequestRow): QuoteForm {
  return {
    priceValue: '',
    priceCurrency: 'TRY',
    priceUnit: request.unit,
    moq: '',
    moqUnit: request.unit,
    leadTimeDays: '',
    validUntil: '',
    paymentTerms: '',
    note: '',
  };
}

function formFromQuote(request: QuoteRequestRow, quote: Quote): QuoteForm {
  const base = emptyForm(request);
  return {
    priceValue: quote.price ? toInputNumber(quote.price.value) : '',
    priceCurrency: (PRICE_CURRENCIES as readonly string[]).includes(quote.price?.currency ?? '')
      ? (quote.price!.currency as PriceCurrency)
      : base.priceCurrency,
    priceUnit: quote.price?.unit === 'm' || quote.price?.unit === 'kg' ? quote.price.unit : base.priceUnit,
    moq: quote.moq != null ? toInputNumber(quote.moq) : '',
    moqUnit: quote.moqUnit === 'm' || quote.moqUnit === 'kg' ? quote.moqUnit : base.moqUnit,
    leadTimeDays: quote.leadTimeDays != null ? String(quote.leadTimeDays) : '',
    validUntil: toDateInput(quote.validUntil),
    paymentTerms: quote.paymentTerms ?? '',
    note: quote.note ?? '',
  };
}

// Boş alan null gider ("temizle"); fiyat boşsa sunucu zaten göndermeyi
// reddeder (400 price_required), kaydetmeye izin verir.
function payloadFromForm(form: QuoteForm): QuoteFieldsInput {
  const price = form.priceValue.trim() ? parseNumber(form.priceValue) : null;
  const moq = form.moq.trim() ? parseNumber(form.moq) : null;
  const leadTime = form.leadTimeDays.trim() ? Math.round(parseNumber(form.leadTimeDays)) : null;
  return {
    priceValue: price && price > 0 ? price : null,
    ...(price && price > 0 ? { priceCurrency: form.priceCurrency, priceUnit: form.priceUnit } : {}),
    moq: moq && moq > 0 ? moq : null,
    moqUnit: moq && moq > 0 ? form.moqUnit : '',
    leadTimeDays: leadTime != null && leadTime >= 0 ? leadTime : null,
    validUntil: form.validUntil.trim() ? form.validUntil.trim() : null,
    paymentTerms: form.paymentTerms.trim(),
    note: form.note.trim(),
  };
}

function dateInvalid(value: string) {
  return !!value.trim() && !DATE_PATTERN.test(value.trim());
}

// --- Ekrana özel küçük bileşenler (src/ui'ye girmeyecek kadar yerel) ---

// Etiket solda, değer sağda; ölçü/fiyat eşit aralıklı yazıyla.
function SpecRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: t.space[4],
        minHeight: t.size.touchMin,
        paddingVertical: t.space[2],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.colors.line,
      }}
    >
      <Text style={[t.type.body14, { color: t.colors.ink2, flexShrink: 1 }]}>{label}</Text>
      <Text style={[t.type.mono14, { color: t.colors.ink, flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

// Uyarı / hata / bilgi şeridi (RequestsScreen'deki banner kalıbı).
function Notice({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success' | 'info';
  children: React.ReactNode;
}) {
  const t = useTheme();
  const bg =
    tone === 'danger'
      ? t.colors.dangerSoft
      : tone === 'warning'
        ? t.colors.warningSoft
        : tone === 'success'
          ? t.colors.successSoft
          : t.colors.surface1;
  const fg = tone === 'info' ? 'ink2' : tone;
  const icon = tone === 'danger' || tone === 'warning' ? 'warning' : tone === 'success' ? 'check' : 'info';
  return (
    <View
      accessibilityRole={tone === 'info' ? undefined : 'alert'}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: bg,
        borderWidth: tone === 'info' ? 1 : 0,
        borderColor: t.colors.line,
      }}
    >
      <Icon name={icon} size={t.size.iconSm} color={fg} />
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>{children}</View>
    </View>
  );
}

// Faz 2, Adım 2. Aynı ekran iki rolü de çiziyor: alıcı teklifi görür ve
// yanıtlar, satıcı teklifi hazırlar ve gönderir. Rol sunucudan geliyor
// (`request.role`), istemci karar vermiyor.
export function QuoteRequestDetailScreen({ route, navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { requestId } = route.params;
  const { data: request, setData, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchQuoteRequest(requestId).then((res) => res.request)
  );

  const [form, setForm] = useState<QuoteForm | null>(null);
  const hydratedRef = useRef<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<QuoteDraftInfo | null>(null);
  const [busy, setBusy] = useState<null | 'draft' | 'save' | 'send' | 'accept' | 'decline' | 'cancel'>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  // Faz 3, Adım 4: kabul edilen teklifin sipariş kaydı. Kabul yanıtından
  // (dealId) ya da ekran açılışında /deals/by-request'ten gelir; 404 "henüz
  // yok" demektir, o zaman düğme hiç çıkmaz.
  const [dealId, setDealId] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (request?.status !== 'accepted' || dealId) return;
    let cancelled = false;
    // Ayrı ve sessiz istek: sayfanın yüklenmesini bekletmez, hata yutulur.
    fetchDealByQuoteRequest(request.id)
      .then(({ deal }) => {
        if (!cancelled) setDealId(deal.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [request?.id, request?.status, dealId]);

  // Form yalnızca ekran ilk açıldığında (istek başına bir kez) dolduruluyor:
  // odak yenilemesi kullanıcının yazdığını silmesin.
  useEffect(() => {
    if (!request || request.role !== 'seller') return;
    if (hydratedRef.current === request.id) return;
    hydratedRef.current = request.id;
    const source = request.draft ?? request.quotes.find((q) => q.status !== 'draft') ?? null;
    setForm(source ? formFromQuote(request, source) : emptyForm(request));
  }, [request]);

  const shell = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Teklif')} leading="back" onBack={() => navigation.goBack()} />
      {children}
    </View>
  );

  if (status === 'loading') {
    return shell(<SkeletonDetail variant="product" />);
  }

  if (!request) {
    return shell(
      <Screen>
        {error && !isNotFound(error) ? (
          <EmptyState
            icon="warning"
            title={tr('Yüklenemedi')}
            description={friendlyMessage(error, tr('Teklif isteği alınamadı'))}
            actionLabel={tr('Tekrar dene')}
            onAction={reload}
          />
        ) : (
          <EmptyState
            icon="quote"
            title={tr('Teklif isteği bulunamadı')}
            description={tr('İstek kaldırılmış ya da size ait olmayabilir.')}
          />
        )}
      </Screen>
    );
  }

  const isSeller = request.role === 'seller';
  const activeQuote = request.activeQuote;
  const expired = activeQuote?.status === 'expired';
  const isOpen = request.status === 'open' || request.status === 'quoted';
  // Satıcının daha önce gönderdiği teklif (revize ederken üstte özet olarak).
  const lastSent = request.quotes.find((q) => q.status !== 'draft') ?? null;
  const bannerMessage = actionError ?? (error ? friendlyMessage(error, tr('Teklif isteği yenilenemedi')) : null);

  const updateForm = (patch: Partial<QuoteForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const runAction = async <T extends { request: QuoteRequestRow }>(
    kind: Exclude<typeof busy, null>,
    action: () => Promise<T>,
    fallback: string
  ): Promise<T | null> => {
    setBusy(kind);
    setActionError(null);
    try {
      const result = await action();
      setData(result.request);
      haptics.success();
      return result;
    } catch (err) {
      haptics.error();
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'price_required') {
        setPriceError(tr('Teklif göndermek için birim fiyat girin.'));
        setActionError(tr('Birim fiyat olmadan teklif gönderilemez.'));
      } else if (code === 'quote_expired') {
        setActionError(tr('Bu teklifin geçerlilik süresi dolmuş. Satıcıdan yeni teklif isteyin.'));
      } else if (code === 'no_active_quote') {
        setActionError(tr('Yanıtlanacak bir teklif yok.'));
      } else if (code === 'no_draft') {
        setActionError(tr('Önce teklifi kaydedin, sonra gönderin.'));
      } else if (code === 'request_closed') {
        setActionError(tr('Bu istek kapandı, üzerinde işlem yapılamaz.'));
      } else {
        setActionError(friendlyMessage(err, fallback));
      }
      return null;
    } finally {
      setBusy(null);
    }
  };

  const fillFromProduct = async () => {
    setPriceError(null);
    setBusy('draft');
    setActionError(null);
    try {
      const result = await draftQuote(request.id);
      setData(result.request);
      setDraftInfo(result.draftInfo);
      if (result.request.draft) setForm(formFromQuote(result.request, result.request.draft));
      haptics.success();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, tr('Ürün kaydından doldurulamadı')));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!form) return null;
    setPriceError(null);
    return runAction('save', () => saveQuote(request.id, payloadFromForm(form)), 'Teklif kaydedilemedi');
  };

  const send = async () => {
    if (!form) return;
    if (dateInvalid(form.validUntil)) {
      setActionError(tr('Geçerlilik tarihini YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).'));
      return;
    }
    setPriceError(null);
    setBusy('send');
    setActionError(null);
    try {
      // Önce kaydet, sonra gönder: kullanıcı "Kaydet"e basmadan da gönderebilsin.
      await saveQuote(request.id, payloadFromForm(form));
      const { request: fresh } = await sendQuote(request.id);
      setData(fresh);
      if (fresh.draft) setForm(formFromQuote(fresh, fresh.draft));
      setDraftInfo(null);
      haptics.success();
    } catch (err) {
      haptics.error();
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'price_required') {
        setPriceError(tr('Teklif göndermek için birim fiyat girin.'));
        setActionError(tr('Birim fiyat olmadan teklif gönderilemez.'));
      } else if (code === 'request_closed') {
        setActionError(tr('Bu istek kapandı, teklif gönderilemez.'));
      } else {
        setActionError(friendlyMessage(err, tr('Teklif gönderilemedi')));
      }
    } finally {
      setBusy(null);
    }
  };

  const respond = async (action: 'accept' | 'decline') => {
    const confirmed = await confirmAction({
      title: action === 'accept' ? tr('Teklifi kabul et') : tr('Teklifi reddet'),
      message:
        action === 'accept'
          ? tr('Teklifi kabul ettiğinizde satıcı firmaya bildirilir.')
          : tr('Teklifi reddettiğinizde satıcı firmaya bildirilir.'),
      confirmLabel: action === 'accept' ? tr('Kabul et') : tr('Reddet'),
      destructive: action === 'decline',
    });
    if (!confirmed) return;
    const result = await runAction(action, () => respondQuote(request.id, action), tr('Teklif yanıtlanamadı'));
    // Kabul edilince sunucu sipariş kaydını açıyor ve kimliğini yanıtta veriyor.
    if (result && action === 'accept' && result.dealId) {
      setDealId(result.dealId);
      setJustAccepted(true);
    }
  };

  const cancel = async () => {
    const confirmed = await confirmAction({
      title: tr('İsteği geri çek'),
      message: tr('Teklif isteğiniz kapatılır, satıcı artık teklif gönderemez.'),
      confirmLabel: tr('Geri çek'),
      destructive: true,
    });
    if (!confirmed) return;
    await runAction('cancel', () => cancelQuoteRequest(request.id), tr('İstek geri çekilemedi'));
  };

  const counterparty = isSeller
    ? [request.buyer.name, request.buyer.company?.name].filter(Boolean).join(' · ')
    : request.sellerCompany.name;
  const badge = STATUS_BADGE()[request.status] ?? STATUS_BADGE().open;

  // Yapışkan alt çubuk: ekranda en fazla 1 dolu düğme.
  let sticky: React.ReactNode = null;
  if (isSeller && isOpen && form) {
    sticky = (
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" size="lg" label={tr('Kaydet')} loading={busy === 'save'} disabled={!!busy} onPress={save} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            size="lg"
            label={lastSent ? tr('Revize teklifi gönder') : tr('Teklifi gönder')}
            loading={busy === 'send'}
            disabled={!!busy}
            onPress={send}
          />
        </View>
      </View>
    );
  } else if (!isSeller && isOpen) {
    // Süresi dolmuş teklifte de aynı düğmeler çizilir ama kapalı
    // (yukarıda uyarı var); "geri çek" yalnızca teklif yokken.
    sticky =
      activeQuote && (activeQuote.status === 'sent' || expired) ? (
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <View style={{ flex: 1 }}>
            <Button
              kind="danger"
              size="lg"
              label={tr('Reddet')}
              loading={busy === 'decline'}
              disabled={!!busy || expired}
              onPress={() => respond('decline')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              size="lg"
              label={tr('Teklifi kabul et')}
              loading={busy === 'accept'}
              disabled={!!busy || expired}
              onPress={() => respond('accept')}
            />
          </View>
        </View>
      ) : (
        <Button kind="danger" size="lg" label={tr('İsteği geri çek')} loading={busy === 'cancel'} disabled={!!busy} onPress={cancel} />
      );
  }

  return shell(
    <Screen scroll={false} noPadding sticky={sticky}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad, gap: t.space[6] }}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl(refreshing, refresh)}
      >
        {/* Özet kartı: ürün kodu + durum rozeti + istek bilgileri. */}
        <Card>
          <View style={{ gap: t.space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[3] }}>
              <Text style={[t.type.mono20, { color: t.colors.ink, flexShrink: 1 }]} numberOfLines={1}>
                {request.product.code}
              </Text>
              <Badge kind={badge.kind} label={badge.label} />
            </View>
            <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>
              {isSeller ? tr('İsteyen: {name}', { name: counterparty }) : counterparty}
            </Text>
            <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>{formatRelativeTime(request.createdAt)}</Text>
            <View>
              <SpecRow label={tr('İstenen miktar')} value={formatQuantity(request.quantity, request.unit)} last={!request.targetDate} />
              {request.targetDate ? (
                <SpecRow label={tr('İstenen termin')} value={formatQuoteDate(request.targetDate)} last />
              ) : null}
            </View>
            {request.note ? <Text style={[t.type.body16, { color: t.colors.ink }]}>“{request.note}”</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              <Button
                kind="quiet"
                label={tr('Ürün sayfasını aç')}
                icon="fabric"
                onPress={() => navigation.navigate('ProductDetail', { productId: request.product.id })}
              />
              {/* Faz 3, Adım 1: bu istek çoklu bir isteğin parçasıysa alıcı
                  tablonun tamamına buradan geçer. */}
              {!isSeller && request.rfqId ? (
                <Button
                  kind="quiet"
                  label={tr('Karşılaştırmayı aç')}
                  icon="git-compare-outline"
                  onPress={() => navigation.navigate('RfqCompare', { rfqId: request.rfqId! })}
                />
              ) : null}
            </View>
          </View>
        </Card>

        {/* Faz 3, Adım 4: kabul edilen teklifin sipariş kaydına geçiş. */}
        {dealId ? (
          <View style={{ gap: t.space[3] }}>
            {justAccepted ? (
              <Notice tone="success">
                <Text style={[t.type.body14, { color: t.colors.success }]}>{tr('Teklifi kabul ettiniz. Sipariş kaydı açıldı.')}</Text>
              </Notice>
            ) : null}
            <Button
              kind="secondary"
              fullWidth
              label={tr('Siparişi aç')}
              icon="sample"
              onPress={() => navigation.navigate('DealDetail', { dealId })}
            />
          </View>
        ) : null}

        {isSeller ? (
          <SellerSection
            request={request}
            form={form}
            lastSent={lastSent}
            draftInfo={draftInfo}
            priceError={priceError}
            busy={busy}
            isOpen={isOpen}
            onChange={updateForm}
            onFill={fillFromProduct}
          />
        ) : (
          <BuyerSection request={request} activeQuote={activeQuote} expired={expired} />
        )}

        {bannerMessage ? (
          <View style={{ gap: t.space[2] }}>
            <Notice tone="danger">
              <Text style={[t.type.body14, { color: t.colors.danger }]}>{bannerMessage}</Text>
            </Notice>
            {actionError ? null : <Button kind="secondary" label={tr('Tekrar dene')} onPress={reload} />}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// --- Alıcı görünümü ---------------------------------------------------------

function BuyerSection({
  request,
  activeQuote,
  expired,
}: {
  request: QuoteRequestRow;
  activeQuote: Quote | null;
  expired: boolean;
}) {
  const t = useTheme();
  if (!activeQuote) {
    return (
      <Notice tone="info">
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          {request.status === 'cancelled'
            ? tr('Bu isteği geri çektiniz.')
            : tr('Satıcı teklif hazırlıyor. Teklif gelince bildirim alacaksınız.')}
        </Text>
      </Notice>
    );
  }

  return (
    <>
      <View style={{ gap: t.space[3] }}>
        <SectionTitle title={tr('Gelen teklif')} />
        <QuoteCard quote={activeQuote} request={request} />
        {expired ? (
          <Notice tone="warning">
            <Text style={[t.type.body14, { color: t.colors.warning }]}>
              {tr('Bu teklifin geçerlilik süresi doldu; kabul edilemez.')}
            </Text>
          </Notice>
        ) : null}
      </View>
      {/* Faz 3, Adım 6: gelen teklifin altında piyasa aralığı. Alıcıda veri
          yoksa kart hiç çizilmez (sayfa kalabalıklaşmasın). */}
      <PriceIndexCard productId={request.product.id} hideWhenUnavailable />
    </>
  );
}

// Teklif kartı: fiyat büyük, altında etiket/değer satırları.
function QuoteCard({ quote, request }: { quote: Quote; request: QuoteRequestRow }) {
  const t = useTheme();
  const total = quoteTotal(quote, request);
  const rows: { label: string; value: string }[] = [
    ...(total ? [{ label: tr('Toplam'), value: total }] : []),
    ...(quote.moq != null
      ? [{ label: tr('En az sipariş'), value: `${formatMeasure(quote.moq)} ${unitShort(quote.moqUnit || request.unit)}` }]
      : []),
    ...(quote.leadTimeDays != null ? [{ label: tr('Termin'), value: tr('{n} gün', { n: quote.leadTimeDays }) }] : []),
    ...(quote.validUntil ? [{ label: tr('Geçerlilik'), value: formatQuoteDate(quote.validUntil) }] : []),
    ...(quote.paymentTerms ? [{ label: tr('Ödeme'), value: quote.paymentTerms }] : []),
  ];

  return (
    <Card>
      <View style={{ gap: t.space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[3] }}>
          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('Birim fiyat')}</Text>
          {quote.sentAt ? (
            <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>{formatRelativeTime(quote.sentAt)}</Text>
          ) : null}
        </View>
        <Text style={[t.type.mono20, { color: t.colors.ink }]}>
          {quote.price ? formatUnitPrice(quote.price) : tr('Fiyat girilmedi')}
        </Text>
        {rows.length ? (
          <View>
            {rows.map((row, index) => (
              <SpecRow key={row.label} label={row.label} value={row.value} last={index === rows.length - 1} />
            ))}
          </View>
        ) : null}
        {quote.note ? <Text style={[t.type.body16, { color: t.colors.ink }]}>{quote.note}</Text> : null}
      </View>
    </Card>
  );
}

// --- Satıcı görünümü --------------------------------------------------------

function SellerSection({
  request,
  form,
  lastSent,
  draftInfo,
  priceError,
  busy,
  isOpen,
  onChange,
  onFill,
}: {
  request: QuoteRequestRow;
  form: QuoteForm | null;
  lastSent: Quote | null;
  draftInfo: QuoteDraftInfo | null;
  priceError: string | null;
  busy: string | null;
  isOpen: boolean;
  onChange: (patch: Partial<QuoteForm>) => void;
  onFill: () => void;
}) {
  const t = useTheme();
  if (!isOpen) {
    return (
      <View style={{ gap: t.space[3] }}>
        {lastSent ? (
          <>
            <SectionTitle title={tr('Gönderilen teklif')} />
            <QuoteCard quote={lastSent} request={request} />
          </>
        ) : null}
        <Notice tone="info">
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            {request.status === 'accepted'
              ? tr('Alıcı teklifi kabul etti.')
              : request.status === 'declined'
                ? tr('Alıcı teklifi reddetti.')
                : tr('Alıcı isteği geri çekti.')}
          </Text>
        </Notice>
      </View>
    );
  }

  if (!form) return null;

  const notices: string[] = [];
  if (draftInfo) {
    if (draftInfo.missing.includes('fiyat')) notices.push(tr('Üründe fiyat kayıtlı değil, fiyatı siz girin.'));
    if (draftInfo.missing.includes('termin')) notices.push(tr('Üründe termin kayıtlı değil, gün olarak siz girin.'));
    if (draftInfo.missing.some((m) => m.startsWith('birim çevirisi')))
      notices.push(tr('Fiyatı istenen birime çevirmek için üründe gramaj ve en gerekiyor.'));
    if (draftInfo.belowMoq) notices.push(tr('İstenen miktar MOQ’nun altında.'));
    if (draftInfo.converted)
      notices.push(
        draftInfo.total != null
          ? request.unit === 'm'
            ? tr('Fiyat kg’dan metreye çevrildi; toplam {total}.', { total: formatMeasure(draftInfo.total) })
            : tr('Fiyat metreden kg’a çevrildi; toplam {total}.', { total: formatMeasure(draftInfo.total) })
          : request.unit === 'm'
            ? tr('Fiyat kg’dan metreye çevrildi.')
            : tr('Fiyat metreden kg’a çevrildi.')
      );
  }

  return (
    <>
      {lastSent ? (
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={tr('Gönderilen son teklif')} />
          <QuoteCard quote={lastSent} request={request} />
        </View>
      ) : null}

      {/* Faz 3, Adım 6: fiyatı yazmadan önce piyasa aralığı. Satıcıya
          `hideWhenUnavailable` VERİLMEZ: yeterli teklif birikmediğini de
          görsün (alıcı tarafında kart veri yoksa hiç çizilmiyor). */}
      <PriceIndexCard productId={request.product.id} />

      <View style={{ gap: t.space[4] }}>
        <SectionTitle title={lastSent ? tr('Revize teklif') : tr('Teklifiniz')} />
        <Button
          kind="secondary"
          fullWidth
          label={tr('Ürün kaydından doldur')}
          icon="sparkles-outline"
          loading={busy === 'draft'}
          disabled={!!busy}
          onPress={onFill}
        />

        {notices.length ? (
          <Notice tone="warning">
            {notices.map((notice) => (
              <Text key={notice} style={[t.type.body14, { color: t.colors.warning }]}>
                {notice}
              </Text>
            ))}
          </Notice>
        ) : null}

        <Input
          label={tr('Birim fiyat')}
          value={form.priceValue}
          onChangeText={(priceValue) => onChange({ priceValue })}
          inputMode="decimal"
          keyboardType="decimal-pad"
          placeholder={tr('Örn. 4,50')}
          unit={`${form.priceCurrency}/${unitShort(form.priceUnit)}`}
          error={priceError}
        />
        <View style={{ gap: t.space[1] }}>
          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('Para birimi')}</Text>
          <SegmentControl<PriceCurrency>
            stretch
            accessibilityLabel={tr('Para birimi')}
            options={CURRENCY_OPTIONS}
            value={form.priceCurrency}
            onChange={(priceCurrency) => onChange({ priceCurrency })}
          />
        </View>
        <View style={{ gap: t.space[1] }}>
          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('Fiyat birimi')}</Text>
          <SegmentControl<StockUnit>
            stretch
            accessibilityLabel={tr('Fiyat birimi')}
            options={UNIT_OPTIONS}
            value={form.priceUnit}
            onChange={(priceUnit) => onChange({ priceUnit })}
          />
        </View>

        <Input
          label={tr('En az sipariş (isteğe bağlı)')}
          value={form.moq}
          onChangeText={(moq) => onChange({ moq })}
          inputMode="decimal"
          keyboardType="decimal-pad"
          placeholder={tr('Örn. 300')}
          unit={unitShort(form.moqUnit)}
        />
        <View style={{ gap: t.space[1] }}>
          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('En az sipariş birimi')}</Text>
          <SegmentControl<StockUnit>
            stretch
            accessibilityLabel={tr('En az sipariş birimi')}
            options={UNIT_OPTIONS}
            value={form.moqUnit}
            onChange={(moqUnit) => onChange({ moqUnit })}
          />
        </View>

        <Input
          label={tr('Termin (isteğe bağlı)')}
          value={form.leadTimeDays}
          onChangeText={(leadTimeDays) => onChange({ leadTimeDays })}
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder={tr('Örn. 12')}
          unit={tr('gün')}
        />
        <Input
          label={tr('Geçerlilik tarihi (isteğe bağlı)')}
          value={form.validUntil}
          onChangeText={(validUntil) => onChange({ validUntil })}
          placeholder="2026-11-15"
          autoCapitalize="none"
          helper={tr('YYYY-AA-GG biçiminde yazın.')}
          error={dateInvalid(form.validUntil) ? tr('Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).') : null}
        />
        <Input
          label={tr('Ödeme koşulu (isteğe bağlı)')}
          value={form.paymentTerms}
          onChangeText={(paymentTerms) => onChange({ paymentTerms })}
          placeholder={tr('Örn. %50 peşin, kalanı teslimatta')}
        />
        <Input
          label={tr('Not (isteğe bağlı)')}
          value={form.note}
          onChangeText={(note) => onChange({ note })}
          placeholder={tr('Örn. Fiyat ekru içindir, boya ayrıca hesaplanır')}
          multiline
        />
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Fiyatı yalnızca siz ve isteği açan taraf görüyor.')}</Text>
      </View>
    </>
  );
}
