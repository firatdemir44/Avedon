// Dünyayı Keşfet — İhracat Radarı (A aşaması, docs/kesfet-ihracat-plani.md §2):
// 1) ürün → tahmini GTİP (ya da elle seçim), 2) bölge, 3) ülke kartları pazar puanına göre.
// Sunucu eksik ülke verisini arka planda çeker; `pending` doluysa 5 sn'de bir yeniden sorulur.
// Ülke ayrıntısından aday alıcı listesine (B aşaması, pilot erişim) geçilir; üst banttan takip listesi.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { locale, tr } from '../../i18n';
import {
  ApiError,
  fetchExportCountries,
  fetchExportMarkets,
  fetchExportProducts,
  type ExportCommonHs,
  type ExportCountry,
  type ExportMarketInsight,
  type ExportMarketRow,
  type ExportMarketsOverview,
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
  v.toLocaleString(locale(), { minimumFractionDigits: 0, maximumFractionDigits: digits });
export function formatUsd(v: number | null | undefined): string {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return tr('{n} Mr$', { n: num(v / 1e9) });
  if (a >= 1e6) return tr('{n} M$', { n: num(v / 1e6, a >= 1e7 ? 0 : 1) });
  if (a >= 1e3) return tr('{n} B$', { n: num(v / 1e3, 0) });
  return `${num(v, 0)} $`;
}
const pct = (v: number) => tr('%{n}', { n: num(v) });
const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${tr('%{n}', { n: num(Math.abs(v), 0) })}`;
const kg = (v: number | null) => (v == null ? '—' : `${num(v)} $`);

function scoreColor(score: number): keyof ColorTokens {
  if (score >= 70) return 'success';
  if (score >= 50) return 'warning';
  return 'ink2';
}

const isBlocked = (row: ExportMarketRow, c?: ExportCountry) => row.blocked || c?.access === 'engelli';

const VERDICT_KIND: Record<ExportMarketInsight['verdict'], 'verified' | 'info' | 'pending' | 'cancelled'> = {
  guclu: 'verified',
  degerlendirilebilir: 'info',
  zayif: 'pending',
  yok: 'cancelled',
};

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
  const [helpOpen, setHelpOpen] = useState(false);
  const seq = useRef(0);

  const byM49 = useMemo(() => new Map(countries.map((c) => [c.m49, c])), [countries]);
  const nameOf = (m49: number) => byM49.get(m49)?.name ?? (EXTRA_NAMES[m49] ? tr(EXTRA_NAMES[m49]) : tr('Diğer ({code})', { code: m49 }));

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
      setBaseError(friendlyMessage(err, tr('Bilgiler alınamadı')));
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
        setError(friendlyMessage(err, tr('Pazar verisi alınamadı')));
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
      <SectionTitle title={tr('1. Ürününüz')} linkLabel={tr('Kodu elle seç')} onLinkPress={() => setPickerOpen(true)} />
      {baseLoading ? (
        <View>
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : products.length === 0 ? (
        <Card>
          <View style={{ gap: t.space[3] }}>
            {body(tr('Katalogda ürününüz yok. Satmak istediğiniz ürünün gümrük kodunu (GTİP) listeden seçin.'))}
            <Button kind="secondary" label={tr('Kodu elle seç')} icon="search" onPress={() => setPickerOpen(true)} />
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
                    <Badge kind={conf.kind} label={tr(conf.label)} />
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
            <Text style={[t.type.caption12, { color: t.colors.ink2 }]}>{tr('SEÇİLİ KOD')}</Text>
            <Text style={[t.type.mono20, { color: t.colors.ink }]}>{hs.hs6}</Text>
            {body(hs.label, 'ink')}
            {selectedProduct && selectedProduct.hs.hs6 === hs.hs6 && selectedProduct.hs.reasons.length ? (
              <View style={{ gap: t.space[1] }}>
                <Text style={[t.type.label14, { color: t.colors.ink }]}>{tr('Neden bu kod?')}</Text>
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
                <Text style={[t.type.label14, { color: t.colors.ink }]}>{tr('Diğer olası kodlar')}</Text>
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
            {body(tr('Tahmini kod; kesin sınıflandırma için gümrük müşavirinize danışın.'), 'ink3')}
          </View>
        </Card>
      ) : null}
    </View>
  );

  // ---------- Adım 2 ----------
  const step2 = (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title={tr('2. Nereye satmak istiyorsunuz?')} />
      <ChipRow>
        <Chip label={tr('Tümü')} selected={region === null} onPress={() => setRegion(null)} />
        {REGIONS.map((r) => (
          <Chip
            key={r}
            label={tr(r)}
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
    <Card>{body(tr('Sonuçları görmek için bir ürün seçin ya da kodu elle seçin.'))}</Card>
  ) : (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title={tr('3. Pazarlar')} linkLabel={tr('Bu ekran nasıl okunur?')} onLinkPress={() => setHelpOpen(true)} />
      {result?.overview && result.overview.top.length ? <OverviewCard overview={result.overview} pendingCount={pendingCount} /> : null}
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
            {tr('{n} ülkenin verisi getiriliyor…', { n: pendingCount })}
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
        <EmptyState icon="warning" title={tr('Pazar verisi alınamadı')} description={error} actionLabel={tr('Tekrar dene')} onAction={loadMarkets} />
      ) : sorted.length === 0 && pendingCount === 0 ? (
        <EmptyState icon="globe-outline" title={tr('Bu bölgede veri yok')} description={tr('Başka bir bölge seçin.')} />
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
          {result.source ? body(tr('Kaynak: {source}', { source: result.source }), 'ink3') : null}
          {result.note ? body(result.note, 'ink3') : null}
          {body(tr('Tutarlar USD, gümrük (CIF) değeri.'), 'ink3')}
        </View>
      ) : null}
    </View>
  );

  const detailCountry = detail?.country;
  const maxPart = detail ? Math.max(1, ...detail.scoreParts.map((x) => x.points)) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar
        title={tr('Dünyayı Keşfet')}
        leading="back"
        onBack={() => navigation.goBack()}
        actions={[{ icon: 'bookmark-outline', label: tr('Takip listem'), onPress: () => navigation.navigate('ExportLeads') }]}
      />
      <Screen>
        <View style={{ gap: t.space[1], paddingTop: t.space[4] }}>
          <Text style={[t.type.title22, { color: t.colors.ink }]}>{tr('İhracat Radarı')}</Text>
          {body(tr('Ürününüzün hangi ülkelerde alıcı bulabileceğini resmi ithalat verisiyle görün.'))}
        </View>
        {baseError ? (
          <EmptyState icon="warning" title={tr('Bilgiler alınamadı')} description={baseError} actionLabel={tr('Tekrar dene')} onAction={loadBase} />
        ) : (
          <>
            {step1}
            {step2}
            {step3}
          </>
        )}
      </Screen>

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title={tr('Gümrük kodu (GTİP) seç')}>
        <View style={{ gap: t.space[4] }}>
          {groups.map(([group, items]) => (
            <View key={group}>
              <Text style={[t.type.caption12, { color: t.colors.ink2, marginBottom: t.space[1] }]}>
                {group.toLocaleUpperCase(locale())}
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
            {detail.insight ? <InsightBlock insight={detail.insight} /> : null}
            {detail.score != null && detail.scoreParts.length ? (
              <View style={{ gap: t.space[2] }}>
                <Text style={[t.type.label14, { color: t.colors.ink }]}>{tr('Puan: {n} / 100', { n: detail.score })}</Text>
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
                <Text style={[t.type.label14, { color: t.colors.ink }]}>{tr('En büyük tedarikçiler')}</Text>
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
                  <Text style={[t.type.label14, { color: t.colors.ink }]}>{tr('Bilinmesi gerekenler')}</Text>
                  {detailCountry.verify ? <Badge kind="pending" label={tr('Kontrol edilmeli')} /> : null}
                </View>
                {detailCountry.notes.map((n, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Icon name="info" size={t.size.iconSm} color="ink3" />
                    <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1 }]}>{n}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {hs && detailCountry && !isBlocked(detail, detailCountry) ? (
              <View style={{ gap: t.space[2] }}>
                <Text style={[t.type.label14, { color: t.colors.ink }]}>{tr('Aday alıcılar')}</Text>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                  {tr('Bu ülkede ürününüzü alabilecek firmalar: açık ticaret sicilleri ve Wikidata kayıtlarından, ürününüze uyumuna göre puanlanır.')}
                </Text>
                <Button
                  kind="primary"
                  icon="people-outline"
                  label={tr('Aday alıcıları gör')}
                  fullWidth
                  onPress={() => {
                    const c = detailCountry;
                    setDetail(null);
                    navigation.navigate('ExportBuyers', { hs6: hs.hs6, hsLabel: hs.label, country: c.iso2, countryName: c.name });
                  }}
                />
              </View>
            ) : null}
            <Button kind="secondary" label={tr('Kapat')} onPress={() => setDetail(null)} fullWidth />
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={helpOpen} onClose={() => setHelpOpen(false)} title={tr('Bu ekran nasıl okunur?')}>
        <View style={{ gap: t.space[4] }}>
          {getHelp().map((h) => (
            <View key={h.title} style={{ gap: t.space[1] }}>
              <Text style={[t.type.label14, { color: t.colors.ink }]}>{tr(h.title)}</Text>
              {h.lines.map((l, i) => (
                <Text key={i} style={[t.type.body14, { color: t.colors.ink2 }]}>
                  {tr(l)}
                </Text>
              ))}
            </View>
          ))}
          <Button kind="secondary" label={tr('Anladım')} onPress={() => setHelpOpen(false)} fullWidth />
        </View>
      </BottomSheet>
    </View>
  );
}

const getHelp = (): { title: string; lines: string[] }[] => [
  {
    title: 'Puan nedir?',
    lines: [
      '0–100 arası bir özet not. Ülkenin bu üründen ne kadar aldığı, alımının büyüyüp büyümediği, Türkiye\'nin orada ne kadar tuttuğu, gümrük avantajı ve risk birlikte hesaba katılır.',
      '70 ve üstü güçlü, 50–69 değerlendirilebilir, altı zayıf aday demektir. Karta dokunursanız puanın nereden geldiğini görürsünüz.',
    ],
  },
  {
    title: 'Pazar tipleri',
    lines: [
      'Yükselen fırsat: alımı hızla artan ülke. Büyük ama rekabetçi: çok alan ama çok satıcının olduğu ülke. Premium pazar: kilo başına yüksek fiyat ödeyen ülke. Fiyat pazarı: ucuz ürün arayan ülke.',
      'Türk ürünü güçlü: Türkiye zaten iyi satıyor. Küçük / niş pazar: az ama seçici alım. Riskli ya da ticaret engelli: ödeme, yaptırım veya yasak riski var.',
    ],
  },
  {
    title: 'Kazanılabilir pazar',
    lines: [
      'Türkiye\'nin benzer pazarlarda tuttuğu ortalama paya bu ülkede de ulaşırsanız, yılda ek olarak satılabilecek tahmini tutardır. Bu tutarın tamamı sizin olmaz; pazarın büyüklüğünü gösterir.',
    ],
  },
  {
    title: 'Kg fiyatı karşılaştırması',
    lines: [
      'Ülkenin bu ürünü Türkiye\'den, Çin\'den ve ortalamada kilosu kaça aldığını gösterir. Türk ürünü ortalamadan ucuzsa fiyatla, pahalıysa kaliteyle rekabet ediyorsunuz demektir.',
      'Kilo verisi bazı ülkelerde eksik ya da hatalı bildirilir; ekranda uyarı görürseniz bu rakama fazla güvenmeyin.',
    ],
  },
  {
    title: 'Veri nereden geliyor?',
    lines: [
      'Rakamlar Birleşmiş Milletler ticaret veritabanından (UN Comtrade) gelir; ülkelerin resmi gümrük bildirimleridir. Ülkeler veriyi 6–18 ay gecikmeyle yayımlar, bu yüzden en son yıl bir iki yıl öncesi olabilir.',
    ],
  },
  {
    title: 'Önemli',
    lines: ['Bu ekran yol gösterir; yatırım veya ticari tavsiye değildir. Karar vermeden önce alıcı, fiyat ve gümrük koşullarını ayrıca doğrulayın.'],
  },
];

function OverviewCard({ overview, pendingCount }: { overview: ExportMarketsOverview; pendingCount: number }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <Icon name="trophy-outline" color="brand" />
          <Text style={[t.type.title18, { color: t.colors.ink, flex: 1 }]}>{overview.top.length >= 3 ? tr('Sizin için en iyi 3 pazar') : overview.top.length === 1 ? tr('Sizin için en iyi pazar') : tr('Sizin için en iyi {n} pazar', { n: overview.top.length })}</Text>
        </View>
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{overview.headline}</Text>
        {overview.top.map((m, i) => (
          <View key={m.m49} style={{ flexDirection: 'row', gap: t.space[3] }}>
            <Text style={[t.type.title18, { color: t.colors.brand }]}>{i + 1}</Text>
            <View style={{ flex: 1, gap: t.space[1] }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space[2] }}>
                <Text style={[t.type.label14, { color: t.colors.ink }]}>{m.name}</Text>
                {m.score != null ? (
                  <Text style={[t.type.caption12, { color: t.colors[scoreColor(m.score)] }]}>{tr('{n} puan', { n: m.score })}</Text>
                ) : null}
                <Badge kind="new" label={m.typeLabel} />
              </View>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{m.reason}</Text>
            </View>
          </View>
        ))}
        {overview.top.length < 3 ? (<Text style={[t.type.caption12, { color: t.colors.ink2 }]}>{pendingCount > 0 ? tr('Diğer ülkelerin verisi geliyor ({n}); liste kendiliğinden güncellenecek.', { n: pendingCount }) : tr('Bu bölgede puanlanabilen başka ülke yok; üstten başka bir bölge seçerek karşılaştırabilirsiniz.')}</Text>) : null}
        {overview.winnableUsd >= 1e6 ? (
          <View
            style={{
              backgroundColor: t.colors.successSoft,
              borderRadius: t.radius.md,
              padding: t.space[3],
              gap: t.space[1],
            }}
          >
            <Text style={[t.type.caption12, { color: t.colors.ink2 }]}>{tr('TOPLAM KAZANILABİLİR PAZAR')}</Text>
            <Text style={[t.type.title18, { color: t.colors.success }]}>{tr('~{amount} / yıl', { amount: formatUsd(overview.winnableUsd) })}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function InsightBlock({ insight }: { insight: ExportMarketInsight }) {
  const t = useTheme();
  const section = (icon: 'bulb-outline' | 'pricetag-outline' | 'swap-horizontal-outline', title: string, text: string) => (
    <View style={{ gap: t.space[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <Icon name={icon} size={t.size.iconSm} color="brand" />
        <Text style={[t.type.label14, { color: t.colors.ink }]}>{title}</Text>
      </View>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>
    </View>
  );
  const d = insight.displaceable;
  return (
    <View style={{ gap: t.space[4] }}>
      <View style={{ gap: t.space[2] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          <Badge kind="new" label={insight.typeLabel} />
          <Badge kind={VERDICT_KIND[insight.verdict]} label={insight.verdictLabel} />
        </View>
        <Text style={[t.type.body14, { color: t.colors.ink }]}>{insight.summary}</Text>
        {insight.winnableUsd ? (
          <Text style={[t.type.label14, { color: t.colors.success }]}>
            {tr('Kazanılabilir pazar: ~{amount} / yıl', { amount: formatUsd(insight.winnableUsd) })}
          </Text>
        ) : null}
      </View>
      <View style={{ backgroundColor: t.colors.brandSoft, borderRadius: t.radius.md, padding: t.space[3] }}>
        {section('bulb-outline', tr('Önerilen hamle'), insight.action)}
      </View>
      {insight.pricePositionText ? section('pricetag-outline', tr('Fiyat konumunuz'), insight.pricePositionText) : null}
      {d
        ? section(
            'swap-horizontal-outline',
            tr('Yerini alabileceğiniz rakip'),
            tr('{name} (pazar payı {share}) Türk ürününden {gap} pahalı satıyor. Onun alıcılarına daha uygun fiyatla gidebilirsiniz.', { name: d.name, share: pct(d.sharePct), gap: pct(d.priceGapPct) })
          )
        : null}
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
        <Text accessibilityLabel={tr('Puan {n}', { n: row.score })} style={[t.type.display28, { color: t.colors[scoreColor(row.score)] }]}>
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
          <Badge kind="cancelled" label={tr('Ticaret askıda')} />
        </View>
        {country?.notes[0] ? line(country.notes[0]) : null}
      </View>
    );
  }

  const u = row.unitUsdKg;
  const kgParts = [
    u.turkey != null ? tr('Türkiye {v}', { v: kg(u.turkey) }) : null,
    u.china != null ? tr('Çin {v}', { v: kg(u.china) }) : null,
    u.world != null ? tr('ortalama {v}', { v: kg(u.world) }) : null,
  ].filter(Boolean);

  return (
    <Card onPress={onPress} accessibilityLabel={tr('{name}, ayrıntı', { name })} testID={`market-${row.country.m49}`}>
      <View style={{ gap: t.space[2] }}>
        {header}
        {row.insight ? (
          <View style={{ gap: t.space[2] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              <Badge kind="new" label={row.insight.typeLabel} />
              <Badge kind={VERDICT_KIND[row.insight.verdict]} label={row.insight.verdictLabel} />
            </View>
            <Text style={[t.type.body14, { color: t.colors.ink }]} numberOfLines={2}>
              {row.insight.summary}
            </Text>
            {row.insight.winnableUsd ? (
              <Text style={[t.type.label14, { color: t.colors.success }]}>
                {tr('Kazanılabilir pazar ~{amount}/yıl', { amount: formatUsd(row.insight.winnableUsd) })}
              </Text>
            ) : null}
          </View>
        ) : null}
        {noData ? (
          line(tr('Bu ülke bu kod için veri yayımlamamış.'))
        ) : (
          <>
            {line(row.year ? tr('İthalat {year}: {amount}', { year: row.year, amount: formatUsd(row.importUsd) }) : tr('İthalat: {amount}', { amount: formatUsd(row.importUsd) }))}
            {row.growthPct != null ? line(tr('Büyüme: {v}', { v: signedPct(row.growthPct) })) : null}
            {row.turkeySharePct != null
              ? line(row.turkeyRank ? tr('Türkiye payı: {v} ({rank}. tedarikçi)', { v: pct(row.turkeySharePct), rank: row.turkeyRank }) : tr('Türkiye payı: {v}', { v: pct(row.turkeySharePct) }))
              : null}
            {kgParts.length ? line(tr('Kg fiyatı: {v}', { v: kgParts.join(' · ') })) : null}
          </>
        )}
        {country ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            <Badge kind={country.access === 'mfn' ? 'info' : 'verified'} label={tr(ACCESS[country.access])} />
            <Badge
              kind={country.buyerData === 'acik' ? 'verified' : country.buyerData === 'dolayli' ? 'info' : 'pending'}
              label={tr(BUYER[country.buyerData])}
            />
            {country.risk ? <Badge kind="cancelled" label={tr(RISK[country.risk])} /> : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
