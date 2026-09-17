import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { ChipSelect } from '../../components/ChipSelect';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { SkeletonDetail } from '../../components/Skeleton';
import { EmptyState, InlineError, friendlyMessage } from '../../components/StateView';
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
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'MachineForm'>;

// Faz 2, Adım 5: tek makinenin ekleme/düzenleme formu. Makine türü SERBEST
// METİN: öneriler sunucudan gelir, çipe dokunmak alana yazar, kullanıcı
// istediğini yazabilir. Teknik alanlar gruba göre değişir (örmede pus/fayn,
// dokuma-boya-baskıda çalışma eni), gereksiz alan sorulmaz.

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
  const { user } = useSession();
  const companyId = user?.companyId ?? null;
  const insets = useSafeAreaInsets();

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
  const [note, setNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: machineId ? 'Makineyi Düzenle' : 'Makine Ekle' });
  }, [navigation, machineId]);

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

  const numbersInvalid = [yearValue, countValue, diameterValue, gaugeValue, feedersValue, needlesValue, widthValue].some(
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
      count: countValue.value ? Math.max(1, Math.round(countValue.value)) : 1,
      note: note.trim(),
    };
    setSaving(true);
    setFormError(null);
    try {
      if (machineId) await updateMachine(machineId, input);
      else await createMachine(input);
      haptics.success();
      navigation.popTo('MachinePark');
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

  if (!companyId) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="business-outline"
          title="Makine parkı firmaya bağlı"
          message="Bir firmaya bağlandığınızda makine parkınızı girebilirsiniz."
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <SkeletonDetail variant="profile" />
      </View>
    );
  }

  const knit = groupHasKnitFields(group);
  const width = groupHasWidthField(group);
  const featureSuggestions = FEATURE_SUGGESTIONS[group] ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loadError ? <InlineError message={loadError} style={styles.banner} /> : null}

        <SectionHeader title="Grup" first />
        <View style={styles.block}>
          <ChipSelect
            options={MACHINE_GROUP_ORDER.map((value) => ({ value, label: MACHINE_GROUP_LABELS[value] }))}
            value={group}
            onChange={(next) => {
              haptics.selection();
              setGroup(next);
            }}
            compact
          />
        </View>

        <SectionHeader title="Makine türü" />
        <View style={styles.block}>
          <TextField
            label="Tür"
            value={kind}
            onChangeText={setKind}
            placeholder="Örn. Yuvarlak örme (süprem)"
            maxLength={80}
            autoCapitalize="sentences"
          />
          {suggestions.length ? (
            <>
              <Text style={styles.hint}>Öneriler bağlayıcı değil, istediğinizi yazabilirsiniz.</Text>
              <SuggestionChips items={suggestions} onPick={setKind} label="makine türü" />
            </>
          ) : null}
        </View>

        <SectionHeader title="Makine bilgisi" />
        <View style={styles.block}>
          <View style={styles.row}>
            <View style={styles.half}>
              <TextField label="Marka" value={brand} onChangeText={setBrand} placeholder="Örn. Mayer" maxLength={60} />
            </View>
            <View style={styles.half}>
              <TextField label="Model" value={model} onChangeText={setModel} placeholder="Örn. Relanit" maxLength={60} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}>
              <TextField label="Yıl" value={year} onChangeText={setYear} placeholder="Örn. 2019" keyboardType="numeric" />
            </View>
            <View style={styles.half}>
              <TextField label="Adet" value={count} onChangeText={setCount} placeholder="1" keyboardType="numeric" />
            </View>
          </View>
        </View>

        {knit ? (
          <>
            <SectionHeader title="Teknik" />
            <View style={styles.block}>
              <View style={styles.row}>
                <View style={styles.half}>
                  <TextField
                    label="Pus (inç)"
                    value={diameterInch}
                    onChangeText={setDiameterInch}
                    placeholder="Örn. 30"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.half}>
                  <TextField label="Fayn" value={gauge} onChangeText={setGauge} placeholder="Örn. 28" keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <TextField
                    label="Sistem sayısı"
                    value={feeders}
                    onChangeText={setFeeders}
                    placeholder="Örn. 96"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.half}>
                  <TextField
                    label="İğne sayısı"
                    value={needles}
                    onChangeText={setNeedles}
                    placeholder="Örn. 2640"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>
          </>
        ) : null}

        {width ? (
          <>
            <SectionHeader title="Teknik" />
            <View style={styles.block}>
              <TextField
                label="Çalışma eni (cm)"
                value={workingWidthCm}
                onChangeText={setWorkingWidthCm}
                placeholder="Örn. 240"
                keyboardType="numeric"
              />
            </View>
          </>
        ) : null}

        <SectionHeader title="Özellik ve not" />
        <View style={styles.block}>
          <TextField
            label="Özellik"
            value={feature}
            onChangeText={setFeature}
            placeholder="Örn. tek plaka"
            maxLength={120}
          />
          {featureSuggestions.length ? <SuggestionChips items={featureSuggestions} onPick={setFeature} label="özellik" /> : null}
          <TextField label="Not" value={note} onChangeText={setNote} placeholder="İsteğe bağlı" maxLength={300} multiline />
        </View>

        {formError ? <InlineError message={formError} style={styles.banner} /> : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <PrimaryButton
          label={saving ? 'Kaydediliyor...' : 'Kaydet'}
          size="lg"
          onPress={() => void save()}
          disabled={saving}
          style={styles.actionMain}
        />
      </View>
    </View>
  );
}

// Alana yazan öneri çipleri (ChipSelect değil: değer listeyle sınırlı değil;
// ürün formundaki test türü önerileriyle aynı desen).
function SuggestionChips({ items, onPick, label }: { items: string[]; onPick: (value: string) => void; label: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipStrip}>
      {items.map((item) => (
        <Pressable
          key={item}
          onPress={() => {
            haptics.selection();
            onPick(item);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${item}, ${label} olarak yaz`}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text style={styles.chipText}>{item}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter },
  banner: { marginHorizontal: spacing.gutter, marginTop: spacing.md },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  chipStrip: { gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTonal,
  },
  chipPressed: { backgroundColor: colors.pressed },
  chipText: { ...typography.label, fontFamily: fonts.medium, color: colors.text },
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
