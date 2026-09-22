// Süzgeç ekranı — yeni tasarım (DESIGN.md §2/§3). Süzgeç parametreleri,
// doğrulama, "Uygula" (ProductList'e geri) ve izleme kipi (createWatchRule)
// AYNEN korunur; yalnızca görünüm: SectionTitle + Chip/ChipRow, ui/Input
// (birim sağda), yapışkan alt çubukta tek dolu "Uygula" + kenarlıklı "Temizle".
// Ham hex / ham px yok: her değer useTheme() token'ı ya da src/ui bileşeni.
import React, { useLayoutEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ApiError, createWatchRule } from '../../api/client';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  PRODUCT_TYPES,
  STOCK_UNIT_LABELS,
  SUBTYPES,
  TYPE_LABELS,
  USAGES,
  type ProductType,
  type StockUnit,
} from '../../features/products/catalog';
import {
  CERTIFICATES,
  FIBERS,
  WIDTH_TYPE_LABELS,
  WIDTH_TYPES,
  type WidthType,
} from '../../features/products/glossaryLabels';
import { watchQueryFromFilters, type ProductFilters } from '../../features/products/filters';
import { toInputNumber } from '../../features/calculators/parse';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Button, Chip, ChipRow, Input, Screen, SectionTitle } from '../../ui';
import { ErrorBanner } from './FavoriteProductsScreen';

type Props = RootStackScreenProps<'ProductFilters'>;

const TYPE_OPTIONS: { value: ProductType | ''; label: string }[] = [
  { value: '', label: 'Tümü' },
  ...PRODUCT_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] })),
];
const UNIT_OPTIONS: { value: StockUnit | ''; label: string }[] = [
  { value: '', label: 'Hepsi' },
  { value: 'm', label: 'Metre' },
  { value: 'kg', label: 'Kilogram' },
];
const WIDTH_TYPE_OPTIONS: { value: WidthType | ''; label: string }[] = [
  { value: '', label: 'Hepsi' },
  ...WIDTH_TYPES.map((value) => ({ value, label: WIDTH_TYPE_LABELS[value] })),
];

// parseNumber geçersiz metni 0 sayıyor; filtrede "abc" sessizce 0 olmasın.
const NUMBER_PATTERN = /^\d+([.,]\d+)?$/;

function readNumber(text: string): { value?: number; invalid: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { invalid: false };
  if (!NUMBER_PATTERN.test(trimmed)) return { invalid: true };
  return { value: Number(trimmed.replace(',', '.')), invalid: false };
}

const toText = (value?: number) => (value === undefined ? '' : toInputNumber(value));

// Sayısal alan: ondalık klavye + birim sağda (DESIGN.md §3 giriş alanı).
const numericProps = { inputMode: 'decimal', keyboardType: 'decimal-pad' } as const;

/** Tek seçimli çip satırı ("Tümü" seçeneği listede). */
function SingleChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <ChipRow>
      {options.map((o) => (
        <Chip
          key={o.value || '__all'}
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

/** Çok seçimli çip satırı (seçilenler işaretli). */
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

// Orijinal tasarımdaki "Filtreleme Seçenekleri": çeşit, alt çeşit, kullanım
// amacı, stok, gramaj, en, içerik. "Uygula" filtreleri Ürünler sekmesine geri
// gönderir; ürün kodu ve firma araması Ürünler'deki arama çubuğunda.
export function ProductFiltersScreen({ navigation, route }: Props) {
  const t = useTheme();
  const initial = route.params.filters;
  // İzleme kipi (Faz 2, Adım 1): aynı ekran, farklı çıkış. Sunucudaki izleme
  // süzgeci ürün süzgecinin alt kümesi olduğu için desteklenmeyen bölümler
  // (Stok, İçerik, En tipi) bu kipte hiç gösterilmiyor: sessizce düşmesin.
  const watchMode = route.params.mode === 'watch';
  const [saving, setSaving] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [type, setType] = useState<ProductType | ''>(initial.type ?? '');
  const [subtype, setSubtype] = useState(initial.subtype ?? '');
  const [usages, setUsages] = useState<string[]>(initial.usages);
  const [stockUnit, setStockUnit] = useState<StockUnit | ''>(initial.stockUnit ?? '');
  const [stockMin, setStockMin] = useState(toText(initial.stockMin));
  const [gsmMin, setGsmMin] = useState(toText(initial.gsmMin));
  const [gsmMax, setGsmMax] = useState(toText(initial.gsmMax));
  const [widthMin, setWidthMin] = useState(toText(initial.widthMin));
  const [widthMax, setWidthMax] = useState(toText(initial.widthMax));
  const [content, setContent] = useState(initial.content ?? '');
  const [fibers, setFibers] = useState<string[]>(initial.fibers ?? []);
  const [fiberMinPercent, setFiberMinPercent] = useState(toText(initial.fiberMinPercent));
  const [certificates, setCertificates] = useState<string[]>(initial.certificates ?? []);
  const [moqMax, setMoqMax] = useState(toText(initial.moqMax));
  const [leadTimeMax, setLeadTimeMax] = useState(toText(initial.leadTimeMax));
  const [widthType, setWidthType] = useState<WidthType | ''>(initial.widthType ?? '');

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const stock = readNumber(stockMin);
  const gsmLow = readNumber(gsmMin);
  const gsmHigh = readNumber(gsmMax);
  const widthLow = readNumber(widthMin);
  const widthHigh = readNumber(widthMax);
  const fiberPercent = readNumber(fiberMinPercent);
  const moq = readNumber(moqMax);
  const leadTime = readNumber(leadTimeMax);

  const errors: string[] = [];
  if ([stock, gsmLow, gsmHigh, widthLow, widthHigh, fiberPercent, moq, leadTime].some((n) => n.invalid)) {
    errors.push('Sayı alanlarına yalnızca rakam girin (ondalık için virgül).');
  }
  if (fiberPercent.value !== undefined && fiberPercent.value > 100) {
    errors.push('Lif oranı en fazla 100 olabilir.');
  }
  if (gsmLow.value !== undefined && gsmHigh.value !== undefined && gsmLow.value > gsmHigh.value) {
    errors.push('Gramajda en az değer en çok değerden büyük olamaz.');
  }
  if (widthLow.value !== undefined && widthHigh.value !== undefined && widthLow.value > widthHigh.value) {
    errors.push('Ende en az değer en çok değerden büyük olamaz.');
  }

  // Alan altı hata metinleri (aynı kurallar, alanın altında da görünsün).
  const invalidText = 'Yalnızca rakam girin.';
  const gsmRangeText = gsmLow.value !== undefined && gsmHigh.value !== undefined && gsmLow.value > gsmHigh.value
    ? 'En az, en çoktan büyük olamaz.'
    : null;
  const widthRangeText =
    widthLow.value !== undefined && widthHigh.value !== undefined && widthLow.value > widthHigh.value
      ? 'En az, en çoktan büyük olamaz.'
      : null;

  const changeType = (next: ProductType | '') => {
    setType(next);
    setSubtype('');
  };

  const clearAll = () => {
    haptics.selection();
    setType('');
    setSubtype('');
    setUsages([]);
    setStockUnit('');
    setStockMin('');
    setGsmMin('');
    setGsmMax('');
    setWidthMin('');
    setWidthMax('');
    setContent('');
    setFibers([]);
    setFiberMinPercent('');
    setCertificates([]);
    setMoqMax('');
    setLeadTimeMax('');
    setWidthType('');
  };

  const collect = (): ProductFilters => {
    const filters: ProductFilters = {
      type: type || undefined,
      subtype: type && subtype ? subtype : undefined,
      usages,
      stockUnit: stockUnit || undefined,
      stockMin: stock.value,
      gsmMin: gsmLow.value,
      gsmMax: gsmHigh.value,
      widthMin: widthLow.value,
      widthMax: widthHigh.value,
      content: content.trim() || undefined,
      fibers,
      // Oran yalnızca lif seçiliyken sunucuya gidiyor (tek başına anlamsız).
      fiberMinPercent: fibers.length ? fiberPercent.value : undefined,
      certificates,
      moqMax: moq.value,
      leadTimeMax: leadTime.value,
      widthType: widthType || undefined,
    };
    return filters;
  };

  const apply = () => {
    if (errors.length) {
      haptics.error();
      return;
    }
    haptics.selection();
    navigation.navigate('MainTabs', { screen: 'ProductList', params: { filters: collect(), appliedAt: Date.now() } });
  };

  const saveWatch = async () => {
    if (errors.length || saving) {
      haptics.error();
      return;
    }
    const query = watchQueryFromFilters('', collect());
    if (!query) {
      haptics.error();
      setWatchError('İzleme kurmak için en az bir süzgeç seçin.');
      return;
    }
    setSaving(true);
    setWatchError(null);
    try {
      // Ad verilmiyor: sunucu süzgeçten okunur bir ad üretiyor (describeWatchQuery).
      await createWatchRule({ query });
      haptics.success();
      navigation.popTo('WatchRules');
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.code === 'too_many_rules') {
        setWatchError('İzleme sınırına ulaştınız. Yeni bir izleme için önce listeden birini silin.');
      } else if (err instanceof ApiError && err.code === 'invalid_body') {
        setWatchError('Bu süzgeç izlemeye çevrilemedi. Çeşit, lif, gramaj ya da sertifika seçmeyi deneyin.');
      } else {
        setWatchError('İzleme kurulamadı, tekrar deneyin.');
      }
    } finally {
      setSaving(false);
    }
  };

  const subtypeOptions = type
    ? [{ value: '', label: 'Tümü' }, ...SUBTYPES[type].map((s) => ({ value: s.key, label: s.label }))]
    : [];

  const hint = (text: string) => <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>;
  const subLabel = (text: string) => <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;
  const half = { flex: 1, minWidth: 0 } as const;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={watchMode ? 'Yeni izleme' : 'Süzgeçler'} leading="back" onBack={() => navigation.goBack()} />
      <Screen
        sticky={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
            <Button kind="secondary" label="Temizle" onPress={clearAll} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Button
                size="lg"
                label={watchMode ? 'Bu süzgeci izle' : 'Uygula'}
                onPress={watchMode ? () => void saveWatch() : apply}
                disabled={errors.length > 0}
                loading={saving}
              />
            </View>
          </View>
        }
      >
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Çeşit" />
          <SingleChips options={TYPE_OPTIONS} value={type} onChange={changeType} />
          {type && SUBTYPES[type].length > 0 ? (
            <>
              {subLabel('Alt çeşit')}
              <SingleChips options={subtypeOptions} value={subtype} onChange={setSubtype} />
            </>
          ) : null}
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Kullanım amacı" />
          {hint('Seçtiklerinden herhangi birine uyan kumaşlar gelir.')}
          <MultiChips options={USAGES} values={usages} onChange={setUsages} />
        </View>

        {watchMode ? null : (
          <View style={{ gap: t.space[3] }}>
            <SectionTitle title="Stok" />
            <SingleChips options={UNIT_OPTIONS} value={stockUnit} onChange={setStockUnit} />
            <Input
              label="En az stok"
              unit={stockUnit ? STOCK_UNIT_LABELS[stockUnit].short : undefined}
              value={stockMin}
              onChangeText={setStockMin}
              placeholder="Örn. 500"
              error={stock.invalid ? invalidText : null}
              helper={
                stock.value !== undefined && !stockUnit
                  ? 'Birim seçilmezse metre ve kilogramla satılan kumaşlar aynı sayıyla karşılaştırılır.'
                  : undefined
              }
              {...numericProps}
            />
          </View>
        )}

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Ölçüler" />
          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <Input
              containerStyle={half}
              label="Gramaj en az"
              unit="gr/m²"
              value={gsmMin}
              onChangeText={setGsmMin}
              placeholder="0"
              error={gsmLow.invalid ? invalidText : gsmRangeText}
              {...numericProps}
            />
            <Input
              containerStyle={half}
              label="Gramaj en çok"
              unit="gr/m²"
              value={gsmMax}
              onChangeText={setGsmMax}
              placeholder="0"
              error={gsmHigh.invalid ? invalidText : null}
              {...numericProps}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <Input
              containerStyle={half}
              label="En en az"
              unit="cm"
              value={widthMin}
              onChangeText={setWidthMin}
              placeholder="0"
              error={widthLow.invalid ? invalidText : widthRangeText}
              {...numericProps}
            />
            <Input
              containerStyle={half}
              label="En en çok"
              unit="cm"
              value={widthMax}
              onChangeText={setWidthMax}
              placeholder="0"
              error={widthHigh.invalid ? invalidText : null}
              {...numericProps}
            />
          </View>
          {watchMode ? null : (
            <>
              {subLabel('En tipi')}
              <SingleChips options={WIDTH_TYPE_OPTIONS} value={widthType} onChange={setWidthType} />
            </>
          )}
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Lif" />
          {hint('Seçtiklerinden herhangi birini içeren kumaşlar gelir.')}
          <MultiChips options={FIBERS} values={fibers} onChange={setFibers} />
          {fibers.length ? (
            <Input
              label="Seçilen lif en az"
              unit="%"
              value={fiberMinPercent}
              onChangeText={setFiberMinPercent}
              placeholder="Örn. 5"
              error={
                fiberPercent.invalid
                  ? invalidText
                  : fiberPercent.value !== undefined && fiberPercent.value > 100
                    ? 'En fazla 100 olabilir.'
                    : null
              }
              {...numericProps}
            />
          ) : null}
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Sertifika" />
          {hint('Seçtiklerinden herhangi birine sahip kumaşlar gelir.')}
          <MultiChips options={CERTIFICATES} values={certificates} onChange={setCertificates} />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Ticari" />
          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <Input
              containerStyle={half}
              label="MOQ en çok"
              value={moqMax}
              onChangeText={setMoqMax}
              placeholder="Örn. 500"
              error={moq.invalid ? invalidText : null}
              {...numericProps}
            />
            <Input
              containerStyle={half}
              label="Termin en çok"
              unit="gün"
              value={leadTimeMax}
              onChangeText={setLeadTimeMax}
              placeholder="Örn. 15"
              error={leadTime.invalid ? invalidText : null}
              {...numericProps}
            />
          </View>
        </View>

        {watchMode ? null : (
          <View style={{ gap: t.space[3] }}>
            <SectionTitle title="İçerik" />
            <Input
              label="İçerikte geçen"
              value={content}
              onChangeText={setContent}
              placeholder="Örn. Pamuk, Elastan"
            />
          </View>
        )}

        {errors.length || watchError || watchMode ? (
          <View style={{ gap: t.space[2] }}>
            {errors.map((message) => (
              <ErrorBanner key={message} message={message} />
            ))}
            {watchError ? <ErrorBanner message={watchError} /> : null}
            {watchMode
              ? hint('Bu süzgece uyan yeni bir ürün eklendiğinde bildirim alırsın. Kendi firmanın ürünleri sayılmaz.')
              : null}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
