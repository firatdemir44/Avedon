import React, { useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, StyleSheet } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  createMyExperience,
  deleteMyExperience,
  updateMyExperience,
  type UserExperienceInput,
} from '../../api/client';
import { ChipSelect } from '../../components/ChipSelect';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { InlineError } from '../../components/StateView';
import { confirmAction } from '../../features/confirm';
import { MONTH_NAMES_SHORT } from '../../features/users/experienceDates';
import { colors, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'ExperienceForm'>;

const MONTH_OPTIONS = MONTH_NAMES_SHORT.map((label, index) => ({ value: String(index + 1), label }));

// Deneyim ekle/düzenle/sil (Fırat, 2026-09-22). Devam eden görevde bitiş
// ay/yıl sunucuya HİÇ gönderilmez (sunucu ikisini birlikte bekliyor).
export function ExperienceFormScreen({ navigation, route }: Props) {
  const existing = route.params?.experience;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [company, setCompany] = useState(existing?.company ?? '');
  const [startMonth, setStartMonth] = useState(String(existing?.startMonth ?? new Date().getMonth() + 1));
  const [startYear, setStartYear] = useState(String(existing?.startYear ?? new Date().getFullYear()));
  const [ongoing, setOngoing] = useState(existing ? existing.endYear == null : true);
  const [endMonth, setEndMonth] = useState(String(existing?.endMonth ?? new Date().getMonth() + 1));
  const [endYear, setEndYear] = useState(String(existing?.endYear ?? new Date().getFullYear()));
  const [location, setLocation] = useState(existing?.location ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: existing ? 'Deneyimi Düzenle' : 'Deneyim Ekle' });
  }, [navigation, existing]);

  const save = async () => {
    const start = { month: Number(startMonth), year: Number(startYear) };
    if (!title.trim() || !company.trim()) {
      setError('Görev ve firma alanları zorunlu.');
      return;
    }
    if (!Number.isInteger(start.year) || start.year < 1950 || start.year > 2100) {
      setError('Başlangıç yılı 1950 ile 2100 arasında olmalı.');
      return;
    }
    const end = { month: Number(endMonth), year: Number(endYear) };
    if (!ongoing) {
      if (!Number.isInteger(end.year) || end.year < 1950 || end.year > 2100) {
        setError('Bitiş yılı 1950 ile 2100 arasında olmalı.');
        return;
      }
      if (end.year * 12 + end.month < start.year * 12 + start.month) {
        setError('Bitiş tarihi başlangıçtan önce olamaz.');
        return;
      }
    }

    const body: UserExperienceInput = {
      title: title.trim(),
      company: company.trim(),
      startMonth: start.month,
      startYear: start.year,
      location: location.trim(),
      description: description.trim(),
      ...(ongoing ? {} : { endMonth: end.month, endYear: end.year }),
    };

    setSaving(true);
    setError(null);
    try {
      if (existing) await updateMyExperience(existing.id, body);
      else await createMyExperience(body);
      navigation.goBack();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(
        code === 'too_many_experiences'
          ? 'En fazla 20 deneyim eklenebilir.'
          : code === 'invalid_body'
            ? 'Girilen bilgiler geçersiz, tarihleri kontrol edin.'
            : 'Kaydedilemedi, tekrar deneyin.'
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    // Web'de Alert.alert çalışmıyor; ortak onay yardımcısı kullanılıyor.
    const ok = await confirmAction({
      title: 'Deneyimi sil',
      message: `"${existing.title}" kaydı profilinizden kaldırılacak.`,
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await deleteMyExperience(existing.id);
      navigation.goBack();
    } catch {
      setError('Silinemedi, tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.block}>
        <TextField label="Görev" value={title} onChangeText={setTitle} placeholder="Genel Müdür" maxLength={80} />
        <TextField label="Firma" value={company} onChangeText={setCompany} placeholder="Melide Tekstil" maxLength={120} />

        <Text style={styles.groupLabel}>Başlangıç</Text>
        <ChipSelect options={MONTH_OPTIONS} value={startMonth} onChange={setStartMonth} compact />
        <TextField
          label="Başlangıç yılı"
          value={startYear}
          onChangeText={(text) => setStartYear(text.replace(/[^0-9]/g, '').slice(0, 4))}
          keyboardType="number-pad"
          placeholder="2001"
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Devam ediyor</Text>
          <Switch value={ongoing} onValueChange={setOngoing} />
        </View>

        {!ongoing ? (
          <>
            <Text style={styles.groupLabel}>Bitiş</Text>
            <ChipSelect options={MONTH_OPTIONS} value={endMonth} onChange={setEndMonth} compact />
            <TextField
              label="Bitiş yılı"
              value={endYear}
              onChangeText={(text) => setEndYear(text.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder="2010"
            />
          </>
        ) : null}

        <TextField label="Konum" value={location} onChangeText={setLocation} placeholder="Bursa" maxLength={80} />
        <TextField
          label="Açıklama"
          value={description}
          onChangeText={setDescription}
          placeholder="Bu görevde neler yaptınız?"
          multiline
          maxLength={600}
        />

        {error ? <InlineError message={error} /> : null}

        <PrimaryButton label={saving ? 'Kaydediliyor...' : 'Kaydet'} size="lg" disabled={saving} onPress={save} />
        {existing ? (
          <PrimaryButton label="Sil" variant="outline" size="lg" disabled={saving} onPress={remove} />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, padding: spacing.gutter, gap: spacing.xs },
  groupLabel: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  switchLabel: { ...typography.body, color: colors.text, flex: 1, minWidth: 0 },
});
