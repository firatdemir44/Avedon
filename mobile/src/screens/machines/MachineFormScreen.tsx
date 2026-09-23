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
import { useTheme } from '../../theme/ThemeContext';
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

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const title = machineId ? 'Makineyi düzenle' : 'Makine ekle';

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
    setGauge(toText(machine.gauge));
    setFeeders(toText(machine.feeders));
    setNeedles(toText(machine.needles));
    setWorkingWidthCm(toText(machine.workingWidthCm));
    setFeature(machine.feature);
    setDailyCapacityKg(toText(machine.dailyCapacityKg));
    setNote(machine.note);
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
            else setLoadError('Makine bulunamadı, silinmiş olabilir.');
          })
        : Promise.resolve();
    void Promise.all([kinds, machine])
      .catch(() => {
        if (!cancelled) setLoadError('Makine bilgisi alınamadı.');
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
  const gaugeValue = readNumber(gauge);
  const feedersValue = readNumber(feeders);
  const needlesValue = readNumber(needles);
  const widthValue = readNumber(workingWidthCm);
  const dailyValue = readNumber(dailyCapacityKg);

  const numbersInvalid = [yearValue, countValue, diameterValue, gaugeValue, feedersValue, needlesValue, widthValue, dailyValue].some(
    (n) => n.invalid
  );

  const save = async () => {
    const trimmedKind = kind.trim();
    if (trimmedKind.length < 2) {
      setFormError('Makine türünü yazın (en az 2 karakter).');
      haptics.error();
      return;
    }
    if (numbersInvalid) {
      setFormError('Sayı alanlarına yalnızca rakam girin (ondalık için virgül).');
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
      feeders: knit && feedersValue.value ? Math.round(feedersValue.value) : null,
      needles: knit && needlesValue.value ? Math.round(needlesValue.value) : null,
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
        setFormError('Makine sınırına ulaştınız. Yenisini eklemek için birini silin.');
      } else if (err instanceof ApiError && err.code === 'no_company') {
        setFormError('Makine parkı firmaya bağlıdır. Bir firmaya bağlandığınızda ekleyebilirsiniz.');
      } else if (err instanceof ApiError && err.code === 'invalid_body') {
        setFormError('Girilen değerlerden biri kabul edilmedi. Sayı alanlarını kontrol edin.');
      } else {
        setFormError(friendlyMessage(err, 'Kaydedilemedi, tekrar deneyin.'));
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
            title="Makine parkı firmaya bağlı"
            description="Bir firmaya bağlandığında makine parkını girebilirsin."
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
          <Button size="lg" label="Kaydet" loading={saving} disabled={saving} onPress={() => void save()} />
        }
      >
        {loadError ? banner(loadError) : null}

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title="Grup" />
          <ChipRow>
            {MACHINE_GROUP_ORDER.map((value) => (
              <Chip
                key={value}
                label={MACHINE_GROUP_LABELS[value]}
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
          <SectionTitle title="Makine türü" />
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Input
                label="Tür"
                value={kind}
                onChangeText={setKind}
                placeholder="Örn. Yuvarlak örme (süprem)"
                maxLength={80}
                autoCapitalize="sentences"
                helper={suggestions.length ? 'Öneriler bağlayıcı değil, istediğinizi yazabilirsiniz.' : undefined}
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
          <SectionTitle title="Makine bilgisi" />
          <Card>
            <View style={{ gap: t.space[3] }}>
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Input
                  containerStyle={{ flex: 1 }}
                  label="Marka"
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="Örn. Mayer"
                  maxLength={60}
                />
                <Input
                  containerStyle={{ flex: 1 }}
                  label="Model"
                  value={model}
                  onChangeText={setModel}
                  placeholder="Örn. Relanit"
                  maxLength={60}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Input
                  containerStyle={{ flex: 1 }}
                  label="Yıl"
                  value={year}
                  onChangeText={setYear}
                  placeholder="Örn. 2019"
                  inputMode="numeric"
                  keyboardType="number-pad"
                  error={yearValue.invalid ? 'Yalnızca rakam' : null}
                />
                <Input
                  containerStyle={{ flex: 1 }}
                  label="Adet"
                  unit="adet"
                  value={count}
                  onChangeText={setCount}
                  placeholder="1"
                  inputMode="numeric"
                  keyboardType="number-pad"
                  error={countValue.invalid ? 'Yalnızca rakam' : null}
                />
              </View>
            </View>
          </Card>
        </View>

        {knit ? (
          <View style={{ gap: t.space[2] }}>
            <SectionTitle title="Teknik" />
            <Card>
              <View style={{ gap: t.space[3] }}>
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Input
                    containerStyle={{ flex: 1 }}
                    label="Pus"
                    unit="inç"
                    value={diameterInch}
                    onChangeText={setDiameterInch}
                    placeholder="Örn. 30"
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    error={diameterValue.invalid ? 'Yalnızca rakam' : null}
                  />
                  <Input
                    containerStyle={{ flex: 1 }}
                    label="Fayn"
                    value={gauge}
                    onChangeText={setGauge}
                    placeholder="Örn. 28"
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    error={gaugeValue.invalid ? 'Yalnızca rakam' : null}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Input
                    containerStyle={{ flex: 1 }}
                    label="Sistem sayısı"
                    value={feeders}
                    onChangeText={setFeeders}
                    placeholder="Örn. 96"
                    inputMode="numeric"
                    keyboardType="number-pad"
                    error={feedersValue.invalid ? 'Yalnızca rakam' : null}
                  />
                  <Input
                    containerStyle={{ flex: 1 }}
                    label="İğne sayısı"
                    value={needles}
                    onChangeText={setNeedles}
                    placeholder="Örn. 2640"
                    inputMode="numeric"
                    keyboardType="number-pad"
                    error={needlesValue.invalid ? 'Yalnızca rakam' : null}
                  />
                </View>
              </View>
            </Card>
          </View>
        ) : null}

        {width ? (
          <View style={{ gap: t.space[2] }}>
            <SectionTitle title="Teknik" />
            <Card>
              <Input
                label="Çalışma eni"
                unit="cm"
                value={workingWidthCm}
                onChangeText={setWorkingWidthCm}
                placeholder="Örn. 240"
                inputMode="decimal"
                keyboardType="decimal-pad"
                error={widthValue.invalid ? 'Yalnızca rakam' : null}
              />
            </Card>
          </View>
        ) : null}

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title="Özellik ve not" />
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Input
                label="Günlük kapasite"
                unit="kg"
                value={dailyCapacityKg}
                onChangeText={setDailyCapacityKg}
                placeholder="Örn. 450"
                inputMode="decimal"
                keyboardType="decimal-pad"
                error={dailyValue.invalid ? 'Yalnızca rakam' : null}
              />
              <Input
                label="Özellik"
                value={feature}
                onChangeText={setFeature}
                placeholder="Örn. tek plaka"
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
                label="Not"
                value={note}
                onChangeText={setNote}
                placeholder="İsteğe bağlı"
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
