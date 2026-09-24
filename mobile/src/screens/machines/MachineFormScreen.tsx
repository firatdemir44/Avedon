// Makine ekleme / düzenleme formu (yeni tasarım, 4. adım — DESIGN.md §2/§3).
//
// Faz 2, Adım 5'teki mantık aynen duruyor: makine türü SERBEST METİN (öneriler
// sunucudan gelir, çipe dokunmak alana yazar), teknik alanlar gruba göre
// değişir (örmede pus/fayn, dokuma-boya-baskıda çalışma eni).
//
// Görünüm yeni: AppBar + Screen, alanlar ui/Input (birimli), grup seçimi
// ui/Chip, kaydet tek dolu ui/Button yapışkan çubukta.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  createMachine,
  fetchCompanyMachines,
  fetchMachineKinds,
  updateMachine,
  type Machine,
  type MachineGroup,
  type MachineInput,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { useSession } from '../../context/SessionContext';
import { haptics } from '../../features/haptics';
import { toInputNumber } from '../../features/calculators/parse';
import {
  FEATURE_SUGGESTIONS,
  MACHINE_GROUP_LABELS,
  MACHINE_GROUP_ORDER,
  groupHasKnitFields,
  groupHasWidthField,
} from '../../features/machines/catalog';
import { parseRange } from '../../features/machines/range';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import {
  AppBar,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  Input,
  Screen,
  SectionTitle,
  SkeletonText,
} from '../../ui';

type Props = RootStackScreenProps<'MachineForm'>;

const NUMBER_PATTERN = /^\d+([.,]\d+)?$/;

function readNumber(text: string): { value?: number; invalid: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { invalid: false };
  if (!NUMBER_PATTERN.test(trimmed)) return { invalid: true };
  return { value: Number(trimmed.replace(',', '.')), invalid: false };
}

const toText = (value: number | null | undefined) => (value == null ? '' : toInputNumber(value));

// Türkçe büyük/küçük harf ve yaygın işaretleri düşürerek öneri süzme.
function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

export function MachineFormScreen({ navigation, route }: Props) {
  const machineId = route.params?.machineId;
  const t = useTheme();
  const { user } = useSession();
  const companyId = user?.companyId ?? null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kindOptions, setKindOptions] = useState<Record<string, string[]>>({});

  const [group, setGroup] = useState<MachineGroup>('orme');
  const [kind, setKind] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [count, setCount] = useState('1');
  const [diameterInch, setDiameterInch] = useState('');
  const [gauge, setGauge] = useState('');
  const [feeders, setFeeders] = useState('');
  const [needles, setNeedles] = useState('');
  const [workingWidthCm, setWorkingWidthCm] = useState('');
  const [feature, setFeature] = useState('');
  const [dailyCapacityKg, setDailyCapacityKg] = useState('');
  const [note, setNote] = useState('');
  const [machineNo, setMachineNo] = useState('');
  const [fabricType, setFabricType] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const title = machineId ? tr('Makineyi düzenle') : tr('Makine ekle');

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const fill = useCallback((machine: Machine) => {
    setGroup(machine.group);
    setKind(machine.kind);
    setBrand(machine.brand);
    setModel(machine.model);
    setYear(machine.year ? String(machine.year) : '');
    setCount(String(machine.count));
    setDiameterInch(toText(machine.diameterInch));
    setGauge(machine.gaugeText || toText(machine.gauge));
    setFeeders(toText(machine.feeders));
    setNeedles(machine.needlesText || toText(machine.needles));
    setWorkingWidthCm(toText(machine.workingWidthCm));
    setFeature(machine.feature);
    setDailyCapacityKg(toText(machine.dailyCapacityKg));
    setNote(machine.note);
    setMachineNo(machine.machineNo != null ? String(machine.machineNo) : '');
    setFabricType(machine.fabricType);
  }, []);

  // Form yalnızca bir kez dolduruluyor: öneriler ve (düzenlemede) makine.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const kinds = fetchMachineKinds()
      .then(({ kinds: fetched }) => {
        if (!cancelled) setKindOptions(fetched);
      })
      // Öneri gelmezse form yine çalışır: tür serbest metin.
      .catch(() => {});
    const machine =
      machineId && companyId
        ? fetchCompanyMachines(companyId).then(({ machines }) => {
            const found = machines.find((m) => m.id === machineId);
            if (cancelled) return;
            if (found) fill(found);
            else setLoadError(tr('Makine bulunamadı, silinmiş olabilir.'));
          })
        : Promise.resolve();
    void Promise.all([kinds, machine])
      .catch(() => {
        if (!cancelled) setLoadError(tr('Makine bilgisi alınamadı.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, fill, machineId]);

  const suggestions = useMemo(() => {
    const all = kindOptions[group] ?? [];
    const typed = fold(kind);
    const filtered = typed ? all.filter((option) => fold(option).includes(typed)) : all;
    return filtered.slice(0, 12);
  }, [group, kind, kindOptions]);

  const yearValue = readNumber(year);
  const countValue = readNumber(count);
  const diameterValue = readNumber(diameterInch);
  // Fine ve iğne aralık olabilir (dönüştürülebilir makine): "28-22", "2808-2210".
  const gaugeRange = parseRange(gauge);
  const gaugeValue = { value: gaugeRange?.first ?? undefined, invalid: gaugeRange === null };
  const feedersValue = readNumber(feeders);
  const needlesRange = parseRange(needles);
  const needlesValue = { value: needlesRange?.first ?? undefined, invalid: needlesRange === null };
  const machineNoValue = readNumber(machineNo);
  const widthValue = readNumber(workingWidthCm);
  const dailyValue = readNumber(dailyCapacityKg);

  const numbersInvalid = [machineNoValue, yearValue, countValue, diameterValue, gaugeValue, feedersValue, needlesValue, widthValue, dailyValue].some(
    (n) => n.invalid
  );

  const save = async () => {
    const trimmedKind = kind.trim();
    if (trimmedKind.length < 2) {
      setFormError(tr('Makine türünü yazın (en az 2 karakter).'));
      haptics.error();
      return;
    }
    if (numbersInvalid) {
      setFormError(tr('Sayı alanlarına yalnızca rakam girin (ondalık için virgül).'));
      haptics.error();
      return;
    }
    const knit = groupHasKnitFields(group);
    const width = groupHasWidthField(group);
    const input: MachineInput = {
      group,
      kind: trimmedKind,
      brand: brand.trim(),
      model: model.trim(),
      year: yearValue.value ? Math.round(yearValue.value) : null,
      diameterInch: knit ? diameterValue.value ?? null : null,
      gauge: knit ? gaugeValue.value ?? null : null,
      gaugeText: knit ? gaugeRange?.text ?? '' : '',
      feeders: knit && feedersValue.value ? Math.round(feedersValue.value) : null,
      needles: knit && needlesValue.value ? Math.round(needlesValue.value) : null,
      needlesText: knit ? needlesRange?.text ?? '' : '',
      fabricType: knit ? fabricType.trim() : '',
      machineNo: machineNoValue.value != null ? Math.round(machineNoValue.value) : null,
      workingWidthCm: width ? widthValue.value ?? null : null,
      feature: feature.trim(),
      dailyCapacityKg: dailyValue.value ?? null,
      count: countValue.value ? Math.max(1, Math.round(countValue.value)) : 1,
      note: note.trim(),
    };
    setSaving(true);
    setFormError(null);
    try {
      if (machineId) await updateMachine(machineId, input);
      else await createMachine(input);
      haptics.success();
      // Firma sayfasının Makineler sekmesinden de açılabildiği için geldiği yere döner.
      navigation.goBack();
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.code === 'too_many_machines') {
        setFormError(tr('Makine sınırına ulaştınız. Yenisini eklemek için birini silin.'));
      } else if (err instanceof ApiError && err.code === 'no_company') {
        setFormError(tr('Makine parkı firmaya bağlıdır. Bir firmaya bağlandığınızda ekleyebilirsiniz.'));
      } else if (err instanceof ApiError && err.code === 'invalid_body') {
        setFormError(tr('Girilen değerlerden biri kabul edilmedi. Sayı alanlarını kontrol edin.'));
      } else {
        setFormError(friendlyMessage(err, tr('Kaydedilemedi, tekrar deneyin.')));
      }
    } finally {
      setSaving(false);
    }
  };

  const bar = <AppBar title={title} leading="back" onBack={() => navigation.goBack()} />;

  if (!companyId) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="machine"
            title={tr('Makine parkı firmaya bağlı')}
            description={tr('Bir firmaya bağlandığında makine parkını girebilirsin.')}
          />
        </Screen>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <SkeletonText lines={3} />
          <SkeletonText lines={3} />
        </Screen>
      </View>
    );
  }

  const knit = groupHasKnitFields(group);
  const width = groupHasWidthField(group);
  const featureSuggestions = FEATURE_SUGGESTIONS[group] ?? [];

  const banner = (message: string) => (
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
      <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{message}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}

      <Screen
        sticky={
          <Button size="lg" label={tr('Kaydet')} loading={saving} disabled={saving} onPress={() => void save()} />
        }
      >
        {loadError ? banner(loadError) : null}

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Grup')} />
          <ChipRow>
            {MACHINE_GROUP_ORDER.map((value) => (
              <Chip
                key={value}
                label={tr(MACHINE_GROUP_LABELS[value])}
                selected={value === group}
                onPress={() => {
                  haptics.selection();
                  setGroup(value);
                }}
              />
            ))}
          </ChipRow>
        </View>

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Makine türü')} />
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Input
                label={tr('Tür')}
                value={kind}
                onChangeText={setKind}
                placeholder={tr('Örn. Yuvarlak örme (süprem)')}
                maxLength={80}
                autoCapitalize="sentences"
                helper={suggestions.length ? tr('Öneriler bağlayıcı değil, istediğinizi yazabilirsiniz.') : undefined}
              />
              {suggestions.length ? (
                <ChipRow>
                  {suggestions.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      onPress={() => {
                        haptics.selection();
                        setKind(item);
                      }}
                    />
                  ))}
                </ChipRow>
              ) : null}
            </View>
          </Card>
        </View>

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Makine bilgisi')} />
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Input
                label={tr('Makine no')}
                value={machineNo}
                onChangeText={setMachineNo}
                placeholder={tr('Örn. 12 (tablonuzdaki Mak No)')}
                inputMode="numeric"
                keyboardType="number-pad"
                error={machineNoValue.invalid ? tr('Yalnızca rakam') : null}
              />
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Input
                  containerStyle={{ flex: 1 }}
                  label={tr('Marka')}
                  value={brand}
                  onChangeText={setBrand}
                  placeholder={tr('Örn. Mayer')}
                  maxLength={60}
                />
                <Input
                  containerStyle={{ flex: 1 }}
                  label="Model"
                  value={model}
                  onChangeText={setModel}
                  placeholder={tr('Örn. Relanit')}
                  maxLength={60}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Input
                  containerStyle={{ flex: 1 }}
                  label={tr('Yıl')}
                  value={year}
                  onChangeText={setYear}
                  placeholder={tr('Örn. 2019')}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  error={yearValue.invalid ? tr('Yalnızca rakam') : null}
                />
                <Input
                  containerStyle={{ flex: 1 }}
                  label={tr('Adet')}
                  unit={tr('adet')}
                  value={count}
                  onChangeText={setCount}
                  placeholder="1"
                  inputMode="numeric"
                  keyboardType="number-pad"
                  error={countValue.invalid ? tr('Yalnızca rakam') : null}
                />
              </View>
            </View>
          </Card>
        </View>

        {knit ? (
          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Teknik')} />
            <Card>
              <View style={{ gap: t.space[3] }}>
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Input
                    containerStyle={{ flex: 1 }}
                    label={tr('Pus')}
                    unit={tr('inç')}
                    value={diameterInch}
                    onChangeText={setDiameterInch}
                    placeholder={tr('Örn. 30')}
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    error={diameterValue.invalid ? tr('Yalnızca rakam') : null}
                  />
                  <Input
                    containerStyle={{ flex: 1 }}
                    label={tr('Fayn')}
                    value={gauge}
                    onChangeText={setGauge}
                    placeholder={tr('Örn. 28 ya da 28-22')}
                    keyboardType="numbers-and-punctuation"
                    error={gaugeValue.invalid ? tr('Sayı ya da aralık (28-22)') : null}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Input
                    containerStyle={{ flex: 1 }}
                    label={tr('Sistem sayısı')}
                    value={feeders}
                    onChangeText={setFeeders}
                    placeholder={tr('Örn. 96')}
                    inputMode="numeric"
                    keyboardType="number-pad"
                    error={feedersValue.invalid ? tr('Yalnızca rakam') : null}
                  />
                  <Input
                    containerStyle={{ flex: 1 }}
                    label={tr('İğne sayısı')}
                    value={needles}
                    onChangeText={setNeedles}
                    placeholder={tr('Örn. 2640 ya da 2808-2210')}
                    keyboardType="numbers-and-punctuation"
                    error={needlesValue.invalid ? tr('Sayı ya da aralık') : null}
                  />
                </View>
                <Input
                  label={tr('Örgü cinsi')}
                  value={fabricType}
                  onChangeText={setFabricType}
                  placeholder={tr('Örn. Süprem tüp, İnter-ribana')}
                  maxLength={80}
                />
              </View>
            </Card>
          </View>
        ) : null}

        {width ? (
          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Teknik')} />
            <Card>
              <Input
                label={tr('Çalışma eni')}
                unit="cm"
                value={workingWidthCm}
                onChangeText={setWorkingWidthCm}
                placeholder={tr('Örn. 240')}
                inputMode="decimal"
                keyboardType="decimal-pad"
                error={widthValue.invalid ? tr('Yalnızca rakam') : null}
              />
            </Card>
          </View>
        ) : null}

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Özellik ve not')} />
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Input
                label={tr('Günlük kapasite')}
                unit="kg"
                value={dailyCapacityKg}
                onChangeText={setDailyCapacityKg}
                placeholder={tr('Örn. 450')}
                inputMode="decimal"
                keyboardType="decimal-pad"
                error={dailyValue.invalid ? tr('Yalnızca rakam') : null}
              />
              <Input
                label={tr('Özellik')}
                value={feature}
                onChangeText={setFeature}
                placeholder={tr('Örn. tek plaka')}
                maxLength={120}
              />
              {featureSuggestions.length ? (
                <ChipRow>
                  {featureSuggestions.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      onPress={() => {
                        haptics.selection();
                        setFeature(item);
                      }}
                    />
                  ))}
                </ChipRow>
              ) : null}
              <Input
                label={tr('Not')}
                value={note}
                onChangeText={setNote}
                placeholder={tr('İsteğe bağlı')}
                maxLength={300}
                multiline
              />
            </View>
          </Card>
        </View>

        {formError ? banner(formError) : null}
      </Screen>
    </View>
  );
}
