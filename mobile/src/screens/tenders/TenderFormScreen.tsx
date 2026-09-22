// Açık talep (ihale) formu. Fırat'ın tarifi: "96 filament 7 ton polyester
// iplik lazım; ihale gibi talep yayınlayayım, bütün polyester iplikçiler
// teklif versin; kumaş için de aynısı." Talep yayınlanınca sunucu kategoriye
// uyan satıcı firmalara bildirim gönderir (yanıttaki `notified`).
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  createTender,
  type TenderCategory,
  type TenderFabricSpec,
  type TenderUnit,
  type TenderYarnSpec,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { parseNumber } from '../../features/calculators/parse';
import { optionLabel, useYarnOptions } from '../../features/yarns/catalog';
import { PRODUCT_TYPES, SUBTYPES, TYPE_LABELS, type ProductType } from '../../features/products/catalog';
import {
  TENDER_CATEGORIES,
  TENDER_UNITS,
  dateInputToIso,
  isValidDateInput,
  tenderUnitShort,
} from '../../features/tenders/format';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Button, Card, Chip, ChipRow, Icon, Input, Screen, SectionTitle, SegmentControl } from '../../ui';

type Props = RootStackScreenProps<'TenderForm'>;

type CountUnit = NonNullable<TenderYarnSpec['countUnit']>;
type ColorState = NonNullable<TenderYarnSpec['colorState']>;

// Sunucu açık talepte yalnızca bu üç renk durumunu kabul ediyor.
const COLOR_STATES: { key: ColorState; label: string }[] = [
  { key: 'ham', label: 'Ham' },
  { key: 'ekru', label: 'Ekru' },
  { key: 'boyali', label: 'Boyalı' },
];

// "Viskon / Rejenere (modal, liyosel)" → "Viskon" (başlık önerisi için kısa ad).
function shortFamily(label: string): string {
  return label.split(/[/(]/)[0].trim();
}

function Label({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;
}

export function TenderFormScreen({ navigation }: Props) {
  const t = useTheme();
  const yarnOptions = useYarnOptions();

  const [category, setCategory] = useState<TenderCategory>('iplik');
  // İplik
  const [family, setFamily] = useState('');
  const [filaments, setFilaments] = useState('');
  const [count, setCount] = useState('');
  const [countUnit, setCountUnit] = useState<CountUnit>('denye');
  const [colorState, setColorState] = useState<ColorState | ''>('');
  // Kumaş
  const [fabricType, setFabricType] = useState<ProductType | ''>('');
  const [subtype, setSubtype] = useState('');
  const [weight, setWeight] = useState('');
  const [width, setWidth] = useState('');
  const [content, setContent] = useState('');
  // Ortak
  const [color, setColor] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<TenderUnit>('kg');
  const [targetDate, setTargetDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');
  const [shareToFeed, setShareToFeed] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Kategori değişince birim ona uygun başlasın (iplik kg, kumaş metre).
  const changeCategory = (next: TenderCategory) => {
    setCategory(next);
    setUnit(next === 'kumas' ? 'm' : next === 'iplik' ? 'kg' : 'adet');
    setError(null);
  };

  // Otomatik başlık önerisi: kullanıcı başlığa dokunana kadar alanlardan üretilir.
  const suggestedTitle = useMemo(() => {
    if (category === 'iplik') {
      const parts = [family ? `${shortFamily(optionLabel(yarnOptions.families, family))} iplik` : 'İplik'];
      if (parseNumber(filaments) > 0) parts.push(`${parseNumber(filaments)} filament`);
      if (parseNumber(count) > 0) parts.push(`${count.trim()} ${optionLabel(yarnOptions.countUnits, countUnit)}`);
      return parts.join(' · ');
    }
    if (category === 'kumas') {
      const sub = fabricType ? SUBTYPES[fabricType].find((s) => s.key === subtype)?.label : undefined;
      const parts = [sub ?? (fabricType ? `${TYPE_LABELS[fabricType]} kumaş` : 'Kumaş')];
      if (parseNumber(weight) > 0) parts.push(`${weight.trim()} gr/m²`);
      if (content.trim()) parts.push(content.trim());
      return parts.join(' · ');
    }
    return '';
  }, [category, family, filaments, count, countUnit, fabricType, subtype, weight, content, yarnOptions]);

  const effectiveTitle = titleEdited ? title : suggestedTitle;

  const quantityValue = parseNumber(quantity);
  const targetInvalid = !isValidDateInput(targetDate);
  const deadlineInvalid = !isValidDateInput(deadline);
  const titleInvalid = effectiveTitle.trim().length < 3;
  const canSubmit = quantityValue > 0 && !titleInvalid && !targetInvalid && !deadlineInvalid && !submitting;

  const buildSpec = (): TenderYarnSpec | TenderFabricSpec | undefined => {
    if (category === 'iplik') {
      const spec: TenderYarnSpec = {};
      if (family) spec.family = family;
      if (parseNumber(filaments) > 0) spec.filaments = Math.round(parseNumber(filaments));
      if (parseNumber(count) > 0) {
        spec.count = parseNumber(count);
        spec.countUnit = countUnit;
      }
      if (colorState) spec.colorState = colorState;
      if (color.trim()) spec.color = color.trim();
      return spec;
    }
    if (category === 'kumas') {
      const spec: TenderFabricSpec = {};
      if (fabricType) spec.type = fabricType;
      if (subtype) spec.subtype = subtype;
      if (parseNumber(weight) > 0) spec.weightGsm = parseNumber(weight);
      if (parseNumber(width) > 0) spec.widthCm = parseNumber(width);
      if (content.trim()) spec.content = content.trim();
      if (color.trim()) spec.color = color.trim();
      return spec;
    }
    return undefined;
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { tender, notified } = await createTender({
        category,
        title: effectiveTitle.trim(),
        spec: buildSpec(),
        quantity: quantityValue,
        unit,
        targetDate: dateInputToIso(targetDate),
        deadline: dateInputToIso(deadline, true),
        note: note.trim() || undefined,
        shareToFeed,
      });
      haptics.success();
      navigation.replace('TenderDetail', { tenderId: tender.id, notified });
    } catch (err) {
      haptics.error();
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.code === 'daily_limit') {
        setError('Bugün en fazla 10 açık talep yayınlanabilir. Yarın tekrar deneyin.');
      } else if (apiError?.code === 'invalid_spec' || apiError?.code === 'invalid_body') {
        setError('Bazı bilgiler geçersiz. Sayıları ve tarihleri kontrol edin.');
      } else {
        setError(friendlyMessage(err, 'Talep yayınlanamadı'));
      }
      setSubmitting(false);
    }
  };

  const subtypes = fabricType ? SUBTYPES[fabricType] : [];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Açık talep yayınla" leading="back" onBack={() => navigation.goBack()} />
      <Screen
        sticky={
          <Button size="lg" label="Talebi yayınla" loading={submitting} disabled={!canSubmit} onPress={submit} />
        }
      >
        <Card>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            Ne aradığınızı yazın; bu işi yapan firmalara haber gider, teklifleri tek yerde karşılaştırırsınız.
          </Text>
        </Card>

        <View style={{ gap: t.space[4] }}>
          <SectionTitle title="Ne arıyorsunuz?" />
          <SegmentControl<TenderCategory>
            stretch
            accessibilityLabel="Kategori"
            value={category}
            onChange={changeCategory}
            options={TENDER_CATEGORIES}
          />

          {category === 'iplik' ? (
            <>
              <View style={{ gap: t.space[2] }}>
                <Label text="Lif ailesi" />
                <ChipRow>
                  {yarnOptions.families.map((f) => (
                    <Chip
                      key={f.key}
                      label={shortFamily(f.label)}
                      selected={family === f.key}
                      onPress={() => setFamily(family === f.key ? '' : f.key)}
                    />
                  ))}
                </ChipRow>
              </View>
              <Input
                label="Filament sayısı (isteğe bağlı)"
                value={filaments}
                onChangeText={setFilaments}
                inputMode="numeric"
                keyboardType="number-pad"
                placeholder="Örn. 96"
              />
              <Input
                label="Numara (isteğe bağlı)"
                value={count}
                onChangeText={setCount}
                inputMode="decimal"
                keyboardType="decimal-pad"
                placeholder="Örn. 150"
                unit={optionLabel(yarnOptions.countUnits, countUnit)}
              />
              <View style={{ gap: t.space[2] }}>
                <Label text="Numara birimi" />
                <ChipRow>
                  {yarnOptions.countUnits.map((u) => (
                    <Chip
                      key={u.key}
                      label={u.label}
                      selected={countUnit === u.key}
                      onPress={() => setCountUnit(u.key as CountUnit)}
                    />
                  ))}
                </ChipRow>
              </View>
              <View style={{ gap: t.space[2] }}>
                <Label text="Renk durumu" />
                <ChipRow>
                  {COLOR_STATES.map((c) => (
                    <Chip
                      key={c.key}
                      label={c.label}
                      selected={colorState === c.key}
                      onPress={() => setColorState(colorState === c.key ? '' : c.key)}
                    />
                  ))}
                </ChipRow>
              </View>
            </>
          ) : null}

          {category === 'kumas' ? (
            <>
              <View style={{ gap: t.space[2] }}>
                <Label text="Kumaş çeşidi" />
                <ChipRow>
                  {PRODUCT_TYPES.map((type) => (
                    <Chip
                      key={type}
                      label={TYPE_LABELS[type]}
                      selected={fabricType === type}
                      onPress={() => {
                        setFabricType(fabricType === type ? '' : type);
                        setSubtype('');
                      }}
                    />
                  ))}
                </ChipRow>
              </View>
              {subtypes.length ? (
                <View style={{ gap: t.space[2] }}>
                  <Label text="Alt çeşit" />
                  <ChipRow>
                    {subtypes.map((s) => (
                      <Chip
                        key={s.key}
                        label={s.label}
                        selected={subtype === s.key}
                        onPress={() => setSubtype(subtype === s.key ? '' : s.key)}
                      />
                    ))}
                  </ChipRow>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                <Input
                  containerStyle={{ flex: 1, minWidth: 0 }}
                  label="Gramaj"
                  value={weight}
                  onChangeText={setWeight}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  placeholder="165"
                  unit="gr/m²"
                />
                <Input
                  containerStyle={{ flex: 1, minWidth: 0 }}
                  label="En"
                  value={width}
                  onChangeText={setWidth}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  placeholder="180"
                  unit="cm"
                />
              </View>
              <Input
                label="İçerik (isteğe bağlı)"
                value={content}
                onChangeText={setContent}
                placeholder="Örn. %95 pamuk %5 elastan"
              />
            </>
          ) : null}

          {category !== 'diger' ? (
            <Input label="Renk (isteğe bağlı)" value={color} onChangeText={setColor} placeholder="Örn. Siyah" />
          ) : null}
        </View>

        <View style={{ gap: t.space[4] }}>
          <SectionTitle title="Talep bilgileri" />
          <Input
            label="Başlık"
            value={effectiveTitle}
            onChangeText={(v) => {
              setTitleEdited(true);
              setTitle(v);
            }}
            placeholder={category === 'diger' ? 'Örn. Etiket baskısı' : 'Örn. Polyester iplik · 96 filament'}
            helper={titleEdited ? undefined : 'Seçtiklerinize göre önerildi; değiştirebilirsiniz.'}
            error={titleEdited && titleInvalid ? 'Başlık en az 3 harf olmalı.' : null}
          />
          <Input
            label="Miktar"
            value={quantity}
            onChangeText={setQuantity}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder="Örn. 7"
            unit={tenderUnitShort(unit)}
          />
          <View style={{ gap: t.space[2] }}>
            <Label text="Birim" />
            <SegmentControl<TenderUnit> stretch accessibilityLabel="Birim" value={unit} onChange={setUnit} options={TENDER_UNITS} />
          </View>
          <Input
            label="İstenen termin (isteğe bağlı)"
            value={targetDate}
            onChangeText={setTargetDate}
            placeholder="2026-11-15"
            autoCapitalize="none"
            helper="YYYY-AA-GG biçiminde yazın."
            error={targetInvalid ? 'Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).' : null}
          />
          <Input
            label="Son teklif tarihi (isteğe bağlı)"
            value={deadline}
            onChangeText={setDeadline}
            placeholder="2026-10-01"
            autoCapitalize="none"
            helper="Boş bırakırsanız talebi siz kapatana kadar teklif gelir."
            error={deadlineInvalid ? 'Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-10-01).' : null}
          />
          <Input
            label="Not (isteğe bağlı)"
            value={note}
            onChangeText={setNote}
            placeholder="Örn. Teslim İstanbul, parçalı sevkiyat olabilir"
            multiline
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[3],
              minHeight: t.size.touchMin,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>Akışta da paylaş</Text>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Talep ana sayfa akışında görünür.</Text>
            </View>
            <Switch
              value={shareToFeed}
              onValueChange={(v) => {
                haptics.selection();
                setShareToFeed(v);
              }}
              trackColor={{ true: t.colors.brand, false: t.colors.lineStrong }}
              accessibilityLabel="Akışta da paylaş"
            />
          </View>
        </View>

        {error ? (
          <View
            accessibilityRole="alert"
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
        ) : null}
      </Screen>
    </View>
  );
}
