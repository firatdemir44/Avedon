import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  deleteMachine,
  fetchCompanyMachines,
  saveCapacity,
  type Machine,
} from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useSession } from '../../context/SessionContext';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useFocusLoad } from '../../features/useFocusLoad';
import { toInputNumber } from '../../features/calculators/parse';
import { groupMachines, machineSummary } from '../../features/machines/catalog';
import { MIN_TOUCH, colors, fonts, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'MachinePark'>;

// Faz 2, Adım 5: kendi firmanın makine parkı yönetimi. Üstte kapasite formu
// (aylık tonaj + fason açık + not), altında makine listesi (satıra dokun →
// düzenle, çöp → sil). Ekleme/düzenleme ayrı ekranda (MachineForm).

const NUMBER_PATTERN = /^\d+([.,]\d+)?$/;

export function MachineParkScreen({ navigation }: Props) {
  const { user } = useSession();
  const companyId = user?.companyId ?? null;

  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchCompanyMachines(companyId as string),
    { enabled: !!companyId }
  );

  const [tons, setTons] = useState('');
  const [contractOpen, setContractOpen] = useState(false);
  const [note, setNote] = useState('');
  // Kapasite formu yalnızca ilk veri gelince dolduruluyor: odak yenilemesi
  // kullanıcının yazdığını silmesin.
  const [filled, setFilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (filled || !data) return;
    setTons(data.capacity.monthlyCapacityTons == null ? '' : toInputNumber(data.capacity.monthlyCapacityTons));
    setContractOpen(data.capacity.contractOpen);
    setNote(data.capacity.note);
    setFilled(true);
  }, [data, filled]);

  const save = useCallback(async () => {
    const trimmed = tons.trim();
    if (trimmed && !NUMBER_PATTERN.test(trimmed)) {
      setFormError('Aylık kapasiteye yalnızca rakam girin (ondalık için virgül).');
      haptics.error();
      return;
    }
    setSaving(true);
    setFormError(null);
    setSaved(false);
    try {
      await saveCapacity({
        monthlyCapacityTons: trimmed ? Number(trimmed.replace(',', '.')) : null,
        note: note.trim(),
        contractOpen,
      });
      haptics.success();
      setSaved(true);
      await reload();
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.code === 'no_company') {
        setFormError('Kapasite firmaya bağlıdır.');
      } else {
        setFormError(friendlyMessage(err, 'Kaydedilemedi, tekrar deneyin.'));
      }
    } finally {
      setSaving(false);
    }
  }, [contractOpen, note, reload, tons]);

  const remove = useCallback(
    async (machine: Machine) => {
      const ok = await confirmAction({
        title: 'Makine silinsin mi?',
        message: `"${machine.kind}" makine parkınızdan silinecek. Fason kapasite aramalarında artık görünmez.`,
        confirmLabel: 'Sil',
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteMachine(machine.id);
        haptics.success();
        await reload();
      } catch (err) {
        haptics.error();
        setFormError(friendlyMessage(err, 'Silinemedi, tekrar deneyin.'));
      }
    },
    [reload]
  );

  if (!companyId) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="business-outline"
          title="Makine parkı firmaya bağlı"
          message="Bir firmaya bağlandığınızda makine parkınızı ve aylık kapasitenizi girebilirsiniz."
        />
      </View>
    );
  }

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="conversation" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Makine parkı alınamadı" onRetry={reload} />
      </View>
    );
  }

  const machines = data?.machines ?? [];
  const sections = groupMachines(machines);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl(refreshing, refresh)}
    >
      <Text style={styles.intro}>
        Makine parkınız ve aylık kapasiteniz firma sayfanızda görünür; fason iş arayan alıcılar buradan sizi bulur.
      </Text>

      <SectionHeader title="Kapasite" first />
      <View style={styles.block}>
        <TextField
          label="Aylık kapasite (ton)"
          value={tons}
          onChangeText={(text) => {
            setTons(text);
            setSaved(false);
          }}
          placeholder="Örn. 120"
          keyboardType="numeric"
        />
        <View style={styles.switchRow}>
          <View style={styles.switchTexts}>
            <Text style={styles.switchLabel}>Fason kapasitesi açık</Text>
            <Text style={styles.switchHint}>Açıkken fason arayanların aramalarında öne çıkarsınız.</Text>
          </View>
          <Switch
            value={contractOpen}
            onValueChange={(value) => {
              haptics.selection();
              setContractOpen(value);
              setSaved(false);
            }}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Fason kapasitesi açık"
          />
        </View>
        <TextField
          label="Not"
          value={note}
          onChangeText={(text) => {
            setNote(text);
            setSaved(false);
          }}
          placeholder="Örn. Ekim ortasından itibaren boş kapasite"
          maxLength={300}
          multiline
        />
        {formError ? <InlineError message={formError} style={styles.formBanner} /> : null}
        {saved && !formError ? <Text style={styles.savedNote}>Kapasite bilgisi kaydedildi.</Text> : null}
        <View style={styles.saveWrap}>
          <PrimaryButton label={saving ? 'Kaydediliyor...' : 'Kaydet'} onPress={() => void save()} disabled={saving} />
        </View>
      </View>

      <SectionHeader title="Makineler" count={data?.totalCount ?? 0} />
      <View style={styles.block}>
        <Pressable
          onPress={() => navigation.navigate('MachineForm')}
          accessibilityRole="button"
          accessibilityLabel="Makine ekle"
          android_ripple={{ color: colors.pressed }}
          style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text style={styles.addLabel}>Makine ekle</Text>
        </Pressable>
      </View>

      {machines.length ? (
        sections.map((section) => (
          <View key={section.group}>
            <SectionHeader title={section.label} count={section.count} />
            <View style={styles.block}>
              {section.items.map((machine, index) => (
                <View key={machine.id} style={[styles.row, index < section.items.length - 1 && styles.divider]}>
                  <Pressable
                    onPress={() => navigation.navigate('MachineForm', { machineId: machine.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${machine.kind}, ${machine.count} adet. Düzenle`}
                    android_ripple={{ color: colors.pressed }}
                    style={({ pressed }) => [styles.rowTexts, pressed && styles.pressed]}
                  >
                    <Text style={styles.rowTitle}>
                      {machine.kind}
                      <Text style={styles.rowCount}>{`  × ${machine.count}`}</Text>
                    </Text>
                    {machineSummary(machine) ? <Text style={styles.rowSummary}>{machineSummary(machine)}</Text> : null}
                    {machine.note ? <Text style={styles.rowNote}>{machine.note}</Text> : null}
                  </Pressable>
                  {/* Çöp ikonu satırın YANINDA: web'de iç içe düğme olmasın. */}
                  <Pressable
                    onPress={() => void remove(machine)}
                    accessibilityRole="button"
                    accessibilityLabel={`Sil: ${machine.kind}`}
                    hitSlop={8}
                    style={({ pressed }) => [styles.removeButton, pressed && styles.iconPressed]}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.block}>
          <EmptyState
            compact
            icon="hardware-chip-outline"
            title="Henüz makine eklenmedi"
            message="Makinelerinizi girdiğinizde fason iş arayanlar sizi pus, fayn ve çalışma enine göre bulabilir."
            actionLabel="Makine ekle"
            onAction={() => navigation.navigate('MachineForm')}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  intro: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  block: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter },
  formBanner: { marginBottom: spacing.sm },
  savedNote: { ...typography.caption, color: colors.success, marginBottom: spacing.sm },
  saveWrap: { paddingBottom: spacing.gutter },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    marginBottom: spacing.md,
  },
  switchTexts: { flex: 1, gap: 2 },
  switchLabel: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  switchHint: { ...typography.caption, color: colors.textMuted },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH + 8,
    marginHorizontal: -spacing.gutter,
    paddingHorizontal: spacing.gutter,
  },
  addLabel: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  pressed: { backgroundColor: colors.pressed },
  iconPressed: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -spacing.gutter, paddingRight: spacing.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowTexts: {
    flex: 1,
    gap: 2,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  rowTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  rowCount: { fontFamily: fonts.monoSemibold },
  rowSummary: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  rowNote: { ...typography.caption, color: colors.textMuted },
  removeButton: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
