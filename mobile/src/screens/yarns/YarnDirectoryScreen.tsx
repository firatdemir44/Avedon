// İplik dizini — yeni tasarım (DESIGN.md §2/§3). Arama parametreleri,
// otomatik arama (300 ms), sayfalama, izleme kuralı ve teklif seçim kipi
// AYNEN korunur; yalnızca görünüm: SearchBox · SectionTitle + Chip/ChipRow ·
// ui/Input (birim sağda) · ProductCard sonuç listesi · yapışkan teklif şeridi.
// Ham hex / ham px yok: her değer useTheme() token'ı ya da src/ui bileşeni.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, createWatchRule, searchYarns, type YarnSearchParams } from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { useRfqSelection, type RfqSelectionItem } from '../../features/quotes/rfqSelection';
import { friendlyMessage } from '../../components/StateView';
import { formatStock } from '../../components/StockIndicator';
import { parseNumber } from '../../features/calculators/parse';
import { haptics } from '../../features/haptics';
import {
  optionLabel,
  optionValues,
  useYarnOptions,
  yarnFields,
  yarnRowSummary,
} from '../../features/yarns/catalog';
import { unsupportedYarnWatchLabels, yarnWatchQueryFromParams } from '../../features/yarns/watch';
import type { Product } from '../../types';
import { useTheme } from '../../theme/ThemeContext';
import {
  AppBar,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  Input,
  ProductCard,
  Screen,
  SearchBox,
  SectionTitle,
  SkeletonRow,
} from '../../ui';
import { ErrorBanner, RfqStickyBar, useProductImage } from '../products/FavoriteProductsScreen';

// İplik dizini (Faz 2, Adım 6). Fırat'ın kararı: ana sorgular NUMARA (denye),
// FİLAMENT SAYISI ve İPLİK ÇEŞİDİ (lif ailesi) — bu üçü en üstte ve en
// görünür; gerisi "Diğer süzgeçler" içinde. Aileye göre akıllı gösterim:
// kesikli elyafta eğirme + penye/karde, filamentte filament sayısı + tip +
// parlaklık öne çıkar.
//
// Ekran gövdesi ayrı bir bileşen (`YarnDirectory`): hem Ürünler sekmesindeki
// "İplik" görünümü hem de yığındaki "İplik Dizini" ekranı aynısını kullanıyor.

export interface YarnDirectoryPreset {
  count?: string;
  countUnit?: string;
  spinning?: string;
  combing?: string;
  filamentType?: string;
  family?: string;
  // İzleme kuralından geri dönülürken (Faz 2, Adım 6) çoklu seçimler ve kalan
  // süzgeçler de geri yüklenir; "Kim satıyor?" bağlantısı bunları göndermez.
  search?: string;
  families?: string[];
  filaments?: string;
  spinnings?: string[];
  filamentTypes?: string[];
  luster?: string;
  endUses?: string[];
  colorState?: string;
  sellerRole?: string;
}

const NUMBER_PATTERN = /^\d+([.,]\d+)?$/;

function readNumber(text: string): { value?: number; invalid: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { invalid: false };
  if (!NUMBER_PATTERN.test(trimmed)) return { invalid: true };
  return { value: parseNumber(trimmed), invalid: false };
}

const PAGE_SIZE = 20;

const numericProps = { inputMode: 'decimal', keyboardType: 'decimal-pad' } as const;

/** Tek seçimli çip satırı. */
function SingleChips({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <ChipRow>
      {options.map((o) => (
        <Chip
          key={o.value || '__any'}
          label={o.label}
          selected={o.value === value}
          onPress={() => {
            haptics.selection();
            onChange(o.value);
          }}
        />
      ))}
    </ChipRow>
  );
}

/** Çok seçimli çip satırı. */
function MultiChips({
  options,
  values,
  onChange,
}: {
  options: readonly { key: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <ChipRow>
      {options.map((o) => {
        const selected = values.includes(o.key);
        return (
          <Chip
            key={o.key}
            label={o.label}
            icon={selected ? 'check' : undefined}
            selected={selected}
            onPress={() => {
              haptics.selection();
              onChange(selected ? values.filter((v) => v !== o.key) : [...values, o.key]);
            }}
          />
        );
      })}
    </ChipRow>
  );
}

export function YarnDirectory({
  onOpenProduct,
  onAddYarn,
  onRfqSubmit,
  preset,
  presetKey,
}: {
  onOpenProduct: (productId: string) => void;
  // Firması olan kullanıcıda "İplik ekle"; yoksa verilmez.
  onAddYarn?: () => void;
  // Faz 3, Adım 3: çoklu teklif seçme kipi (ürün listesindekinin aynısı).
  // Verilmezse kip düğmesi hiç çıkmaz.
  onRfqSubmit?: (items: RfqSelectionItem[]) => void;
  // Kumaş pasaportundaki "Kim satıyor?" bağlantısından gelen ön dolgu.
  preset?: YarnDirectoryPreset;
  // Her açılışta değişir: aynı ön dolgu ikinci kez gelse de uygulanır.
  presetKey?: number;
}) {
  const t = useTheme();
  const options = useYarnOptions();
  const { user } = useSession();
  const selection = useRfqSelection();

  const [search, setSearch] = useState('');
  const [families, setFamilies] = useState<string[]>([]);
  const [count, setCount] = useState('');
  const [countUnit, setCountUnit] = useState('ne');
  const [filaments, setFilaments] = useState('');
  const [spinnings, setSpinnings] = useState<string[]>([]);
  const [combing, setCombing] = useState('');
  const [filamentTypes, setFilamentTypes] = useState<string[]>([]);
  const [luster, setLuster] = useState('');
  const [endUses, setEndUses] = useState<string[]>([]);
  const [colorState, setColorState] = useState('');
  const [sellerRole, setSellerRole] = useState('');
  const [inStock, setInStock] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const [watchNote, setWatchNote] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [watchSaving, setWatchSaving] = useState(false);

  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const lastParams = useRef<YarnSearchParams>({});

  const countValue = readNumber(count);
  const filamentValue = readNumber(filaments);
  const numbersInvalid = countValue.invalid || filamentValue.invalid;

  // Ön dolgu (kumaş pasaportundaki "Kim satıyor?").
  const appliedPreset = useRef<number | null>(null);
  useEffect(() => {
    if (!preset || presetKey == null || appliedPreset.current === presetKey) return;
    appliedPreset.current = presetKey;
    if (preset.search) setSearch(preset.search);
    if (preset.count) setCount(preset.count);
    if (preset.countUnit) setCountUnit(preset.countUnit);
    if (preset.filaments) setFilaments(preset.filaments);
    if (preset.families?.length) setFamilies(preset.families);
    else if (preset.family) setFamilies([preset.family]);
    if (preset.spinnings?.length) setSpinnings(preset.spinnings);
    else if (preset.spinning) setSpinnings([preset.spinning]);
    if (preset.combing) setCombing(preset.combing);
    if (preset.filamentTypes?.length) setFilamentTypes(preset.filamentTypes);
    else if (preset.filamentType) setFilamentTypes([preset.filamentType]);
    if (preset.luster) setLuster(preset.luster);
    if (preset.endUses?.length) setEndUses(preset.endUses);
    if (preset.colorState) setColorState(preset.colorState);
    if (preset.sellerRole) setSellerRole(preset.sellerRole);
    if (
      preset.spinning ||
      preset.spinnings?.length ||
      preset.combing ||
      preset.filamentType ||
      preset.filamentTypes?.length ||
      preset.luster ||
      preset.endUses?.length ||
      preset.colorState ||
      preset.sellerRole
    )
      setMoreOpen(true);
    // preset nesnesi her render'da yeni olabilir; anahtar yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);

  const params = useMemo<YarnSearchParams>(
    () => ({
      search,
      family: families,
      count: countValue.value,
      // Numara girilmemişse birim gönderilmez (boş aramada işe yaramaz).
      countUnit: countValue.value !== undefined ? countUnit : undefined,
      filaments: filamentValue.value,
      spinning: spinnings,
      combing: combing || undefined,
      filamentType: filamentTypes,
      luster: luster || undefined,
      endUse: endUses,
      colorState: colorState || undefined,
      sellerRole: sellerRole || undefined,
      inStock,
      limit: PAGE_SIZE,
    }),
    [
      search,
      families,
      countValue.value,
      countUnit,
      filamentValue.value,
      spinnings,
      combing,
      filamentTypes,
      luster,
      endUses,
      colorState,
      sellerRole,
      inStock,
    ]
  );

  const runSearch = useCallback(
    (next: YarnSearchParams, signal: { cancelled: boolean }) => {
      lastParams.current = next;
      setLoading(true);
      setError(null);
      setNextOffset(null);
      searchYarns(next)
        .then((page) => {
          if (signal.cancelled) return;
          setResults(page.yarns);
          setNextOffset(page.hasMore ? page.nextOffset : null);
        })
        .catch((err) => {
          if (signal.cancelled) return;
          setResults([]);
          setError(friendlyMessage(err, 'İplikler alınamadı, tekrar deneyin.'));
        })
        .finally(() => {
          if (!signal.cancelled) setLoading(false);
        });
    },
    []
  );

  // Süzgeç değişince kendiliğinden aranır (Ürünler ekranındaki desen); sayı
  // alanları geçersizken istek atılmaz.
  useEffect(() => {
    if (numbersInvalid) return;
    const signal = { cancelled: false };
    const timer = setTimeout(() => runSearch(params, signal), 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [params, numbersInvalid, runSearch]);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await searchYarns({ ...lastParams.current, offset: nextOffset });
      setResults((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.yarns.filter((y) => !seen.has(y.id))];
      });
      setNextOffset(page.hasMore ? page.nextOffset : null);
    } catch (err) {
      haptics.error();
      setError(friendlyMessage(err, 'Sonraki iplikler alınamadı, tekrar deneyin.'));
    } finally {
      setLoadingMore(false);
    }
  };

  // Etkin süzgeci (ve arama metnini) iplik izleme kuralına çevirir. Ad
  // verilmiyor: sunucu süzgeçten okunur bir ad üretiyor.
  const watchCurrentSearch = async () => {
    if (watchSaving) return;
    const watchQuery = yarnWatchQueryFromParams(params);
    if (!watchQuery) {
      setWatchNote({
        text: 'Bu süzgeç izlemeye çevrilemiyor. Numara, iplik çeşidi ya da başka bir süzgeç seçin.',
        tone: 'error',
      });
      return;
    }
    setWatchSaving(true);
    try {
      await createWatchRule({ query: watchQuery });
      haptics.success();
      const dropped = unsupportedYarnWatchLabels(params);
      setWatchNote({
        text: dropped.length ? `İzlemeye alındı (${dropped.join(', ')} izlemeye girmez).` : 'İzlemeye alındı.',
        tone: 'ok',
      });
    } catch (err) {
      haptics.error();
      setWatchNote({
        text:
          err instanceof ApiError && err.code === 'too_many_rules'
            ? 'İzleme sınırına ulaştınız. Profil > İzlediklerim listesinden birini silin.'
            : 'İzleme kurulamadı, tekrar deneyin.',
        tone: 'error',
      });
    } finally {
      setWatchSaving(false);
    }
  };

  const clearAll = () => {
    haptics.selection();
    setWatchNote(null);
    setSearch('');
    setFamilies([]);
    setCount('');
    setFilaments('');
    setSpinnings([]);
    setCombing('');
    setFilamentTypes([]);
    setLuster('');
    setEndUses([]);
    setColorState('');
    setSellerRole('');
    setInStock(false);
  };

  // Seçili ailelerin hangi alanları öne çıkardığı: hiç aile seçilmediyse
  // hepsi görünür, seçildiyse birleşim.
  const visible = useMemo(() => {
    if (!families.length) return { staple: true, filament: true, freeform: false };
    return families.map(yarnFields).reduce((acc, f) => ({
      staple: acc.staple || f.staple,
      filament: acc.filament || f.filament,
      freeform: acc.freeform || f.freeform,
    }));
  }, [families]);

  const hasFilter =
    !!search.trim() ||
    families.length > 0 ||
    !!count.trim() ||
    !!filaments.trim() ||
    spinnings.length > 0 ||
    !!combing ||
    filamentTypes.length > 0 ||
    !!luster ||
    endUses.length > 0 ||
    !!colorState ||
    !!sellerRole ||
    inStock;

  // İzlemeye çevrilebilir bir süzgeç var mı (yalnızca "stokta olanlar" yetmez).
  const canWatch = !numbersInvalid && yarnWatchQueryFromParams(params) !== null;

  const countUnitOptions = optionValues(options.countUnits);
  const anyOption = { value: '', label: 'Fark etmez' };

  const canSelect = !!onRfqSubmit && !!user;

  const subLabel = (text: string) => <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;
  const hint = (text: string) => <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>;
  const invalidText = 'Yalnızca rakam girin.';

  return (
    <Screen
      contentStyle={{ gap: t.space[4] }}
      sticky={
        selection.active && onRfqSubmit ? (
          <RfqStickyBar selection={selection} onSubmit={() => onRfqSubmit(selection.items)} />
        ) : undefined
      }
    >
      {canSelect || onAddYarn ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {canSelect ? (
            <Button
              kind="secondary"
              icon={selection.active ? 'x' : 'checkbox-outline'}
              label={selection.active ? 'Seçimi bırak' : 'Teklif için seç'}
              accessibilityLabel={
                selection.active ? 'Teklif için seçmeyi bırak' : 'Teklif için iplik seç, birkaç firmaya birden sor'
              }
              onPress={() => {
                haptics.selection();
                if (selection.active) selection.cancel();
                else selection.start();
              }}
            />
          ) : null}
          {onAddYarn ? <Button kind="secondary" icon="plus" label="İplik ekle" onPress={onAddYarn} /> : null}
        </View>
      ) : null}
      {selection.active ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]} accessibilityLiveRegion="polite">
          Teklif almak istediğiniz iplikleri işaretleyin; her firmaya tek istek gider.
        </Text>
      ) : null}

      <SearchBox
        value={search}
        onChangeText={setSearch}
        placeholder="Kod, marka, çeşit, firma ara"
        accessibilityLabel="İplik ara"
      />

      {/* Ana sorgu 1: iplik çeşidi (lif ailesi). */}
      <View style={{ gap: t.space[3] }}>
        <SectionTitle title="İplik çeşidi" />
        <MultiChips options={options.families} values={families} onChange={setFamilies} />
      </View>

      {/* Ana sorgu 2 ve 3: numara + birim, filament sayısı. */}
      <View style={{ gap: t.space[3] }}>
        <SectionTitle title="Numara" />
        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          <Input
            containerStyle={{ flex: 1, minWidth: 0 }}
            label="Numara"
            unit={optionLabel(options.countUnits, countUnit) || countUnit}
            value={count}
            onChangeText={setCount}
            placeholder="Örn. 30"
            error={countValue.invalid ? invalidText : null}
            {...numericProps}
          />
          <Input
            containerStyle={{ flex: 1, minWidth: 0 }}
            label="Filament sayısı"
            value={filaments}
            onChangeText={setFilaments}
            placeholder="Örn. 48"
            error={filamentValue.invalid ? invalidText : null}
            {...numericProps}
          />
        </View>
        {subLabel('Birim')}
        <SingleChips options={countUnitOptions} value={countUnit} onChange={setCountUnit} />
        {hint('Numara birimden bağımsız aranır: "150 denye" yazarsanız 167 dtex girilmiş iplikler de bulunur.')}
      </View>

      <View style={{ gap: t.space[3] }}>
        <SectionTitle
          title="Diğer süzgeçler"
          linkLabel={moreOpen ? 'Gizle' : 'Göster'}
          onLinkPress={() => {
            haptics.selection();
            setMoreOpen((v) => !v);
          }}
        />
        {moreOpen ? (
          <>
            {visible.staple ? (
              <>
                {subLabel('Eğirme sistemi')}
                <MultiChips options={options.spinnings} values={spinnings} onChange={setSpinnings} />
                {subLabel('Penye / karde')}
                <SingleChips options={[anyOption, ...optionValues(options.combings)]} value={combing} onChange={setCombing} />
              </>
            ) : null}
            {visible.filament ? (
              <>
                {subLabel('Filament tipi')}
                <MultiChips options={options.filamentTypes} values={filamentTypes} onChange={setFilamentTypes} />
                {subLabel('Parlaklık')}
                <SingleChips options={[anyOption, ...optionValues(options.lusters)]} value={luster} onChange={setLuster} />
              </>
            ) : null}
            {subLabel('Kullanım yeri')}
            <MultiChips options={options.endUses} values={endUses} onChange={setEndUses} />
            {subLabel('Renk durumu')}
            <SingleChips
              options={[anyOption, ...optionValues(options.colorStates)]}
              value={colorState}
              onChange={setColorState}
            />
            {subLabel('Satıcı')}
            <SingleChips
              options={[anyOption, ...optionValues(options.sellerRoles)]}
              value={sellerRole}
              onChange={setSellerRole}
            />
            {subLabel('Stok')}
            <ChipRow>
              <Chip
                label="Yalnızca stokta olanlar"
                icon={inStock ? 'check' : undefined}
                selected={inStock}
                onPress={() => {
                  haptics.selection();
                  setInStock((v) => !v);
                }}
              />
            </ChipRow>
          </>
        ) : null}
      </View>

      {hasFilter ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {/* Faz 2, Adım 6: etkin süzgeci izlemeye alma kısayolu (kumaştaki
              "Bu aramayı izle" ile aynı kalıp ve mesajlar). */}
          {canWatch ? (
            <Button
              kind="secondary"
              icon="bookmark-outline"
              label="Bu aramayı izle"
              loading={watchSaving}
              accessibilityLabel="Bu aramayı izle, uyan yeni iplik çıkınca haber ver"
              onPress={() => void watchCurrentSearch()}
            />
          ) : null}
          <Button kind="quiet" label="Süzgeçleri temizle" accessibilityLabel="Tüm süzgeçleri temizle" onPress={clearAll} />
        </View>
      ) : null}

      {watchNote ? (
        watchNote.tone === 'error' ? (
          <ErrorBanner message={watchNote.text} />
        ) : (
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              padding: t.space[3],
              borderRadius: t.radius.md,
              backgroundColor: t.colors.successSoft,
            }}
          >
            <Icon name="check" size={t.size.iconSm} color="success" />
            <Text style={[t.type.body14, { color: t.colors.success, flex: 1, minWidth: 0 }]}>{watchNote.text}</Text>
          </View>
        )
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}

      {loading && results.length === 0 ? (
        <View style={{ gap: t.space[3] }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : results.length === 0 ? (
        <EmptyState
          icon="yarn"
          title={hasFilter ? 'Eşleşen iplik yok' : 'Henüz iplik yok'}
          description={
            hasFilter
              ? 'Süzgeci gevşetip tekrar deneyin: numarayı ya da iplik çeşidini kaldırmak çoğu zaman yeter.'
              : 'İplik üreticileri ve tüccarlar iplik ekledikçe dizin burada dolacak.'
          }
          actionLabel={hasFilter ? 'Süzgeçleri temizle' : undefined}
          onAction={hasFilter ? clearAll : undefined}
        />
      ) : (
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={`İplikler · ${results.length}`} />
          {results.map((yarn) => {
            // Kendi firmanızın ipliği seçilemez (sunucu da dışlıyor).
            const selectable = selection.active && !!user && user.companyId !== yarn.companyId;
            return (
              <YarnCard
                key={yarn.id}
                product={yarn}
                endUseLabels={options.endUses}
                colorStateLabels={options.colorStates}
                selectable={selectable}
                selected={selection.selectedIds.has(yarn.id)}
                onPress={() => {
                  if (!selectable) {
                    onOpenProduct(yarn.id);
                    return;
                  }
                  haptics.selection();
                  selection.toggle({
                    id: yarn.id,
                    code: yarn.code,
                    companyId: yarn.companyId,
                    companyName: yarn.company?.name ?? 'Firma',
                    // İplikte birim kg.
                    stockUnit: 'kg',
                    type: yarn.type,
                  });
                }}
              />
            );
          })}
          {nextOffset !== null ? (
            <Button
              kind="secondary"
              fullWidth
              label="Daha fazla göster"
              loading={loadingMore}
              onPress={() => void loadMore()}
              accessibilityLabel="Daha fazla iplik göster"
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

// Sonuç kartı: özet başlık, kod, özellik satırı (renk durumu · marka · menşe ·
// kullanım yerleri · stok), firma (doğrulanmışsa rozet) ve varsa kapak fotoğrafı.
function YarnCard({
  product,
  endUseLabels,
  colorStateLabels,
  selectable = false,
  selected = false,
  onPress,
}: {
  product: Product;
  endUseLabels: readonly { key: string; label: string }[];
  colorStateLabels: readonly { key: string; label: string }[];
  // Çoklu teklif seçme kipi (Faz 3, Adım 3): seçiliyken brand çerçeve + brandSoft
  // zemin. Kartın içinde başka düğme yok, web'de sorun çıkmaz.
  selectable?: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const imageUri = useProductImage(product.id, product.hasImage);
  const yarn = product.yarn ?? null;
  const summary = yarnRowSummary(yarn, product.content);
  const endUses = (yarn?.endUses ?? []).map((key) => optionLabel(endUseLabels, key));
  const color = yarn?.colorState ? optionLabel(colorStateLabels, yarn.colorState) : '';
  const specs = [color, yarn?.brand, yarn?.origin, endUses.join(', '), formatStock(product.stock, product.stockUnit)]
    .filter(Boolean)
    .join(' · ');

  const card = (
    <ProductCard
      name={summary}
      code={product.code}
      specs={specs}
      companyName={product.company?.name}
      companyVerified={product.company?.verification === 'dogrulanmis'}
      imageUri={imageUri}
      onPress={onPress}
      style={selectable && selected ? { borderColor: t.colors.brand, backgroundColor: t.colors.brandSoft } : undefined}
    />
  );

  if (!selectable) return card;
  return (
    <View accessibilityState={{ checked: selected }} style={{ minWidth: 0 }}>
      {card}
    </View>
  );
}

type Props = RootStackScreenProps<'YarnDirectory'>;

export function YarnDirectoryScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { user } = useSession();

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="İplik dizini" leading="back" onBack={() => navigation.goBack()} />
      <YarnDirectory
        preset={route.params?.preset}
        presetKey={route.params?.presetKey}
        onOpenProduct={(productId) => navigation.navigate('ProductDetail', { productId })}
        onAddYarn={user?.companyId ? () => navigation.navigate('YarnForm') : undefined}
        onRfqSubmit={(items) => navigation.navigate('RfqForm', { items })}
      />
    </View>
  );
}
