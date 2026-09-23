// Genel arama (yeni tasarım, 4. adım — DESIGN.md §2, §3).
//
// Veri katmanı DEĞİŞMEDİ: aynı `globalSearch` ucu, aynı gecikme (debounce),
// aynı "son aramalar" deposu ve aynı navigasyon hedefleri. Yalnızca görünüm
// yeni: arama kutusu banda gömülmez (`ui/SearchBox`, `main` içinde 48px ayrı
// alan), sonuç türleri `ui/SegmentControl`, firmalar `ui/ListRow`, ürünler
// `ui/ProductCard`, ilk/boş durum `ui/EmptyState`.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootStackScreenProps } from '../../navigation/types';
import { globalSearch, type GlobalSearchCompany, type GlobalSearchMachine, type GlobalSearchResult } from '../../api/client';
import { AvailabilityIndicator } from '../../components/MachineCard';
import { machineCardTitle, machineSpecRows } from '../../features/machines/catalog';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { friendlyMessage } from '../../components/StateView';
import { categoryLabel, companyTypeLabel, isYarnType } from '../../features/products/catalog';
import { formatComposition } from '../../features/products/glossaryLabels';
import { formatMeasure } from '../../features/calculators/parse';
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import type { Product } from '../../types';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  ListRow,
  ProductCard,
  Screen,
  SearchBox,
  SectionTitle,
  SegmentControl,
  Skeleton,
} from '../../ui';

type Props = RootStackScreenProps<'GlobalSearch'>;

// Üst başlıktaki "Arama Yap" kutusunun açtığı ekran (Fırat 2026-09-21).
// Tek kutudan firma, kumaş ve iplik: GET /api/search (en az 2 karakter,
// oturumsuz da çalışır). Her grup en çok 5 sonuç; `hasMore` varsa grubun
// altında "Tümünü gör" ilgili listeyi aynı arama metniyle açar.
const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;
const RECENT_KEY = 'avedon.recentSearches';
const MAX_RECENT = 5;

// Sonuç türü süzgeci yalnızca GÖRÜNÜMDE çalışır: istek yine tek sefer atılır,
// gelen üç grup burada gizlenir/gösterilir (fazladan ağ trafiği yok).
type Kind = 'all' | 'companies' | 'fabrics' | 'yarns' | 'machines';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'companies', label: 'Firma' },
  { value: 'fabrics', label: 'Kumaş' },
  { value: 'yarns', label: 'İplik' },
  { value: 'machines', label: 'Makine' },
];

// Kart özellik satırı: "165 gr/m² · 160 cm · %94 PES %6 EA" (DESIGN.md §3).
// İplikte gramaj/en 0'dır, onun yerine ipliğin kendi özeti yazılır.
function specsOf(product: Product): string {
  if (isYarnType(product.type)) return product.yarn?.summary || product.content;
  const composition = product.composition ?? [];
  const content = composition.length ? formatComposition(composition) : product.content;
  return [`${formatMeasure(product.weightGsm)} gr/m²`, `${formatMeasure(product.widthCm)} cm`, content]
    .filter(Boolean)
    .join(' · ');
}

// Kapak fotoğrafı arama yanıtında gelmiyor; önbellekten / tek tek çekilir
// (ProductListScreen'deki kalıbın aynısı).
function useProductImage(productId: string, hasImage: boolean) {
  const [uri, setUri] = useState<string | null>(() => getCachedProductImage(productId) ?? null);
  useEffect(() => {
    if (!hasImage) return;
    const cached = getCachedProductImage(productId);
    if (cached) {
      setUri(cached);
      return;
    }
    let cancelled = false;
    loadProductImage(productId)
      .then((url) => {
        if (!cancelled) setUri(url);
      })
      .catch(() => {
        // Fotoğraf gelmezse kart yer tutucuyla çalışır.
      });
    return () => {
      cancelled = true;
    };
  }, [productId, hasImage]);
  return uri;
}

export function GlobalSearchScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>('all');
  // Eski yanıt yeni sonucu ezmesin: yalnızca en son isteğin yanıtı yazılır.
  const requestIdRef = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecent(parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT));
      })
      .catch(() => {});
  }, []);

  const run = useCallback((q: string) => {
    const trimmed = q.trim();
    const id = ++requestIdRef.current;
    if (trimmed.length < MIN_QUERY) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    globalSearch(trimmed)
      .then((data) => {
        if (requestIdRef.current !== id) return;
        setResult(data);
        setError(null);
      })
      .catch((err) => {
        if (requestIdRef.current !== id) return;
        setResult(null);
        setError(friendlyMessage(err, 'Arama yapılamadı'));
      })
      .finally(() => {
        if (requestIdRef.current !== id) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => run(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  const rememberQuery = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY) return;
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  };

  // Bir sonuca gidilince arama metni son aramalara eklenir.
  const go = (navigate: () => void) => {
    rememberQuery(query);
    navigate();
  };

  const trimmed = query.trim();
  const hasResults =
    !!result && (result.companies.items.length > 0 || result.fabrics.items.length > 0 || result.yarns.items.length > 0 || (result.machines?.items.length ?? 0) > 0);

  // Segmentte hangi türlerin çizileceği.
  const show = useMemo(
    () => ({
      companies: kind === 'all' || kind === 'companies',
      fabrics: kind === 'all' || kind === 'fabrics',
      yarns: kind === 'all' || kind === 'yarns',
      machines: kind === 'all' || kind === 'machines',
    }),
    [kind]
  );

  // Seçili türde hiç sonuç yoksa "bu türde sonuç yok" durumu gösterilir.
  const visibleCount =
    (show.companies ? result?.companies.items.length ?? 0 : 0) +
    (show.fabrics ? result?.fabrics.items.length ?? 0 : 0) +
    (show.yarns ? result?.yarns.items.length ?? 0 : 0) +
    (show.machines ? result?.machines?.items.length ?? 0 : 0);

  return (
    <Screen scroll={false} noPadding>
      {/* Arama kutusu banda gömülmez: `main` içinde 48px ayrı alan (DESIGN.md §2). */}
      <View style={{ paddingHorizontal: t.space[4], gap: t.space[3] }}>
        <SearchBox
          value={query}
          onChangeText={setQuery}
          placeholder="Firma, kumaş ya da iplik ara"
          accessibilityLabel="Firma, kumaş ya da iplik ara"
          autoFocus
          onSubmitEditing={() => run(query)}
        />
        {trimmed.length >= MIN_QUERY ? (
          <SegmentControl<Kind>
            stretch
            accessibilityLabel="Sonuç türü"
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
          />
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: bottomPad, gap: t.space[6] }}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={{ paddingHorizontal: t.space[4], gap: t.space[3] }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                padding: t.space[3],
                borderRadius: t.radius.md,
                backgroundColor: t.colors.dangerSoft,
              }}
            >
              <Icon name="warning" size={t.size.iconSm} color="danger" />
              <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{error}</Text>
            </View>
            <Button kind="secondary" label="Tekrar dene" onPress={() => run(query)} />
          </View>
        ) : null}

        {trimmed.length < MIN_QUERY ? (
          <View style={{ paddingHorizontal: t.space[4], gap: t.space[4] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              Firma adı, kumaş kodu, çeşit, iplik ya da makine yazın. Örn. süprem, 30/1, Bursa, raschel 28 fine
            </Text>
            {recent.length ? (
              <View style={{ gap: t.space[2] }}>
                <SectionTitle title="Son aramalar" linkLabel="Temizle" onLinkPress={clearRecent} />
                {/* Çipler yatay kaydırılır, satır kırmaz (DESIGN.md §3). */}
                <ChipRow>
                  {recent.map((item) => (
                    <Chip key={item} icon="clock" label={item} onPress={() => setQuery(item)} />
                  ))}
                </ChipRow>
              </View>
            ) : null}
          </View>
        ) : loading && !result ? (
          <View style={{ paddingHorizontal: t.space[4], gap: t.space[3] }}>
            <Skeleton height={t.size.row} />
            <Skeleton height={t.size.row} />
            <Skeleton height={t.size.row} />
          </View>
        ) : hasResults && result ? (
          visibleCount === 0 ? (
            <EmptyState
              icon="search"
              title="Bu türde sonuç yok"
              description="Başka bir sonuç türü seçin ya da aramayı değiştirin."
              actionLabel="Tüm sonuçlar"
              onAction={() => setKind('all')}
            />
          ) : (
            <>
              {show.companies && result.companies.items.length ? (
                <View style={{ gap: t.space[2] }}>
                  <View style={{ paddingHorizontal: t.space[4] }}>
                    <SectionTitle title="Firmalar" />
                  </View>
                  <View>
                    {result.companies.items.map((company, index) => (
                      <CompanyResultRow
                        key={company.id}
                        company={company}
                        divider={index < result.companies.items.length - 1}
                        onPress={() => go(() => navigation.navigate('CompanyProfile', { companyId: company.id }))}
                      />
                    ))}
                  </View>
                  {/* Firmada "Tümünü gör" yok: firma listesi ekranı henüz yok. */}
                </View>
              ) : null}

              {show.fabrics && result.fabrics.items.length ? (
                <View style={{ gap: t.space[3] }}>
                  <View style={{ paddingHorizontal: t.space[4] }}>
                    <SectionTitle
                      title="Kumaşlar"
                      linkLabel={result.fabrics.hasMore ? 'Tümünü gör' : undefined}
                      onLinkPress={
                        result.fabrics.hasMore
                          ? () =>
                              go(() =>
                                navigation.navigate('MainTabs', {
                                  screen: 'ProductList',
                                  params: { initialSearch: trimmed, searchKey: Date.now() },
                                })
                              )
                          : undefined
                      }
                    />
                  </View>
                  {result.fabrics.items.map((product) => (
                    <ProductResultCard
                      key={product.id}
                      product={product}
                      onPress={() => go(() => navigation.navigate('ProductDetail', { productId: product.id }))}
                    />
                  ))}
                </View>
              ) : null}

              {show.machines && result.machines?.items.length ? (
                <View style={{ gap: t.space[2] }}>
                  <View style={{ paddingHorizontal: t.space[4] }}>
                    <SectionTitle title="Fason makine" />
                  </View>
                  <View>
                    {result.machines.items.map((machine, index) => (
                      <MachineResultRow
                        key={machine.id}
                        machine={machine}
                        divider={index < result.machines!.items.length - 1}
                        onPress={() =>
                          go(() =>
                            navigation.navigate('CompanyProfile', { companyId: machine.company.id, initialTab: 'machines' })
                          )
                        }
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {show.yarns && result.yarns.items.length ? (
                <View style={{ gap: t.space[3] }}>
                  <View style={{ paddingHorizontal: t.space[4] }}>
                    <SectionTitle
                      title="İplikler"
                      linkLabel={result.yarns.hasMore ? 'Tümünü gör' : undefined}
                      onLinkPress={
                        result.yarns.hasMore
                          ? () =>
                              go(() =>
                                navigation.navigate('YarnDirectory', {
                                  preset: { search: trimmed },
                                  presetKey: Date.now(),
                                })
                              )
                          : undefined
                      }
                    />
                  </View>
                  {result.yarns.items.map((product) => (
                    <ProductResultCard
                      key={product.id}
                      product={product}
                      onPress={() => go(() => navigation.navigate('ProductDetail', { productId: product.id }))}
                    />
                  ))}
                </View>
              ) : null}
            </>
          )
        ) : error ? null : (
          <EmptyState
            icon="search"
            title="Sonuç bulunamadı"
            description={`“${trimmed}” için sonuç bulunamadı. Fotoğrafla benzer kumaş arayabilirsiniz.`}
            actionLabel="Fotoğrafla kumaş ara"
            onAction={() => navigation.navigate('SimilarSearch')}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

// Ürün sonucu: kapak fotoğrafı hook'u kart başına çalıştığı için ayrı bileşen
// (hook koşullu çağrılamaz).
function ProductResultCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const t = useTheme();
  const imageUri = useProductImage(product.id, product.hasImage);
  return (
    <ProductCard
      name={categoryLabel(product.type, product.subtype ?? '')}
      code={product.code}
      specs={specsOf(product)}
      companyName={product.company?.name}
      companyVerified={product.company?.verification === 'dogrulanmis'}
      imageUri={imageUri}
      onPress={onPress}
      style={{ marginHorizontal: t.space[4] }}
    />
  );
}

function CompanyResultRow({
  company,
  divider,
  onPress,
}: {
  company: GlobalSearchCompany;
  divider: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const meta = [company.city, companyTypeLabel(company.companyType), `${company.productCount} ürün`]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      title={company.name}
      subtitle={meta || undefined}
      // Firma logosu gerçek görselden gelir; ListRow'un harf avatarı yerine
      // hazır `CompanyAvatar` (zaten token'a bağlı) kullanılır.
      left={
        <CompanyAvatar
          name={company.name}
          verification={company.verification}
          companyId={company.id}
          logoUpdatedAt={company.logoUpdatedAt}
          size={t.size.avatar}
        />
      }
      divider={divider}
      onPress={onPress}
      style={{ paddingHorizontal: t.space[4] }}
    />
  );
}

// Fason makine sonucu: başlık (tür + marka/model), firma adı ve ölçüler solda;
// müsaitlik durumu sağda sabit genişlikte. Dokununca firmanın Makineler sekmesi.
function MachineResultRow({
  machine,
  divider,
  onPress,
}: {
  machine: GlobalSearchMachine;
  divider: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const { title } = machineCardTitle(machine);
  // Alt satır: "Örnek Tekstil · 28 fine · 30 inç · 4 adet"
  const unitOf: Record<string, string> = { Fine: ' fine', Sistem: ' sistem', İğne: ' iğne', Adet: ' adet' };
  const specs = machineSpecRows(machine)
    .map((row) => row.value + (unitOf[row.label] ?? ''))
    .join(' · ');
  return (
    <ListRow
      title={title}
      subtitle={[machine.company.name, specs].filter(Boolean).join(' · ')}
      left={
        <CompanyAvatar
          name={machine.company.name}
          verification={machine.company.verification}
          companyId={machine.company.id}
          logoUpdatedAt={machine.company.logoUpdatedAt}
          size={t.size.avatar}
        />
      }
      right={<AvailabilityIndicator machine={machine} />}
      divider={divider}
      onPress={onPress}
      style={{ paddingHorizontal: t.space[4] }}
    />
  );
}
