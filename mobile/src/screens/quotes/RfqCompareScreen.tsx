import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchRfq, type RfqCompare, type RfqRow } from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { quoteStatusLabel } from '../../components/QuoteStatusBadge';
import { formatMeasure } from '../../features/calculators/parse';
import { formatQuantity, formatQuoteDate, unitShort } from '../../features/quotes/format';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'RfqCompare'>;

// Dar ekranda en az iki sütun görünsün: 375px'te 108 + 2×164 sığıyor.
const LABEL_WIDTH = 108;
const COLUMN_WIDTH = 164;

const HEADER_HEIGHT = 92;
const FLAG_HEIGHT = 32;
const ACTION_HEIGHT = 52;

// "4,20 USD / m"
function priceText(value: number, currency: string, unit: string) {
  return `${formatMeasure(value)} ${currency} / ${unitShort(unit)}`;
}

// "2,40 USD/m'den çevrildi" — Türkçe ek birime göre değişiyor.
function convertedNote(price: { value: number; currency: string; unit: string }) {
  const suffix = price.unit === 'kg' ? "'dan" : "'den";
  return `${formatMeasure(price.value)} ${price.currency}/${unitShort(price.unit)}${suffix} çevrildi`;
}

function statusText(row: RfqRow): string {
  // Teklif yoksa isteğin kendi durumu anlatır (bekleniyor / geri çekildi).
  if (!row.quote) return quoteStatusLabel(row.requestStatus);
  if (row.quote.status === 'expired') return 'Süresi doldu';
  if (row.quote.status === 'accepted') return 'Kabul edildi';
  if (row.quote.status === 'declined') return 'Reddedildi';
  return 'Teklif verildi';
}

// Bileşen olarak: `styles` dosyanın altında tanımlı, modül yüklenirken
// değerlendirilen bir sabit olsaydı henüz tanımsız olurdu.
function Empty() {
  return <Text style={styles.cellMuted}>·</Text>;
}

interface RowSpec {
  key: string;
  label: string;
  height: number;
  render: (row: RfqRow) => React.ReactNode;
}

const ROW_SPECS: RowSpec[] = [
  {
    key: 'price',
    label: 'Birim fiyat',
    height: 62,
    render: (row) => {
      const comparable = row.quote?.comparablePrice;
      if (!comparable) {
        // Teklif var ama çevrilemedi (gramaj/en yok) ya da hiç teklif yok.
        return (
          <Text style={styles.cellMuted} numberOfLines={2}>
            {row.quote?.price
              ? priceText(row.quote.price.value, row.quote.price.currency, row.quote.price.unit)
              : statusText(row)}
          </Text>
        );
      }
      return (
        <View>
          <Text style={styles.cellStrong} numberOfLines={1}>
            {priceText(comparable.value, comparable.currency, comparable.unit)}
          </Text>
          {comparable.converted && row.quote?.price ? (
            <Text style={styles.cellTiny} numberOfLines={2}>
              {convertedNote(row.quote.price)}
            </Text>
          ) : null}
        </View>
      );
    },
  },
  {
    key: 'total',
    label: 'Tahmini toplam',
    height: 44,
    render: (row) => {
      const total = row.quote?.estimatedTotal;
      if (!total) return <Empty />;
      return (
        <Text style={styles.cellValue} numberOfLines={1}>
          {formatMeasure(total.value)} {total.currency}
        </Text>
      );
    },
  },
  {
    key: 'moq',
    label: 'En az sipariş',
    height: 52,
    render: (row) => {
      const quote = row.quote;
      if (!quote || quote.moq == null) return <Empty />;
      return (
        <View>
          <Text style={[styles.cellValue, quote.moqAboveQuantity && styles.cellWarn]} numberOfLines={1}>
            {formatMeasure(quote.moq)} {unitShort(quote.moqUnit || '')}
          </Text>
          {quote.moqAboveQuantity ? (
            <Text style={styles.cellTinyWarn} numberOfLines={1}>
              ihtiyacınızın üstünde
            </Text>
          ) : null}
        </View>
      );
    },
  },
  {
    key: 'lead',
    label: 'Termin',
    height: 44,
    render: (row) => {
      if (row.quote?.leadTimeDays == null) return <Empty />;
      return (
        <Text style={styles.cellValue} numberOfLines={1}>
          {row.quote.leadTimeDays} gün
        </Text>
      );
    },
  },
  {
    key: 'payment',
    label: 'Ödeme koşulu',
    height: 52,
    render: (row) => {
      if (!row.quote?.paymentTerms) return <Empty />;
      return (
        <Text style={styles.cellText} numberOfLines={2}>
          {row.quote.paymentTerms}
        </Text>
      );
    },
  },
  {
    key: 'valid',
    label: 'Geçerlilik',
    height: 44,
    render: (row) => {
      if (!row.quote?.validUntil) return <Empty />;
      return (
        <Text style={styles.cellValue} numberOfLines={1}>
          {formatQuoteDate(row.quote.validUntil)}
        </Text>
      );
    },
  },
  {
    key: 'note',
    label: 'Not',
    height: 52,
    render: (row) => {
      if (!row.quote?.note) return <Empty />;
      return (
        <Text style={styles.cellText} numberOfLines={2}>
          {row.quote.note}
        </Text>
      );
    },
  },
  {
    key: 'status',
    label: 'Durum',
    height: 44,
    render: (row) => (
      <Text style={styles.cellText} numberOfLines={2}>
        {statusText(row)}
      </Text>
    ),
  },
];

// Faz 3, Adım 1'in asıl ekranı: gelen teklifleri yan yana koyan tablo.
// Telefonda yatay kayar; ilk sütun sabit etiketlerdir, her firma bir sütun.
// Para birimi ÇEVRİLMEZ — "en düşük fiyat" işareti sunucuda yalnızca aynı
// para birimi içinde veriliyor, ekran da bunu yazıyor.
export function RfqCompareScreen({ route, navigation }: Props) {
  const { rfqId } = route.params;
  const { data: rfq, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchRfq(rfqId).then((res) => res.rfq)
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonDetail variant="product" />
      </View>
    );
  }

  if (!rfq) {
    return (
      <View style={styles.screen}>
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Karşılaştırma alınamadı" onRetry={reload} />
        ) : (
          <EmptyState
            icon="git-compare-outline"
            title="Karşılaştırma bulunamadı"
            message="İstek kaldırılmış ya da size ait olmayabilir."
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl(refreshing, refresh)}>
        <View style={styles.summary}>
          <Text style={styles.title}>{rfq.title}</Text>
          <Text style={styles.summaryMeta}>
            İstenen miktar: <Text style={styles.summaryValue}>{formatQuantity(rfq.quantity, rfq.unit)}</Text>
          </Text>
          {rfq.targetDate ? (
            <Text style={styles.summaryMeta}>
              İstenen termin: <Text style={styles.summaryValue}>{formatQuoteDate(rfq.targetDate)}</Text>
            </Text>
          ) : null}
          <Text style={styles.summaryMeta}>
            {rfq.requestCount} firmaya soruldu · {rfq.quotedCount} teklif geldi
          </Text>
          {rfq.note ? <Text style={styles.summaryNote}>“{rfq.note}”</Text> : null}
        </View>

        {rfq.currencies.length > 1 ? (
          <View style={styles.currencyBox} accessibilityRole="alert">
            <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.currencyText}>
              Teklifler farklı para birimlerinde; en düşük fiyat işareti yalnızca aynı para birimi içinde verilir.
            </Text>
          </View>
        ) : null}

        {error ? (
          <InlineError
            message={friendlyMessage(error, 'Karşılaştırma yenilenemedi')}
            onRetry={reload}
            style={styles.banner}
          />
        ) : null}

        <View style={styles.tableWrap}>
          <View style={styles.table}>
            {/* Sabit etiket sütunu: yatay kaydırmada yerinde kalır. */}
            <View style={styles.labelColumn}>
              <View style={[styles.labelCell, { height: HEADER_HEIGHT }]}>
                <Text style={styles.labelHeaderText}>Firma</Text>
              </View>
              <View style={[styles.labelCell, { height: FLAG_HEIGHT }]} />
              {ROW_SPECS.map((spec) => (
                <View key={spec.key} style={[styles.labelCell, { height: spec.height }]}>
                  <Text style={styles.labelText} numberOfLines={2}>
                    {spec.label}
                  </Text>
                </View>
              ))}
              <View style={[styles.labelCell, { height: ACTION_HEIGHT }]} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.columns}>
              {rfq.rows.map((row) => (
                <View key={row.requestId} style={styles.column}>
                  <View style={[styles.cell, styles.headerCell, { height: HEADER_HEIGHT }]}>
                    <View style={styles.companyLine}>
                      <Text style={styles.companyName} numberOfLines={2}>
                        {row.company.name}
                      </Text>
                      {row.company.verification === 'dogrulanmis' ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={colors.success}
                          accessibilityLabel="Doğrulanmış firma"
                        />
                      ) : null}
                    </View>
                    <Text style={styles.companyMeta} numberOfLines={1}>
                      {row.company.confirmedReferenceCount > 0
                        ? `${row.company.confirmedReferenceCount} referans`
                        : 'Referans yok'}
                    </Text>
                    <Text style={styles.productCode} numberOfLines={1}>
                      {row.product.code}
                    </Text>
                  </View>

                  <View style={[styles.cell, { height: FLAG_HEIGHT }]}>
                    <View style={styles.flagRow}>
                      {row.flags.includes('lowest_price') ? (
                        <View style={[styles.flag, styles.flagBest]}>
                          <Text style={styles.flagBestText}>En düşük fiyat</Text>
                        </View>
                      ) : null}
                      {row.flags.includes('fastest') ? (
                        <View style={[styles.flag, styles.flagFast]}>
                          <Text style={styles.flagFastText}>En kısa termin</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {ROW_SPECS.map((spec) => (
                    <View key={spec.key} style={[styles.cell, { height: spec.height }]}>
                      {spec.render(row)}
                    </View>
                  ))}

                  <View style={[styles.cell, { height: ACTION_HEIGHT }]}>
                    <Pressable
                      onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: row.requestId })}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.company.name} teklifini aç`}
                      style={({ pressed }) => [styles.openButton, pressed && styles.pressedQuiet]}
                    >
                      <Text style={styles.openText}>Teklifi aç</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        <Text style={styles.footNote}>
          Kabul ve ret işlemi teklifin kendi sayfasında yapılır. Fiyatlar istenen birime çevrilir; para birimi
          çevrilmez.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.blockGap, paddingBottom: spacing.xl },
  summary: { backgroundColor: colors.surface, padding: spacing.gutter, gap: 3 },
  title: { ...typography.heading, color: colors.primary },
  summaryMeta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  summaryValue: { ...typography.mono, fontSize: 15, color: colors.text },
  summaryNote: { ...typography.label, fontFamily: fonts.regular, color: colors.text, marginTop: spacing.xs },
  currencyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: spacing.gutter,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  currencyText: { ...typography.caption, color: colors.warning, flex: 1 },
  banner: { marginHorizontal: spacing.gutter },
  tableWrap: { backgroundColor: colors.surface, paddingVertical: spacing.sm },
  table: { flexDirection: 'row' },
  labelColumn: {
    width: LABEL_WIDTH,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
  },
  labelCell: {
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  labelHeaderText: { ...typography.caption, fontFamily: fonts.semibold, color: colors.textMuted },
  labelText: { ...typography.caption, fontFamily: fonts.medium, color: colors.textMuted },
  columns: { flexDirection: 'row' },
  column: { width: COLUMN_WIDTH, borderRightWidth: 1, borderRightColor: colors.divider },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerCell: { backgroundColor: colors.surfaceTonal, gap: 2 },
  companyLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  companyName: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary, flexShrink: 1 },
  companyMeta: { ...typography.caption, color: colors.textMuted },
  productCode: { ...typography.mono, fontSize: 13, lineHeight: 18, color: colors.accent },
  flagRow: { flexDirection: 'row', gap: 4 },
  flag: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  flagBest: { backgroundColor: colors.successSoft },
  flagBestText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, color: colors.success },
  flagFast: { backgroundColor: colors.accentSoft },
  flagFastText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, color: colors.primary },
  cellStrong: {
    ...typography.mono,
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    lineHeight: 21,
    color: colors.primary,
  },
  cellValue: { ...typography.mono, fontSize: 15, color: colors.text },
  cellText: { ...typography.caption, color: colors.text },
  cellMuted: { ...typography.caption, color: colors.textMuted },
  cellWarn: { color: colors.warning },
  cellTiny: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  cellTinyWarn: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.warning },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pressedQuiet: { backgroundColor: colors.pressed },
  openText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  footNote: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.gutter },
});
