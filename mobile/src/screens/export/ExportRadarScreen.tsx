// Dünyayı Keşfet — İhracat Radarı (A aşaması, docs/kesfet-ihracat-plani.md §2):
// 1) ürün → tahmini GTİP (ya da elle seçim), 2) bölge, 3) ülke kartları pazar puanına göre.
// Sunucu eksik ülke verisini arka planda çeker; `pending` doluysa 5 sn'de bir yeniden sorulur.
// Aday alıcı listesi sonraki aşama (Platinum): yalnızca kilitli yer tutucu.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  fetchExportCountries,
  fetchExportMarkets,
  fetchExportProducts,
  type ExportCommonHs,
  type ExportCountry,
  type ExportMarketRow,
  type ExportMarketsResult,
  type ExportProduct,
  type ExportRegion,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import type { ColorTokens } from '../../theme/tokens';
import {
  AppBar,
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  ListRow,
  Screen,
  SectionTitle,
  SkeletonRow,
} from '../../ui';

type Props = RootStackScreenProps<'ExportRadar'>;

const REGIONS: ExportRegion[] = ['AB', 'Avrupa', 'Kuzey Amerika', 'Latin Amerika', 'Orta Doğu', 'Afrika', 'Asya'];
const POLL_MS = 5000;
const POLL_MAX = 36; // ~3 dk

// Ülke listesinde olmayan tedarikçiler için yedek adlar.
const EXTRA_NAMES: Record<number, string> = {
  156: 'Çin', 380: 'İtalya', 792: 'Türkiye', 356: 'Hindistan', 586: 'Pakistan', 704: 'Vietnam',
  158: 'Tayvan', 410: 'Kore', 276: 'Almanya', 50: 'Bangladeş', 764: 'Tayland', 360: 'Endonezya',
  724: 'İspanya', 251: 'Fransa', 620: 'Portekiz',
  // Comtrade'e özgü kodlar
  699: 'Hindistan', 490: 'Tayvan', 144: 'Sri Lanka', 842: 'ABD', 376: 'İsrail', 757: 'İsviçre',
};

const CONFIDENCE: Record<ExportProduct['hs']['confidence'], { label: string; kind: 'verified' | 'pending' | 'cancelled' }> = {
  yuksek: { label: 'YÜKSEK', kind: 'verified' },
  orta: { label: 'ORTA', kind: 'pending' },
  dusuk: { label: 'DÜŞÜK', kind: 'cancelled' },
};
const ACCESS: Record<ExportCountry['access'], string> = {
  gumruk_birligi: 'Gümrük birliği',
  sta: 'STA',
  mfn: 'MFN',
  engelli: 'Ticaret askıda',
};
const BUYER: Record<ExportCountry['buyerData'], string> = {
  acik: 'Firma bazında ithalat kaydı açık',
  dolayli: 'Alıcı verisi dolaylı',
  zayif: 'Alıcı verisi zayıf',
};
const RISK: Record<NonNullable<ExportCountry['risk']>, string> = {
  yaptirim: 'Yaptırım riski',
  odeme: 'Ödeme riski',
  kur: 'Kur riski',
};

// ---- Türkçe sayı biçimi (1.234,5; M$) ----
const num = (v: number, digits = 1) =>
  v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
export function formatUsd(v: number | null | undefined): string {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${num(v / 1e9)} Mr$`;
  if (a >= 1e6) return `${num(v / 1e6, a >= 1e7 ? 0 : 1)} M$`;
  if (a >= 1e3) return `${num(v / 1e3, 0)} B$`;
  return `${num(v, 0)} $`;
}
const pct = (v: number) => `%${num(v)}`;
const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}%${num(Math.abs(v), 0)}`;
const kg = (v: number | null) => (v == null ? '—' : `${num(v)} $`);

function scoreColor(score: number): keyof ColorTokens {
  if (score >= 70) return 'success';
  if (score >= 50) return 'warning';
  return 'ink2';
}

const isBlocked = (row: ExportMarketRow, c?: ExportCountry) => row.blocked || c?.access === 'engelli';

export function ExportRadarScreen({ navigation }: Props) {
  const t = useTheme();
  const [countries, setCountries] = useState<ExportCountry[]>([]);
  const [commonHs, setCommonHs] = useState<ExportCommonHs[]>([]);
  const [products, setProducts] = useState<ExportProduct[]>([]);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState<string | null>(null);

  const [productId, setProductId] = useState<string | null>(null);
  const [hs, setHs] = useState<{ hs6: string; label: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [region, setRegion] = useState<ExportRegion | null>(null);

  const [result, setResult] = useState<ExportMarketsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExportMarketRow | null>(null);
  const seq = useRef(0);

  const byM49 = useMemo(() => new Map(countries.map((c) => [c.m49, c])), [countries]);
  const nameOf = (m49: number) => byM49.get(m49)?.name ?? EXTRA_NAMES[m49] ?? `Diğer (${m49})`;

  const loadBase = useCallback(async () => {
    setBaseLoading(true);
    setBaseError(null);
    try {
      const [c, p] = await Promise.all([
        fetchExportCountries(),
        fetchExportProducts().catch((err) => {
          // Firması olmayan kullanıcı: yalnızca elle seçim.
          if (err instanceof ApiError && err.status === 400) return { products: [] as ExportProduct[] };
          throw err;
        }),
      ]);
      setCountries(c.countries);
      setCommonHs(c.commonHs);
      setProducts(p.products);
    } catch (err) {
      setBaseError(friendlyMessage(err, 'Bilgiler alınamadı'));
    } finally {
      setBaseLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // Pazar verisi; `pending` doluysa 5 sn'de bir yeniden sorar, yeni gelenler eklenir.
  const loadMarkets = useCallback(async () => {
    if (!hs) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    setResult(null);
    let tries = 0;
    const run = async (): Promise<void> => {
      try {
        const res = await fetchExportMarkets(hs.hs6, { region });
        if (id !== seq.current) return;
        setResult((prev) => {
          if (!prev) return res;
          const map = new Map(prev.markets.map((m) => [m.country.m49, m]));
          res.markets.forEach((m) => map.set(m.country.m49, m));
          return { ...res, markets: [...map.values()] };
        });
        setLoading(false);
        if (res.pending.length && tries < POLL_MAX) {
          tries += 1;
          await new Promise((r) => setTimeout(r, POLL_MS));
          if (id === seq.current) return run();
        }
      } catch (err) {
        if (id !== seq.current) return;
        setLoading(false);
        setError(friendlyMessage(err, 'Pazar verisi alınamadı'));
      }
    };
    await run();
  }, [hs, region]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  // Ekrandan çıkınca yoklama dursun.
  useEffect(
    () => () => {
      seq.current += 1;
    },
    []
  );

  const selectedProduct = products.find((p) => p.id === productId) ?? null;

  const chooseProduct = (p: ExportProduct) => {
    haptics.selection();
    setProductId(p.id);
    setHs({ hs6: p.hs.hs6, label: p.hs.label });
  };

  const sorted = useMemo(() => {
    const rows = result?.markets ?? [];
    const open = rows.filter((r) => !isBlocked(r, r.country));
    const blocked = rows.filter((r) => isBlocked(r, r.country));
    open.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return [...open, ...blocked];
  }, [result, byM49]);

  const groups = useMemo(() => {
    const g = new Map<string, ExportCommonHs[]>();
    commonHs.forEach((h) => g.set(h.group, [...(g.get(h.group) ?? []), h]));
    return [...g.entries()];
  }, [commonHs]);

  const body = (text: string, color: keyof ColorTokens = 'ink2') => (
    <Text style={[t.type.body14, { color: t.colors[color] }]}>{text}</Text>
  );

  // ---------- Adım 1 ----------
  const alternatives = selectedProduct
    ? [{ hs6: selectedProduct.hs.hs6, label: selectedProduct.hs.label }, ...selectedProduct.hs.alternatives]
    : [];
  const step1 = (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title="1. Ürününüz" linkLabel="Kodu elle seç" onLinkPress={() => setPickerOpen(true)} />
      {baseLoading ? (
        <View>
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : products.length === 0 ? (
        <Card>
          <View style={{ gap: t.space[3] }}>
            {body('Katalogda ürününüz yok. Satmak istediğiniz ürünün gümrük kodunu (GTİP) listeden seçin.')}
            <Button kind="secondary" label="Kodu elle seç" icon="search" onPress={() => setPickerOpen(true)} />
          </View>
        </Card>
      ) : (
        <Card noPadding>
          {products.map((p, i) => {
            const conf = CONFIDENCE[p.hs.confidence];
            const sel = p.id === productId;
            return (
              <ListRow
                key={p.id}
                title={p.code}
                subtitle={[p.subtype || p.type, p.content].filter(Boolean).join(' · ')}
                left={<Icon name={sel ? 'radio-button-on' : 'radio-button-off'} color={sel ? 'brand' : 'ink3'} />}
                right={
                  <View style={{ alignItems: 'flex-end', gap: t.space[1] }}>
                    <Text style={[t.type.mono14, { color: t.colors.ink }]}>{p.hs.hs6}</Text>
                    <Badge kind={conf.kind} label={conf.label} />
                  </View>
                }
                divider={i < products.length - 1}
                onPress={() => chooseProduct(p)}
                testID={`export-product-${p.id}`}
              />
            );
          })}
        </Card>
      )}

      {hs ? (
        <Card>
          <View style={{ gap: t.space[2] }}>
            <Text style={[t.type.caption12, { color: t.colors.ink2 }]}>SEÇİLİ KOD</Text>
            <Text style={[t.type.mono20, { color: t.colors.ink }]}>{hs.hs6}</Text>
            {body(hs.label, 'ink')}
            {selectedProduct && selectedProduct.hs.hs6 === hs.hs6 && selectedProduct.hs.reasons.length ? (
              <View style={{ gap: t.space[1] }}>
                <Text style={[t.type.label14, { color: t.colors.ink }]}>Neden bu kod?</Text>
                {selectedProduct.hs.reasons.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Icon name="check" size={t.size.iconSm} color="success" />
                    <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1 }]}>{r}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {alternatives.length > 1 ? (
              <View style={{ gap: t.space[1] }}>
                <Text style={[t.type.label14, { color: t.colors.ink }]}>Diğer olası kodlar</Text>
                <ChipRow>
                  {alternatives.map((a) => (
                    <Chip
                      key={a.hs6}
                      label={a.hs6}
                      selected={a.hs6 === hs.hs6}
                      onPress={() => {
                        haptics.selection();
                        setHs(a);
                      }}
                    />
                  ))}
                </ChipRow>
              </View>
            ) : null}
            {body('Tahmini kod; kesin sınıflandırma için gümrük müşavirinize danışın.', 'ink3')}
          </View>
        </Card>
      ) : null}
    </View>
  );

  // ---------- Adım 2 ----------
  const step2 = (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title="2. Nereye satmak istiyorsunuz?" />
      <ChipRow>
        <Chip label="Tümü" selected={region === null} onPress={() => setRegion(null)} />
        {REGIONS.map((r) => (
          <Chip
            key={r}
            label={r}
            selected={region === r}
            onPress={() => {
              haptics.selection();
              setRegion(region === r ? null : r);
            }}
          />
        ))}
      </ChipRow>
    </View>
  );

  // ---------- Adım 3 ----------
  const pendingCount = result?.pending.length ?? 0;
  const step3 = !hs ? (
    <Card>{body('Sonuçları görmek için bir ürün seçin ya da kodu elle seçin.')}</Card>
  ) : (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title="3. Pazarlar" />
      {pendingCount > 0 ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            gap: t.space[2],
            alignItems: 'center',
            backgroundColor: t.colors.brandSoft,
            borderRadius: t.radius.md,
            padding: t.space[3],
          }}
        >
          <Icon name="clock" size={t.size.iconSm} color="brand" />
          <Text style={[t.type.body14, { color: t.colors.ink, flex: 1 }]}>
            {pendingCount} ülkenin verisi getiriliyor…
          </Text>
        </View>
      ) : null}
      {loading && !result ? (
        <View>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : error ? (
        <EmptyState icon="warning" title="Pazar verisi alınamadı" description={error} actionLabel="Tekrar dene" onAction={loadMarkets} />
      ) : sorted.length === 0 && pendingCount === 0 ? (
        <EmptyState icon="globe-outline" title="Bu bölgede veri yok" description="Başka bir bölge seçin." />
      ) : (
        sorted.map((m) => (
          <MarketCard
            key={m.country.m49}
            row={m}
            country={m.country}
            name={m.country.name}
            onPress={() => setDetail(m)}
          />
        ))
      )}
      {result ? (
        <View style={{ gap: t.space[1] }}>
          {result.source ? body(`Kaynak: ${result.source}`, 'ink3') : null}
          {result.note ? body(result.note, 'ink3') : null}
          {body('Tutarlar USD, gümrük (CIF) değeri.', 'ink3')}
        </View>
      ) : null}
    </View>
  );

  const detailCountry = detail?.country;
  const maxPart = detail ? Math.max(1, ...detail.scoreParts.map((x) => x.points)) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Dünyayı Keşfet" leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <View style={{ gap: t.space[1], paddingTop: t.space[4] }}>
          <Text style={[t.type.title22, { color: t.colors.ink }]}>İhracat Radarı</Text>
          {body('Ürününüzün hangi ülkelerde alıcı bulabileceğini resmi ithalat verisiyle görün.')}
        </View>
        {baseError ? (
          <EmptyState icon="warning" title="Bilgiler alınamadı" description={baseError} actionLabel="Tekrar dene" onAction={loadBase} />
        ) : (
          <>
            {step1}
            {step2}
            {step3}
            <LockedBuyers title="Alıcı listesi yakında (Platinum)" />
          </>
        )}
      </Screen>

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Gümrük kodu (GTİP) seç">
        <View style={{ gap: t.space[4] }}>
          {groups.map(([group, items]) => (
            <View key={group}>
              <Text style={[t.type.caption12, { color: t.colors.ink2, marginBottom: t.space[1] }]}>
                {group.toLocaleUpperCase('tr-TR')}
              </Text>
              {items.map((h, i) => {
                const sel = hs?.hs6 === h.hs6;
                return (
                  <ListRow
                    key={h.hs6}
                    title={h.label}
                    subtitle={h.hs6}
                    left={<Icon name={sel ? 'radio-button-on' : 'radio-button-off'} color={sel ? 'brand' : 'ink3'} />}
                    divider={i < items.length - 1}
                    onPress={() => {
                      haptics.selection();
                      setProductId(null);
                      setHs({ hs6: h.hs6, label: h.label });
                      setPickerOpen(false);
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={!!detail} onClose={() => setDetail(null)} title={detail?.country.name}>
        {detail ? (
          <View style={{ gap: t.space[4] }}>
            {detail.score != null && detail.scoreParts.length ? (
              <View style={{ gap: t.space[2] }}>
                <Text style={[t.type.label14, { color: t.colors.ink }]}>Puan: {detail.score} / 100</Text>
                {detail.scoreParts.map((p) => (
                  <View key={p.label} style={{ gap: t.space[1] }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
                      <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1 }]}>{p.label}</Text>
                      <Text style={[t.type.label14, { color: t.colors.ink }]}>{num(p.points)}</Text>
                    </View>
                    <View style={{ height: t.space[2], backgroundColor: t.colors.surface2, borderRadius: t.radius.full }}>
                      <View
                        style={{
                          height: t.space[2],
                          width: `${Math.max(0, (p.points / maxPart) * 100)}%`,
                          backgroundColor: t.colors.brand,
                          borderRadius: t.radius.full,
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            {detail.topSuppliers.length ? (
              <View style={{ gap: t.space[1] }}>
                <Text style={[t.type.label14, { color: t.colors.ink }]}>En büyük tedarikçiler</Text>
                {detail.topSuppliers.slice(0, 5).map((s, i) => (
                  <View key={s.m49} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
                    <Text style={[s.m49 === 792 ? t.type.label14 : t.type.body14, { color: t.colors.ink, flex: 1 }]}>
                      {i + 1}. {nameOf(s.m49)}
                    </Text>
                    <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{pct(s.sharePct)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {detailCountry?.notes.length ? (
              <View style={{ gap: t.space[1] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], flexWrap: 'wrap' }}>
                  <Text style={[t.type.label14, { color: t.colors.ink }]}>Bilinmesi gerekenler</Text>
                  {detailCountry.verify ? <Badge kind="pending" label="Kontrol edilmeli" /> : null}
                </View>
                {detailCountry.notes.map((n, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Icon name="info" size={t.size.iconSm} color="ink3" />
                    <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1 }]}>{n}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <LockedBuyers title="Bu ülkedeki aday alıcılar — Platinum ile yakında" />
            <Button kind="secondary" label="Kapat" onPress={() => setDetail(null)} fullWidth />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function LockedBuyers({ title }: { title: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityLabel={`${title}, kilitli`}
      style={{
        flexDirection: 'row',
        gap: t.space[3],
        alignItems: 'center',
        padding: t.space[4],
        borderRadius: t.radius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: t.colors.lineStrong,
        backgroundColor: t.colors.surface2,
      }}
    >
      <Icon name="lock-closed-outline" color="ink3" />
      <View style={{ flex: 1, gap: t.space[1] }}>
        <Text style={[t.type.label14, { color: t.colors.ink }]}>{title}</Text>
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          Ülkedeki ithalatçı firmaların adı, aldığı ürün ve iletişim bilgisi.
        </Text>
      </View>
    </View>
  );
}

function MarketCard({
  row,
  country,
  name,
  onPress,
}: {
  row: ExportMarketRow;
  country?: ExportCountry;
  name: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const blocked = isBlocked(row, country);
  const noData = !blocked && row.importUsd == null;
  const line = (text: string) => <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
        <Text
          style={[t.type.title18, { color: blocked ? t.colors.ink3 : t.colors.ink, flexShrink: 1 }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {country ? (
          <View style={{ paddingHorizontal: t.space[1], borderRadius: t.radius.sm, backgroundColor: t.colors.surface2 }}>
            <Text style={[t.type.caption12, { color: t.colors.ink2 }]}>{country.iso2}</Text>
          </View>
        ) : null}
      </View>
      {!blocked && row.score != null ? (
        <Text accessibilityLabel={`Puan ${row.score}`} style={[t.type.display28, { color: t.colors[scoreColor(row.score)] }]}>
          {row.score}
        </Text>
      ) : null}
    </View>
  );

  if (blocked) {
    return (
      <View
        style={{
          backgroundColor: t.colors.surface2,
          borderRadius: t.radius.lg,
          borderWidth: 1,
          borderColor: t.colors.line,
          padding: t.space[4],
          gap: t.space[2],
        }}
      >
        {header}
        <View style={{ flexDirection: 'row' }}>
          <Badge kind="cancelled" label="Ticaret askıda" />
        </View>
        {country?.notes[0] ? line(country.notes[0]) : null}
      </View>
    );
  }

  const u = row.unitUsdKg;
  const kgParts = [
    u.turkey != null ? `Türkiye ${kg(u.turkey)}` : null,
    u.china != null ? `Çin ${kg(u.china)}` : null,
    u.world != null ? `ortalama ${kg(u.world)}` : null,
  ].filter(Boolean);

  return (
    <Card onPress={onPress} accessibilityLabel={`${name}, ayrıntı`} testID={`market-${row.country.m49}`}>
      <View style={{ gap: t.space[2] }}>
        {header}
        {noData ? (
          line('Bu ülke bu kod için veri yayımlamamış.')
        ) : (
          <>
            {line(`İthalat${row.year ? ` ${row.year}` : ''}: ${formatUsd(row.importUsd)}`)}
            {row.growthPct != null ? line(`Büyüme: ${signedPct(row.growthPct)}`) : null}
            {row.turkeySharePct != null
              ? line(`Türkiye payı: ${pct(row.turkeySharePct)}${row.turkeyRank ? ` (${row.turkeyRank}. tedarikçi)` : ''}`)
              : null}
            {kgParts.length ? line(`Kg fiyatı: ${kgParts.join(' · ')}`) : null}
          </>
        )}
        {country ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            <Badge kind={country.access === 'mfn' ? 'info' : 'verified'} label={ACCESS[country.access]} />
            <Badge
              kind={country.buyerData === 'acik' ? 'verified' : country.buyerData === 'dolayli' ? 'info' : 'pending'}
              label={BUYER[country.buyerData]}
            />
            {country.risk ? <Badge kind="cancelled" label={RISK[country.risk]} /> : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
