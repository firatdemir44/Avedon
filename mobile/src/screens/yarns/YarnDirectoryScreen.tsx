import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Switch, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, createWatchRule, searchYarns, type YarnSearchParams } from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { ChipSelect } from '../../components/ChipSelect';
import { MultiChipSelect } from '../../components/MultiChipSelect';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { SearchField } from '../../components/SearchField';
import { SectionHeader } from '../../components/SectionHeader';
import { StockValue } from '../../components/StockIndicator';
import { TextField } from '../../components/TextField';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { RfqSelectionBar } from '../../components/RfqSelectionBar';
import { useRfqSelection, type RfqSelectionItem } from '../../features/quotes/rfqSelection';
import { EmptyState, InlineError, friendlyMessage } from '../../components/StateView';
import { SkeletonList } from '../../components/Skeleton';
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
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

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

  const canSelect = !!onRfqSubmit && !!user;

  return (
    <View style={styles.screen}>
      {canSelect ? (
        <View style={styles.modeBar}>
          <Pressable
            onPress={() => {
              haptics.selection();
              if (selection.active) selection.cancel();
              else selection.start();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: selection.active }}
            accessibilityLabel={
              selection.active ? 'Teklif için seçmeyi bırak' : 'Teklif için iplik seç, birkaç firmaya birden sor'
            }
            style={({ pressed }) => [
              styles.modeButton,
              selection.active && styles.modeActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={selection.active ? 'close' : 'checkbox-outline'}
              size={18}
              color={selection.active ? colors.primaryText : colors.primary}
            />
            <Text style={[styles.modeText, selection.active && styles.modeTextActive]}>
              {selection.active ? 'Seçimi bırak' : 'Teklif için seç'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {selection.active ? (
        <Text style={styles.selectHint} accessibilityLiveRegion="polite">
          Teklif almak istediğiniz iplikleri işaretleyin; her firmaya tek istek gider.
        </Text>
      ) : null}
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.searchBar}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Kod, marka, çeşit, firma ara"
          accessibilityLabel="İplik ara"
        />
      </View>

      {/* Ana sorgu 1: iplik çeşidi (lif ailesi). */}
      <SectionHeader title="İplik çeşidi" />
      <View style={styles.block}>
        <MultiChipSelect options={options.families} values={families} onChange={setFamilies} />
      </View>

      {/* Ana sorgu 2 ve 3: numara + birim, filament sayısı. */}
      <SectionHeader title="Numara" />
      <View style={styles.block}>
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField
              label="Numara"
              value={count}
              onChangeText={setCount}
              placeholder="Örn. 30"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.half}>
            <TextField
              label="Filament sayısı"
              value={filaments}
              onChangeText={setFilaments}
              placeholder="Örn. 48"
              keyboardType="numeric"
            />
          </View>
        </View>
        <Text style={styles.label}>Birim</Text>
        <ChipSelect
          options={countUnitOptions}
          value={countUnit}
          onChange={(next) => {
            haptics.selection();
            setCountUnit(next);
          }}
          compact
        />
        <Text style={styles.hint}>
          Numara birimden bağımsız aranır: "150 denye" yazarsanız 167 dtex girilmiş iplikler de bulunur.
        </Text>
      </View>

      <CollapsibleSection title="Diğer süzgeçler" open={moreOpen} onToggle={() => setMoreOpen((v) => !v)}>
        <View style={styles.block}>
          {visible.staple ? (
            <>
              <Text style={styles.label}>Eğirme sistemi</Text>
              <MultiChipSelect options={options.spinnings} values={spinnings} onChange={setSpinnings} />
              <Text style={styles.label}>Penye / karde</Text>
              <ChipSelect
                options={[{ value: '', label: 'Fark etmez' }, ...optionValues(options.combings)]}
                value={combing}
                onChange={setCombing}
                compact
              />
            </>
          ) : null}
          {visible.filament ? (
            <>
              <Text style={styles.label}>Filament tipi</Text>
              <MultiChipSelect options={options.filamentTypes} values={filamentTypes} onChange={setFilamentTypes} />
              <Text style={styles.label}>Parlaklık</Text>
              <ChipSelect
                options={[{ value: '', label: 'Fark etmez' }, ...optionValues(options.lusters)]}
                value={luster}
                onChange={setLuster}
                compact
              />
            </>
          ) : null}
          <Text style={styles.label}>Kullanım yeri</Text>
          <MultiChipSelect options={options.endUses} values={endUses} onChange={setEndUses} />
          <Text style={styles.label}>Renk durumu</Text>
          <ChipSelect
            options={[{ value: '', label: 'Fark etmez' }, ...optionValues(options.colorStates)]}
            value={colorState}
            onChange={setColorState}
            compact
          />
          <Text style={styles.label}>Satıcı</Text>
          <ChipSelect
            options={[{ value: '', label: 'Fark etmez' }, ...optionValues(options.sellerRoles)]}
            value={sellerRole}
            onChange={setSellerRole}
            compact
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Yalnızca stokta olanlar</Text>
            <Switch
              value={inStock}
              onValueChange={(value) => {
                haptics.selection();
                setInStock(value);
              }}
              trackColor={{ true: colors.primary, false: colors.border }}
              accessibilityLabel="Yalnızca stoğu olan iplikler"
            />
          </View>
        </View>
      </CollapsibleSection>

      {hasFilter ? (
        <View style={styles.clearWrap}>
          {/* Faz 2, Adım 6: etkin süzgeci izlemeye alma kısayolu (kumaştaki
              "Bu aramayı izle" ile aynı kalıp ve mesajlar). */}
          {canWatch ? (
            <Pressable
              onPress={() => void watchCurrentSearch()}
              disabled={watchSaving}
              accessibilityRole="button"
              accessibilityLabel="Bu aramayı izle, uyan yeni iplik çıkınca haber ver"
              accessibilityState={{ disabled: watchSaving }}
              style={({ pressed }) => [styles.watchChip, pressed && styles.pressedFade]}
            >
              <Ionicons name="bookmark-outline" size={15} color={colors.primary} />
              <Text style={styles.watchChipText}>{watchSaving ? 'Kuruluyor...' : 'Bu aramayı izle'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={clearAll}
            accessibilityRole="button"
            accessibilityLabel="Tüm süzgeçleri temizle"
            style={({ pressed }) => [styles.clearLink, pressed && styles.pressedFade]}
          >
            <Text style={styles.clearText}>Süzgeçleri temizle</Text>
          </Pressable>
        </View>
      ) : null}

      {watchNote ? (
        <Text
          style={[styles.watchNote, watchNote.tone === 'error' && styles.watchNoteError]}
          accessibilityLiveRegion="polite"
        >
          {watchNote.text}
        </Text>
      ) : null}

      {numbersInvalid ? (
        <InlineError
          message="Numara ve filament alanlarına yalnızca rakam girin (ondalık için virgül)."
          style={styles.banner}
        />
      ) : null}
      {error ? <InlineError message={error} style={styles.banner} /> : null}

      {onAddYarn ? (
        <View style={styles.addWrap}>
          <PrimaryButton label="İplik ekle" variant="outline" icon="add" onPress={onAddYarn} />
        </View>
      ) : null}

      {loading && results.length === 0 ? (
        <SkeletonList variant="product" />
      ) : results.length === 0 ? (
        <View style={styles.block}>
          <EmptyState
            compact
            icon="git-commit-outline"
            title={hasFilter ? 'Eşleşen iplik yok' : 'Henüz iplik yok'}
            message={
              hasFilter
                ? 'Süzgeci gevşetip tekrar deneyin: numarayı ya da iplik çeşidini kaldırmak çoğu zaman yeter.'
                : 'İplik üreticileri ve tüccarlar iplik ekledikçe dizin burada dolacak.'
            }
            actionLabel={hasFilter ? 'Süzgeçleri temizle' : undefined}
            onAction={hasFilter ? clearAll : undefined}
          />
        </View>
      ) : (
        <>
          <SectionHeader title="İplikler" count={results.length} />
          <View style={styles.block}>
            {results.map((yarn, index) => {
              // Kendi firmanızın ipliği seçilemez (sunucu da dışlıyor).
              const selectable = selection.active && !!user && user.companyId !== yarn.companyId;
              return (
                <YarnRow
                  key={yarn.id}
                  product={yarn}
                  divider={index < results.length - 1}
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
          </View>
          {nextOffset !== null ? (
            <View style={styles.moreWrap}>
              <PrimaryButton
                label={loadingMore ? 'Yükleniyor...' : 'Daha fazla göster'}
                variant="outline"
                onPress={() => void loadMore()}
                disabled={loadingMore}
                accessibilityLabel="Daha fazla iplik göster"
              />
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
      {selection.active && onRfqSubmit ? (
        <RfqSelectionBar selection={selection} onSubmit={() => onRfqSubmit(selection.items)} />
      ) : null}
    </View>
  );
}

// Sonuç kartı: özet başlık, kod, firma (doğrulanmışsa işaret), stok kg,
// kullanım yeri etiketleri, renk durumu ve varsa kapak fotoğrafı.
function YarnRow({
  product,
  divider,
  endUseLabels,
  colorStateLabels,
  selectable = false,
  selected = false,
  onPress,
}: {
  product: Product;
  divider: boolean;
  endUseLabels: readonly { key: string; label: string }[];
  colorStateLabels: readonly { key: string; label: string }[];
  // Çoklu teklif seçme kipi (Faz 3, Adım 3): solda onay kutusu, seçiliyken
  // açık mavi zemin. Satırın içinde başka düğme yok, web'de sorun çıkmaz.
  selectable?: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  const yarn = product.yarn ?? null;
  const summary = yarnRowSummary(yarn, product.content);
  const endUses = (yarn?.endUses ?? []).map((key) => optionLabel(endUseLabels, key));
  const color = yarn?.colorState ? optionLabel(colorStateLabels, yarn.colorState) : '';
  const meta = [color, yarn?.brand, yarn?.origin].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: selected } : undefined}
      accessibilityLabel={`${product.code}, ${summary}${product.company ? `, ${product.company.name}` : ''}${
        selectable ? (selected ? ', seçili' : ', seçili değil') : '. İplik sayfasını aç'
      }`}
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [
        styles.yarnRow,
        divider && styles.divider,
        selectable && selected && styles.yarnRowSelected,
        pressed && styles.pressed,
      ]}
    >
      {selectable ? (
        <Ionicons
          name={selected ? 'checkbox' : 'square-outline'}
          size={22}
          color={selected ? colors.primary : colors.borderStrong}
        />
      ) : null}
      <ProductThumbnail productId={product.id} hasImage={product.hasImage} size={56} />
      <View style={styles.yarnBody}>
        <Text style={styles.yarnSummary} numberOfLines={2}>
          {summary}
        </Text>
        <View style={styles.codeRow}>
          <Text style={styles.code} numberOfLines={1}>
            {product.code}
          </Text>
          {product.company ? (
            <>
              <Text style={styles.company} numberOfLines={1}>
                {product.company.name}
              </Text>
              {product.company.verification === 'dogrulanmis' ? (
                <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
              ) : null}
            </>
          ) : null}
        </View>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {endUses.length ? (
          <View style={styles.tagRow}>
            {endUses.map((label) => (
              <View key={label} style={styles.tag}>
                <Text style={styles.tagText}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <StockValue stock={product.stock} unit={product.stockUnit} />
      </View>
      {selectable ? null : <Ionicons name="chevron-forward" size={18} color={colors.chevron} />}
    </Pressable>
  );
}

type Props = RootStackScreenProps<'YarnDirectory'>;

export function YarnDirectoryScreen({ navigation, route }: Props) {
  const { user } = useSession();
  return (
    <YarnDirectory
      preset={route.params?.preset}
      presetKey={route.params?.presetKey}
      onOpenProduct={(productId) => navigation.navigate('ProductDetail', { productId })}
      onAddYarn={user?.companyId ? () => navigation.navigate('YarnForm') : undefined}
      onRfqSubmit={(items) => navigation.navigate('RfqForm', { items })}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  searchBar: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm },
  block: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  label: { ...typography.label, fontFamily: fonts.semibold, color: colors.text, marginBottom: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, paddingBottom: spacing.md },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    paddingBottom: spacing.md,
  },
  switchLabel: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  clearWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  clearLink: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  clearText: { ...typography.label, fontFamily: fonts.semibold, color: colors.danger },
  watchChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: MIN_TOUCH },
  watchChipText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  watchNote: {
    ...typography.caption,
    color: colors.success,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 6,
    marginTop: spacing.sm,
  },
  watchNoteError: { color: colors.danger, backgroundColor: colors.dangerSoft },
  pressedFade: { opacity: 0.6 },
  banner: { marginHorizontal: spacing.gutter, marginTop: spacing.md },
  addWrap: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  moreWrap: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  yarnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: -spacing.gutter,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    minHeight: 72,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  yarnRowSelected: { backgroundColor: colors.accentSoft },
  pressed: { backgroundColor: colors.pressed },
  modeBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  modeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  modeTextActive: { color: colors.primaryText },
  selectHint: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  yarnBody: { flex: 1, minWidth: 0, gap: 2 },
  yarnSummary: { ...typography.bodyStrong, color: colors.text },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { ...typography.mono, fontFamily: fonts.monoSemibold, fontSize: 14, color: colors.primary, flexShrink: 0 },
  company: { ...typography.caption, fontFamily: fonts.medium, color: colors.accent, flexShrink: 1 },
  meta: { ...typography.caption, color: colors.textMuted },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingVertical: 2 },
  tag: { borderRadius: radius.sm, backgroundColor: colors.accentSoft, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, color: colors.primary },
});
