import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  cancelQuoteRequest,
  draftQuote,
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
import { EmptyState, ErrorState, InlineError, friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { ChipSelect } from '../../components/ChipSelect';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { QuoteStatusBadge } from '../../components/QuoteStatusBadge';
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
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'QuoteRequestDetail'>;

const UNIT_OPTIONS = STOCK_UNITS.map((unit) => ({ value: unit, label: STOCK_UNIT_LABELS[unit].short }));
const CURRENCY_OPTIONS = PRICE_CURRENCIES.map((currency) => ({ value: currency, label: currency }));

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

// Faz 2, Adım 2. Aynı ekran iki rolü de çiziyor: alıcı teklifi görür ve
// yanıtlar, satıcı teklifi hazırlar ve gönderir. Rol sunucudan geliyor
// (`request.role`), istemci karar vermiyor.
export function QuoteRequestDetailScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const insets = useSafeAreaInsets();
  const { data: request, setData, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchQuoteRequest(requestId).then((res) => res.request)
  );

  const [form, setForm] = useState<QuoteForm | null>(null);
  const hydratedRef = useRef<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<QuoteDraftInfo | null>(null);
  const [busy, setBusy] = useState<null | 'draft' | 'save' | 'send' | 'accept' | 'decline' | 'cancel'>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  // Form yalnızca ekran ilk açıldığında (istek başına bir kez) dolduruluyor:
  // odak yenilemesi kullanıcının yazdığını silmesin.
  useEffect(() => {
    if (!request || request.role !== 'seller') return;
    if (hydratedRef.current === request.id) return;
    hydratedRef.current = request.id;
    const source = request.draft ?? request.quotes.find((q) => q.status !== 'draft') ?? null;
    setForm(source ? formFromQuote(request, source) : emptyForm(request));
  }, [request]);

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonDetail variant="product" />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Teklif isteği alınamadı" onRetry={reload} />
        ) : (
          <EmptyState
            icon="pricetag-outline"
            title="Teklif isteği bulunamadı"
            message="İstek kaldırılmış ya da size ait olmayabilir."
          />
        )}
      </View>
    );
  }

  const isSeller = request.role === 'seller';
  const activeQuote = request.activeQuote;
  const expired = activeQuote?.status === 'expired';
  const isOpen = request.status === 'open' || request.status === 'quoted';
  // Satıcının daha önce gönderdiği teklif (revize ederken üstte özet olarak).
  const lastSent = request.quotes.find((q) => q.status !== 'draft') ?? null;
  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Teklif isteği yenilenemedi') : null);

  const updateForm = (patch: Partial<QuoteForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const runAction = async (
    kind: Exclude<typeof busy, null>,
    action: () => Promise<{ request: QuoteRequestRow }>,
    fallback: string
  ) => {
    setBusy(kind);
    setActionError(null);
    try {
      const { request: fresh } = await action();
      setData(fresh);
      haptics.success();
      return fresh;
    } catch (err) {
      haptics.error();
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'price_required') {
        setPriceError('Teklif göndermek için birim fiyat girin.');
        setActionError('Birim fiyat olmadan teklif gönderilemez.');
      } else if (code === 'quote_expired') {
        setActionError('Bu teklifin geçerlilik süresi dolmuş. Satıcıdan yeni teklif isteyin.');
      } else if (code === 'no_active_quote') {
        setActionError('Yanıtlanacak bir teklif yok.');
      } else if (code === 'no_draft') {
        setActionError('Önce teklifi kaydedin, sonra gönderin.');
      } else if (code === 'request_closed') {
        setActionError('Bu istek kapandı, üzerinde işlem yapılamaz.');
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
      setActionError(friendlyMessage(err, 'Ürün kaydından doldurulamadı'));
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
      setActionError('Geçerlilik tarihini YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).');
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
        setPriceError('Teklif göndermek için birim fiyat girin.');
        setActionError('Birim fiyat olmadan teklif gönderilemez.');
      } else if (code === 'request_closed') {
        setActionError('Bu istek kapandı, teklif gönderilemez.');
      } else {
        setActionError(friendlyMessage(err, 'Teklif gönderilemedi'));
      }
    } finally {
      setBusy(null);
    }
  };

  const respond = async (action: 'accept' | 'decline') => {
    const confirmed = await confirmAction({
      title: action === 'accept' ? 'Teklifi kabul et' : 'Teklifi reddet',
      message:
        action === 'accept'
          ? 'Teklifi kabul ettiğinizde satıcı firmaya bildirilir.'
          : 'Teklifi reddettiğinizde satıcı firmaya bildirilir.',
      confirmLabel: action === 'accept' ? 'Kabul et' : 'Reddet',
      destructive: action === 'decline',
    });
    if (!confirmed) return;
    await runAction(action, () => respondQuote(request.id, action), 'Teklif yanıtlanamadı');
  };

  const cancel = async () => {
    const confirmed = await confirmAction({
      title: 'İsteği geri çek',
      message: 'Teklif isteğiniz kapatılır, satıcı artık teklif gönderemez.',
      confirmLabel: 'Geri çek',
      destructive: true,
    });
    if (!confirmed) return;
    await runAction('cancel', () => cancelQuoteRequest(request.id), 'İstek geri çekilemedi');
  };

  const counterparty = isSeller
    ? [request.buyer.name, request.buyer.company?.name].filter(Boolean).join(' · ')
    : request.sellerCompany.name;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl(refreshing, refresh)}>
        <View style={[styles.block, styles.summary]}>
          <View style={styles.summaryTop}>
            <Pressable
              onPress={() => navigation.navigate('ProductDetail', { productId: request.product.id })}
              accessibilityRole="button"
              accessibilityLabel={`${request.product.code}, ürün sayfasını aç`}
              hitSlop={6}
              style={({ pressed }) => pressed && styles.pressedFade}
            >
              <Text style={styles.code}>{request.product.code}</Text>
            </Pressable>
            <QuoteStatusBadge status={request.status} />
          </View>
          <Text style={styles.counterparty}>{isSeller ? `İsteyen: ${counterparty}` : counterparty}</Text>
          <Text style={styles.summaryMeta}>
            İstenen miktar: <Text style={styles.summaryValue}>{formatQuantity(request.quantity, request.unit)}</Text>
          </Text>
          {request.targetDate ? (
            <Text style={styles.summaryMeta}>
              İstenen termin: <Text style={styles.summaryValue}>{formatQuoteDate(request.targetDate)}</Text>
            </Text>
          ) : null}
          <Text style={styles.summaryMeta}>{formatRelativeTime(request.createdAt)}</Text>
          {request.note ? <Text style={styles.requestNote}>“{request.note}”</Text> : null}
        </View>

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
          <InlineError message={bannerMessage} onRetry={actionError ? undefined : reload} style={styles.banner} />
        ) : null}
      </ScrollView>

      {isSeller && isOpen && form ? (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
          <PrimaryButton
            label={busy === 'save' ? 'Kaydediliyor...' : 'Kaydet'}
            variant="outline"
            size="lg"
            disabled={!!busy}
            onPress={save}
          />
          <PrimaryButton
            label={busy === 'send' ? 'Gönderiliyor...' : lastSent ? 'Revize teklifi gönder' : 'Teklifi gönder'}
            size="lg"
            disabled={!!busy}
            onPress={send}
            style={styles.actionMain}
          />
        </View>
      ) : null}

      {!isSeller && isOpen ? (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
          {/* Süresi dolmuş teklifte de aynı düğmeler çizilir ama kapalı
              (yukarıda sarı uyarı var); "geri çek" yalnızca teklif yokken. */}
          {activeQuote && (activeQuote.status === 'sent' || expired) ? (
            <>
              <PrimaryButton
                label={busy === 'decline' ? 'Gönderiliyor...' : 'Reddet'}
                variant="outline"
                size="lg"
                disabled={!!busy || expired}
                onPress={() => respond('decline')}
              />
              <PrimaryButton
                label={busy === 'accept' ? 'Gönderiliyor...' : 'Kabul et'}
                size="lg"
                disabled={!!busy || expired}
                onPress={() => respond('accept')}
                style={styles.actionMain}
              />
            </>
          ) : (
            <PrimaryButton
              label={busy === 'cancel' ? 'Geri çekiliyor...' : 'İsteği geri çek'}
              variant="outline"
              size="lg"
              disabled={!!busy}
              onPress={cancel}
              style={styles.actionMain}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

function dateInvalid(value: string) {
  return !!value.trim() && !DATE_PATTERN.test(value.trim());
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
  if (!activeQuote) {
    return (
      <View style={[styles.block, styles.infoBlock]}>
        <Ionicons name="time-outline" size={20} color={colors.textMuted} />
        <Text style={styles.infoText}>
          {request.status === 'cancelled'
            ? 'Bu isteği geri çektiniz.'
            : 'Satıcı teklif hazırlıyor. Teklif gelince bildirim alacaksınız.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.quoteWrap}>
      <QuoteCard quote={activeQuote} request={request} />
      {expired ? (
        <View style={styles.warnBox} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.warnText}>Bu teklifin geçerlilik süresi doldu; kabul edilemez.</Text>
        </View>
      ) : null}
    </View>
  );
}

// Kesik çizgili teklif kartı (PassportCard / AssistantResultCard görsel dili).
function QuoteCard({ quote, request, compact }: { quote: Quote; request: QuoteRequestRow; compact?: boolean }) {
  const total = quoteTotal(quote, request);
  const rows: { label: string; value: string }[] = [
    ...(total ? [{ label: 'Toplam', value: total }] : []),
    ...(quote.moq != null
      ? [{ label: 'En az sipariş', value: `${formatMeasure(quote.moq)} ${unitShort(quote.moqUnit || request.unit)}` }]
      : []),
    ...(quote.leadTimeDays != null ? [{ label: 'Termin', value: `${quote.leadTimeDays} gün` }] : []),
    ...(quote.validUntil ? [{ label: 'Geçerlilik', value: formatQuoteDate(quote.validUntil) }] : []),
    ...(quote.paymentTerms ? [{ label: 'Ödeme', value: quote.paymentTerms }] : []),
  ];

  return (
    <View style={[styles.quoteFrame, compact && styles.quoteFrameCompact]}>
      <View style={styles.quoteInner}>
        <View style={styles.quoteTop}>
          <Text style={styles.quoteKicker}>TEKLİF</Text>
          {quote.sentAt ? <Text style={styles.quoteSent}>{formatRelativeTime(quote.sentAt)}</Text> : null}
        </View>
        <Text style={styles.quotePrice}>{quote.price ? formatUnitPrice(quote.price) : 'Fiyat girilmedi'}</Text>
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.quoteRow, index < rows.length - 1 && styles.quoteRowDivider]}>
            <Text style={styles.quoteLabel}>{row.label}</Text>
            <Text style={styles.quoteValue}>{row.value}</Text>
          </View>
        ))}
        {quote.note ? <Text style={styles.quoteNote}>{quote.note}</Text> : null}
      </View>
    </View>
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
  if (!isOpen) {
    return (
      <View style={styles.quoteWrap}>
        {lastSent ? <QuoteCard quote={lastSent} request={request} /> : null}
        <View style={[styles.block, styles.infoBlock]}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
          <Text style={styles.infoText}>
            {request.status === 'accepted'
              ? 'Alıcı teklifi kabul etti.'
              : request.status === 'declined'
                ? 'Alıcı teklifi reddetti.'
                : 'Alıcı isteği geri çekti.'}
          </Text>
        </View>
      </View>
    );
  }

  if (!form) return null;

  const notices: string[] = [];
  if (draftInfo) {
    if (draftInfo.missing.includes('fiyat')) notices.push('Üründe fiyat kayıtlı değil, fiyatı siz girin.');
    if (draftInfo.missing.includes('termin')) notices.push('Üründe termin kayıtlı değil, gün olarak siz girin.');
    if (draftInfo.missing.some((m) => m.startsWith('birim çevirisi')))
      notices.push('Fiyatı istenen birime çevirmek için üründe gramaj ve en gerekiyor.');
    if (draftInfo.belowMoq) notices.push('İstenen miktar MOQ’nun altında.');
    if (draftInfo.converted)
      notices.push(
        draftInfo.total != null
          ? `Fiyat ${request.unit === 'm' ? 'kg’dan metreye' : 'metreden kg’a'} çevrildi; toplam ${formatMeasure(draftInfo.total)}.`
          : `Fiyat ${request.unit === 'm' ? 'kg’dan metreye' : 'metreden kg’a'} çevrildi.`
      );
  }

  return (
    <>
      {lastSent ? (
        <View style={styles.quoteWrap}>
          <Text style={styles.sectionNote}>Gönderilen son teklif</Text>
          <QuoteCard quote={lastSent} request={request} compact />
        </View>
      ) : null}

      <View style={styles.block}>
        <View style={styles.fillWrap}>
          <PrimaryButton
            label={busy === 'draft' ? 'Dolduruluyor...' : 'Ürün kaydından doldur'}
            icon="sparkles-outline"
            variant="outline"
            disabled={!!busy}
            onPress={onFill}
          />
        </View>

        {notices.length ? (
          <View style={styles.noticeWrap}>
            <View style={styles.warnBox} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
              <View style={styles.warnTexts}>
                {notices.map((notice) => (
                  <Text key={notice} style={styles.warnText}>
                    {notice}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.formBody}>
          <TextField
            label="Birim fiyat"
            value={form.priceValue}
            onChangeText={(priceValue) => onChange({ priceValue })}
            keyboardType="decimal-pad"
            placeholder="Örn. 4,50"
          />
          {priceError ? <Text style={styles.fieldError}>{priceError}</Text> : null}
          <Text style={styles.fieldLabel}>Para birimi</Text>
          <ChipSelect
            options={CURRENCY_OPTIONS}
            value={form.priceCurrency}
            onChange={(priceCurrency) => onChange({ priceCurrency })}
            compact
          />
          <Text style={styles.fieldLabel}>Fiyat birimi</Text>
          <ChipSelect
            options={UNIT_OPTIONS}
            value={form.priceUnit}
            onChange={(priceUnit) => onChange({ priceUnit })}
            compact
          />

          <TextField
            label="En az sipariş (isteğe bağlı)"
            value={form.moq}
            onChangeText={(moq) => onChange({ moq })}
            keyboardType="decimal-pad"
            placeholder="Örn. 300"
          />
          <Text style={styles.fieldLabel}>En az sipariş birimi</Text>
          <ChipSelect options={UNIT_OPTIONS} value={form.moqUnit} onChange={(moqUnit) => onChange({ moqUnit })} compact />

          <TextField
            label="Termin (gün, isteğe bağlı)"
            value={form.leadTimeDays}
            onChangeText={(leadTimeDays) => onChange({ leadTimeDays })}
            keyboardType="number-pad"
            placeholder="Örn. 12"
          />
          <TextField
            label="Geçerlilik tarihi (YYYY-AA-GG, isteğe bağlı)"
            value={form.validUntil}
            onChangeText={(validUntil) => onChange({ validUntil })}
            placeholder="2026-11-15"
            autoCapitalize="none"
          />
          {dateInvalid(form.validUntil) ? (
            <Text style={styles.fieldError}>Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).</Text>
          ) : null}
          <TextField
            label="Ödeme koşulu (isteğe bağlı)"
            value={form.paymentTerms}
            onChangeText={(paymentTerms) => onChange({ paymentTerms })}
            placeholder="Örn. %50 peşin, kalanı teslimatta"
          />
          <TextField
            label="Not (isteğe bağlı)"
            value={form.note}
            onChangeText={(note) => onChange({ note })}
            placeholder="Örn. Fiyat ekru içindir, boya ayrıca hesaplanır"
            multiline
          />
          <Text style={styles.privacyNote}>Fiyatı yalnızca siz ve isteği açan taraf görüyor.</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.blockGap, paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface },
  pressedFade: { opacity: 0.6 },
  summary: { padding: spacing.gutter, gap: 3 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  code: { fontFamily: fonts.monoSemibold, fontSize: 20, lineHeight: 26, color: colors.primary },
  counterparty: { ...typography.label, color: colors.accent },
  summaryMeta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  summaryValue: { ...typography.mono, fontSize: 15, color: colors.text },
  requestNote: { ...typography.label, fontFamily: fonts.regular, color: colors.text, marginTop: spacing.xs },
  infoBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.gutter },
  infoText: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, flex: 1 },
  quoteWrap: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
  sectionNote: { ...typography.caption, color: colors.textMuted },
  // Kesik çizgili teklif kartı: akıştaki pasaport kartıyla aynı görsel dil.
  quoteFrame: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 4,
  },
  quoteFrameCompact: { opacity: 0.9 },
  quoteInner: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    gap: 4,
  },
  quoteTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  quoteKicker: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0.5, color: colors.textMuted },
  quoteSent: { ...typography.mono, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  quotePrice: { fontFamily: fonts.monoSemibold, fontSize: 22, lineHeight: 30, color: colors.primary },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 6,
  },
  quoteRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  quoteLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  quoteValue: { ...typography.mono, fontFamily: fonts.monoMedium, fontSize: 16, color: colors.text, flexShrink: 1, textAlign: 'right' },
  quoteNote: { ...typography.label, fontFamily: fonts.regular, color: colors.text, paddingTop: spacing.xs },
  fillWrap: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  formBody: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  fieldLabel: { ...typography.label, color: colors.text, marginBottom: spacing.xs, marginLeft: spacing.sm },
  fieldError: { ...typography.caption, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm },
  privacyNote: { ...typography.caption, color: colors.textMuted, paddingBottom: spacing.md },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  noticeWrap: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm },
  warnTexts: { flex: 1, gap: 2 },
  warnText: { ...typography.caption, color: colors.warning, flexShrink: 1 },
  banner: { marginHorizontal: spacing.gutter },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
    minHeight: MIN_TOUCH,
  },
  actionMain: { flex: 1 },
});
