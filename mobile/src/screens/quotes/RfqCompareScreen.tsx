// Teklif karşılaştırma tablosu (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri katmanı Faz 3, Adım 1'deki gibi; yalnızca sunum yeni. Tablo: sabit
// etiket sütunu + yatay kaydırılan firma sütunları; 375 px'te sayfa taşmaz,
// yalnızca tablonun kendi alanı kayar.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchRfq, type RfqRow } from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import { friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { quoteStatusLabel } from '../../components/QuoteStatusBadge';
import { PriceIndexCard } from '../../components/PriceIndexCard';
import { formatMeasure } from '../../features/calculators/parse';
import { formatQuantity, formatQuoteDate, unitShort } from '../../features/quotes/format';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, AppBar, Badge, BottomSheet, Button, Card, EmptyState, Icon, Screen } from '../../ui';

type Props = RootStackScreenProps<'RfqCompare'>;

// Tablo ölçüleri (DESIGN.md'de adı olmayan ekran-içi ölçüler). Dar ekranda
// etiket sütunu + en az bir tam firma sütunu görünür: 375 − 2×16 = 343 px'te
// 104 + 176 sığar, ikinci sütunun başı da görünür (kaydırılabildiği anlaşılır).
const LABEL_WIDTH = 104;
const COLUMN_WIDTH = 176;
const HEADER_HEIGHT = 96;
const FLAG_HEIGHT = 60; // alt alta iki rozet (22 + 4 + 22) + iç boşluk
const ROW_SINGLE = 48; // tek satır değer
const ROW_DOUBLE = 64; // değer + alt not ya da 2 satır metin
const ACTION_HEIGHT = 64;

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

// --- Hücre içi küçük bileşenler ------------------------------------------

function Empty() {
  const t = useTheme();
  return <Text style={[t.type.body14, { color: t.colors.ink3 }]}>·</Text>;
}

function CellValue({ text, warn }: { text: string; warn?: boolean }) {
  const t = useTheme();
  return (
    <Text style={[t.type.mono14, { color: warn ? t.colors.warning : t.colors.ink }]} numberOfLines={1}>
      {text}
    </Text>
  );
}

function CellText({ text, muted }: { text: string; muted?: boolean }) {
  const t = useTheme();
  return (
    <Text style={[t.type.body14, { color: muted ? t.colors.ink2 : t.colors.ink }]} numberOfLines={2}>
      {text}
    </Text>
  );
}

function CellNote({ text, warn }: { text: string; warn?: boolean }) {
  const t = useTheme();
  return (
    <Text style={[t.type.caption12, { color: warn ? t.colors.warning : t.colors.ink3 }]} numberOfLines={2}>
      {text}
    </Text>
  );
}

// Ödeme koşulu ve Not hücreleri 2 satırda kırpılıyor. Uzun metinde hücreye
// dokunmak tam metni alt sayfada açar; satır yükseklikleri sabit kalsın diye
// hücrenin içine ek bir şey konmuyor.
const LONG_TEXT = 40;

function ExpandableCell({
  label,
  text,
  onExpand,
}: {
  label: string;
  text: string;
  onExpand: (cell: { label: string; text: string }) => void;
}) {
  const t = useTheme();
  if (text.length <= LONG_TEXT) return <CellText text={text} />;
  return (
    <Pressable
      onPress={() => onExpand({ label, text })}
      accessibilityRole="button"
      accessibilityLabel={`${label}, tamamını gör`}
      // Hücrenin tamamını kaplar ki sabit yükseklikte de kolay dokunulsun.
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        justifyContent: 'center',
        flex: 1,
        backgroundColor: pressed ? t.colors.surface2 : 'transparent',
      })}
    >
      <Text style={[t.type.body14, { color: t.colors.brand }]} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

interface RowSpec {
  key: string;
  label: string;
  height: number;
  render: (row: RfqRow, onExpand: (cell: { label: string; text: string }) => void) => React.ReactNode;
}

const ROW_SPECS: RowSpec[] = [
  {
    key: 'price',
    label: 'Birim fiyat',
    height: ROW_DOUBLE,
    render: (row) => {
      const comparable = row.quote?.comparablePrice;
      if (!comparable) {
        // Teklif var ama çevrilemedi (gramaj/en yok) ya da hiç teklif yok.
        return (
          <CellText
            muted
            text={
              row.quote?.price
                ? priceText(row.quote.price.value, row.quote.price.currency, row.quote.price.unit)
                : statusText(row)
            }
          />
        );
      }
      return (
        <View>
          <CellValue text={priceText(comparable.value, comparable.currency, comparable.unit)} />
          {comparable.converted && row.quote?.price ? <CellNote text={convertedNote(row.quote.price)} /> : null}
        </View>
      );
    },
  },
  {
    key: 'total',
    label: 'Tahmini toplam',
    height: ROW_SINGLE,
    render: (row) => {
      const total = row.quote?.estimatedTotal;
      if (!total) return <Empty />;
      return <CellValue text={`${formatMeasure(total.value)} ${total.currency}`} />;
    },
  },
  {
    key: 'moq',
    label: 'En az sipariş',
    height: ROW_DOUBLE,
    render: (row) => {
      const quote = row.quote;
      if (!quote || quote.moq == null) return <Empty />;
      return (
        <View>
          <CellValue text={`${formatMeasure(quote.moq)} ${unitShort(quote.moqUnit || '')}`} warn={quote.moqAboveQuantity} />
          {quote.moqAboveQuantity ? <CellNote warn text="ihtiyacınızın üstünde" /> : null}
        </View>
      );
    },
  },
  {
    key: 'lead',
    label: 'Termin',
    height: ROW_SINGLE,
    render: (row) => {
      if (row.quote?.leadTimeDays == null) return <Empty />;
      return <CellValue text={`${row.quote.leadTimeDays} gün`} />;
    },
  },
  {
    key: 'payment',
    label: 'Ödeme koşulu',
    height: ROW_DOUBLE,
    render: (row, onExpand) => {
      if (!row.quote?.paymentTerms) return <Empty />;
      return <ExpandableCell label="Ödeme koşulu" text={row.quote.paymentTerms} onExpand={onExpand} />;
    },
  },
  {
    key: 'valid',
    label: 'Geçerlilik',
    height: ROW_SINGLE,
    render: (row) => {
      if (!row.quote?.validUntil) return <Empty />;
      return <CellValue text={formatQuoteDate(row.quote.validUntil)} />;
    },
  },
  {
    key: 'note',
    label: 'Not',
    height: ROW_DOUBLE,
    render: (row, onExpand) => {
      if (!row.quote?.note) return <Empty />;
      return <ExpandableCell label="Not" text={row.quote.note} onExpand={onExpand} />;
    },
  },
  {
    key: 'status',
    label: 'Durum',
    height: ROW_SINGLE,
    render: (row) => <CellText text={statusText(row)} />,
  },
];

// Uyarı şeridi (RequestsScreen'deki banner kalıbı).
function Notice({ tone, text }: { tone: 'danger' | 'warning'; text: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: tone === 'danger' ? t.colors.dangerSoft : t.colors.warningSoft,
      }}
    >
      <Icon name="warning" size={t.size.iconSm} color={tone} />
      <Text style={[t.type.body14, { color: t.colors[tone], flex: 1, minWidth: 0 }]}>{text}</Text>
    </View>
  );
}

// Faz 3, Adım 1'in asıl ekranı: gelen teklifleri yan yana koyan tablo.
// Telefonda yatay kayar; ilk sütun sabit etiketlerdir, her firma bir sütun.
// Para birimi ÇEVRİLMEZ — "en düşük fiyat" işareti sunucuda yalnızca aynı
// para birimi içinde veriliyor, ekran da bunu yazıyor.
export function RfqCompareScreen({ route, navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { rfqId } = route.params;
  // Kırpılan hücrenin tam metni (alt sayfa).
  const [expanded, setExpanded] = useState<{ label: string; text: string } | null>(null);
  const { data: rfq, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchRfq(rfqId).then((res) => res.rfq)
  );

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const shell = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Teklif karşılaştırma" leading="back" onBack={() => navigation.goBack()} />
      {children}
    </View>
  );

  if (status === 'loading') {
    return shell(<SkeletonDetail variant="product" />);
  }

  if (!rfq) {
    return shell(
      <Screen>
        {error && !isNotFound(error) ? (
          <EmptyState
            icon="warning"
            title="Yüklenemedi"
            description={friendlyMessage(error, 'Karşılaştırma alınamadı')}
            actionLabel="Tekrar dene"
            onAction={reload}
          />
        ) : (
          <EmptyState
            icon="git-compare-outline"
            title="Karşılaştırma bulunamadı"
            description="İstek kaldırılmış ya da size ait olmayabilir."
          />
        )}
      </Screen>
    );
  }

  // Hücre kutusu: ortalanmış, alt kenarlık.
  const cell = (height: number) => ({
    height,
    justifyContent: 'center' as const,
    paddingHorizontal: t.space[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.line,
  });

  return shell(
    <Screen scroll={false} noPadding>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad, gap: t.space[6] }}
        refreshControl={refreshControl(refreshing, refresh)}
      >
        <Card>
          <View style={{ gap: t.space[2] }}>
            <Text style={[t.type.title18, { color: t.colors.ink }]}>{rfq.title}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[4] }}>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>İstenen miktar</Text>
              <Text style={[t.type.mono14, { color: t.colors.ink }]}>{formatQuantity(rfq.quantity, rfq.unit)}</Text>
            </View>
            {rfq.targetDate ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[4] }}>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>İstenen termin</Text>
                <Text style={[t.type.mono14, { color: t.colors.ink }]}>{formatQuoteDate(rfq.targetDate)}</Text>
              </View>
            ) : null}
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              {rfq.requestCount} firmaya soruldu · {rfq.quotedCount} teklif geldi
            </Text>
            {rfq.note ? <Text style={[t.type.body16, { color: t.colors.ink }]}>“{rfq.note}”</Text> : null}
          </View>
        </Card>

        {rfq.currencies.length > 1 ? (
          <Notice
            tone="warning"
            text="Teklifler farklı para birimlerinde; en düşük fiyat işareti yalnızca aynı para birimi içinde verilir."
          />
        ) : null}

        {error ? (
          <View style={{ gap: t.space[2] }}>
            <Notice tone="danger" text={friendlyMessage(error, 'Karşılaştırma yenilenemedi')} />
            <Button kind="secondary" label="Tekrar dene" onPress={reload} />
          </View>
        ) : null}

        {/* Faz 3, Adım 6: tablonun üstünde tek piyasa aralığı kartı. Satırlar
            farklı ürünler olabildiği için ölçüt ilk satırdaki ürün; bu not
            başlığın altında açıkça yazılı. Veri yoksa kart hiç çizilmez. */}
        {rfq.rows.length ? (
          <PriceIndexCard
            productId={rfq.rows[0].product.id}
            subtitle="İlk üründeki kaliteye göre"
            hideWhenUnavailable
          />
        ) : null}

        <Card noPadding style={{ overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', minWidth: 0 }}>
            {/* Sabit etiket sütunu: yatay kaydırmada yerinde kalır. */}
            <View
              style={{
                width: LABEL_WIDTH,
                borderRightWidth: 1,
                borderRightColor: t.colors.line,
                backgroundColor: t.colors.surface1,
              }}
            >
              <View style={cell(HEADER_HEIGHT)}>
                <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Firma</Text>
              </View>
              <View style={cell(FLAG_HEIGHT)} />
              {ROW_SPECS.map((spec) => (
                <View key={spec.key} style={cell(spec.height)}>
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]} numberOfLines={2}>
                    {spec.label}
                  </Text>
                </View>
              ))}
              <View style={[cell(ACTION_HEIGHT), { borderBottomWidth: 0 }]} />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              style={{ flex: 1, minWidth: 0 }}
              contentContainerStyle={{ flexDirection: 'row' }}
            >
              {rfq.rows.map((row) => (
                <View
                  key={row.requestId}
                  style={{ width: COLUMN_WIDTH, borderRightWidth: 1, borderRightColor: t.colors.line }}
                >
                  <View style={[cell(HEADER_HEIGHT), { backgroundColor: t.colors.surface2, gap: t.space[1] / 2 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] }}>
                      <Text style={[t.type.body16Strong, { color: t.colors.ink, flexShrink: 1 }]} numberOfLines={2}>
                        {row.company.name}
                      </Text>
                      {row.company.verification === 'dogrulanmis' ? (
                        <View accessibilityLabel="Doğrulanmış firma" accessibilityRole="image">
                          <Icon name="shield-checkmark-outline" size={t.size.iconSm} color="success" />
                        </View>
                      ) : null}
                    </View>
                    <Text style={[t.type.caption12, { color: t.colors.ink3 }]} numberOfLines={1}>
                      {row.company.confirmedReferenceCount > 0
                        ? `${row.company.confirmedReferenceCount} referans`
                        : 'Referans yok'}
                    </Text>
                    <Text style={[t.type.mono14, { color: t.colors.ink2 }]} numberOfLines={1}>
                      {row.product.code}
                    </Text>
                  </View>

                  <View style={cell(FLAG_HEIGHT)}>
                    {/* İki rozet yan yana sütuna sığmaz; alt alta. */}
                    <View style={{ gap: t.space[1] }}>
                      {row.flags.includes('lowest_price') ? <Badge kind="delivered" label="En düşük fiyat" /> : null}
                      {row.flags.includes('fastest') ? <Badge kind="new" label="En kısa termin" /> : null}
                    </View>
                  </View>

                  {ROW_SPECS.map((spec) => (
                    <View key={spec.key} style={cell(spec.height)}>
                      {spec.render(row, setExpanded)}
                    </View>
                  ))}

                  <View style={[cell(ACTION_HEIGHT), { borderBottomWidth: 0 }]}>
                    <Button
                      kind="secondary"
                      fullWidth
                      label="Teklifi aç"
                      accessibilityLabel={`${row.company.name} teklifini aç`}
                      onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: row.requestId })}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </Card>

        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          Kabul ve ret işlemi teklifin kendi sayfasında yapılır. Fiyatlar istenen birime çevrilir; para birimi
          çevrilmez.
        </Text>
      </ScrollView>

      <BottomSheet visible={expanded !== null} onClose={() => setExpanded(null)} title={expanded?.label}>
        <Text style={[t.type.body16, { color: t.colors.ink }]}>{expanded?.text}</Text>
        <Button kind="secondary" label="Kapat" onPress={() => setExpanded(null)} />
      </BottomSheet>
    </Screen>
  );
}
