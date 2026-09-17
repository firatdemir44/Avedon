import React, { useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { ApiError, createWatchRule } from '../../api/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import { ChipSelect } from '../../components/ChipSelect';
import { MultiChipSelect } from '../../components/MultiChipSelect';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
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
import { InlineError } from '../../components/StateView';
import { toInputNumber } from '../../features/calculators/parse';
import { haptics } from '../../features/haptics';
import { colors, fonts, spacing, typography } from '../../theme';

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

// Orijinal tasarımdaki "Filtreleme Seçenekleri": çeşit, alt çeşit, kullanım
// amacı, stok, gramaj, en, içerik. "Uygula" filtreleri Ürünler sekmesine geri
// gönderir; ürün kodu ve firma araması Ürünler'deki arama çubuğunda.
export function ProductFiltersScreen({ navigation, route }: Props) {
  const initial = route.params.filters;
  // İzleme kipi (Faz 2, Adım 1): aynı ekran, farklı çıkış. Sunucudaki izleme
  // süzgeci ürün süzgecinin alt kümesi olduğu için desteklenmeyen bölümler
  // (Stok, İçerik, En tipi) bu kipte hiç gösterilmiyor: sessizce düşmesin.
  const watchMode = route.params.mode === 'watch';
  const insets = useSafeAreaInsets();
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

  useLayoutEffect(() => {
    if (watchMode) navigation.setOptions({ title: 'Yeni İzleme' });
  }, [navigation, watchMode]);

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

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionHeader title="Çeşit" first />
        <View style={styles.block}>
          <ChipSelect options={TYPE_OPTIONS} value={type} onChange={changeType} compact />
          {type && SUBTYPES[type].length > 0 ? (
            <>
              <Text style={styles.label}>Alt çeşit</Text>
              <ChipSelect options={subtypeOptions} value={subtype} onChange={setSubtype} compact />
            </>
          ) : null}
        </View>

        <SectionHeader title="Kullanım amacı" />
        <View style={styles.block}>
          <Text style={styles.hint}>Seçtiklerinizden herhangi birine uyan kumaşlar gelir.</Text>
          <MultiChipSelect options={USAGES} values={usages} onChange={setUsages} />
        </View>

        {watchMode ? null : (
          <>
        <SectionHeader title="Stok" />
        <View style={styles.block}>
          <ChipSelect options={UNIT_OPTIONS} value={stockUnit} onChange={setStockUnit} compact />
          <TextField
            label={`En az stok${stockUnit ? ` (${STOCK_UNIT_LABELS[stockUnit].short})` : ''}`}
            value={stockMin}
            onChangeText={setStockMin}
            placeholder="Örn. 500"
            keyboardType="numeric"
          />
          {stock.value !== undefined && !stockUnit ? (
            <Text style={styles.hint}>
              Birim seçilmezse metre ve kilogramla satılan kumaşlar aynı sayıyla karşılaştırılır.
            </Text>
          ) : null}
        </View>
          </>
        )}

        <SectionHeader title="Ölçüler" />
        <View style={styles.block}>
          <View style={styles.row}>
            <View style={styles.half}>
              <TextField label="Gramaj en az" value={gsmMin} onChangeText={setGsmMin} placeholder="gr/m²" keyboardType="numeric" />
            </View>
            <View style={styles.half}>
              <TextField label="Gramaj en çok" value={gsmMax} onChangeText={setGsmMax} placeholder="gr/m²" keyboardType="numeric" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}>
              <TextField label="En en az" value={widthMin} onChangeText={setWidthMin} placeholder="cm" keyboardType="numeric" />
            </View>
            <View style={styles.half}>
              <TextField label="En en çok" value={widthMax} onChangeText={setWidthMax} placeholder="cm" keyboardType="numeric" />
            </View>
          </View>
          {watchMode ? null : (
            <>
              <Text style={styles.label}>En tipi</Text>
              <ChipSelect options={WIDTH_TYPE_OPTIONS} value={widthType} onChange={setWidthType} compact />
            </>
          )}
        </View>

        <SectionHeader title="Lif" />
        <View style={styles.block}>
          <Text style={styles.hint}>Seçtiklerinizden herhangi birini içeren kumaşlar gelir.</Text>
          <MultiChipSelect options={FIBERS} values={fibers} onChange={setFibers} />
          {fibers.length ? (
            <TextField
              label="Seçilen lif en az (%)"
              value={fiberMinPercent}
              onChangeText={setFiberMinPercent}
              placeholder="Örn. 5"
              keyboardType="numeric"
            />
          ) : null}
        </View>

        <SectionHeader title="Sertifika" />
        <View style={styles.block}>
          <Text style={styles.hint}>Seçtiklerinizden herhangi birine sahip kumaşlar gelir.</Text>
          <MultiChipSelect options={CERTIFICATES} values={certificates} onChange={setCertificates} />
        </View>

        <SectionHeader title="Ticari" />
        <View style={styles.block}>
          <View style={styles.row}>
            <View style={styles.half}>
              <TextField
                label="MOQ en çok"
                value={moqMax}
                onChangeText={setMoqMax}
                placeholder="Örn. 500"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.half}>
              <TextField
                label="Termin en çok (gün)"
                value={leadTimeMax}
                onChangeText={setLeadTimeMax}
                placeholder="Örn. 15"
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {watchMode ? null : (
          <>
            <SectionHeader title="İçerik" />
            <View style={styles.block}>
              <TextField label="İçerikte geçen" value={content} onChangeText={setContent} placeholder="Örn. Pamuk, Elastan" />
            </View>
          </>
        )}

        {errors.map((message) => (
          <Text key={message} style={styles.error}>
            {message}
          </Text>
        ))}
        {watchError ? <InlineError message={watchError} style={styles.watchError} /> : null}
        {watchMode ? (
          <Text style={styles.watchNote}>
            Bu süzgece uyan yeni bir ürün eklendiğinde bildirim alırsınız. Kendi firmanızın ürünleri sayılmaz.
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <PrimaryButton label="Temizle" variant="outline" size="lg" onPress={clearAll} />
        <PrimaryButton
          label={watchMode ? (saving ? 'Kuruluyor...' : 'Bu süzgeci izle') : 'Filtreyi Uygula'}
          size="lg"
          onPress={watchMode ? () => void saveWatch() : apply}
          disabled={errors.length > 0 || saving}
          style={styles.actionMain}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter },
  label: { ...typography.label, fontFamily: fonts.semibold, color: colors.text, marginBottom: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  error: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.danger,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  watchError: { marginHorizontal: spacing.gutter, marginTop: spacing.sm },
  watchNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  actionMain: { flex: 1 },
});
