// Deneyim ekle/düzenle/sil (yeni tasarım, 4. adım). Devam eden görevde bitiş
// ay/yıl sunucuya HİÇ gönderilmez (sunucu ikisini birlikte bekliyor).
// Kaydet, ekranın tek dolu düğmesi olarak yapışkan alt çubukta; Sil `danger`.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useLayoutEffect, useState } from 'react';
import { View, Text, Switch } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  createMyExperience,
  deleteMyExperience,
  updateMyExperience,
  type UserExperienceInput,
} from '../../api/client';
import { InlineError } from '../../components/StateView';
import { confirmAction } from '../../features/confirm';
import { MONTH_NAMES_SHORT } from '../../features/users/experienceDates';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Chip, ChipRow, Input, Screen, SectionTitle } from '../../ui';

type Props = RootStackScreenProps<'ExperienceForm'>;

const MONTH_OPTIONS = MONTH_NAMES_SHORT.map((label, index) => ({ value: String(index + 1), label }));

export function ExperienceFormScreen({ navigation, route }: Props) {
  const t = useTheme();
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
    <Screen
      contentStyle={{ gap: t.space[4] }}
      sticky={<Button size="lg" label="Kaydet" loading={saving} onPress={save} />}
    >
      <Input label="Görev" value={title} onChangeText={setTitle} placeholder="Genel Müdür" maxLength={80} />
      <Input label="Firma" value={company} onChangeText={setCompany} placeholder="Melide Tekstil" maxLength={120} />

      <View style={{ gap: t.space[2], minWidth: 0 }}>
        <SectionTitle title="Başlangıç" />
        {/* Ay seçimi: çip satırı (yatay kaydırılır, satır kırmaz). */}
        <ChipRow>
          {MONTH_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={option.value === startMonth}
              onPress={() => setStartMonth(option.value)}
            />
          ))}
        </ChipRow>
        <Input
          label="Başlangıç yılı"
          value={startYear}
          onChangeText={(text) => setStartYear(text.replace(/[^0-9]/g, '').slice(0, 4))}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="2001"
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: t.space[3],
          minHeight: t.size.touchMin,
          minWidth: 0,
        }}
      >
        <Text style={[t.type.body16, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>Devam ediyor</Text>
        <Switch
          value={ongoing}
          onValueChange={setOngoing}
          accessibilityLabel="Görev devam ediyor"
          trackColor={{ false: t.colors.lineStrong, true: t.colors.brand }}
          thumbColor={t.colors.surface1}
        />
      </View>

      {!ongoing ? (
        <View style={{ gap: t.space[2], minWidth: 0 }}>
          <SectionTitle title="Bitiş" />
          <ChipRow>
            {MONTH_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={option.value === endMonth}
                onPress={() => setEndMonth(option.value)}
              />
            ))}
          </ChipRow>
          <Input
            label="Bitiş yılı"
            value={endYear}
            onChangeText={(text) => setEndYear(text.replace(/[^0-9]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="2010"
          />
        </View>
      ) : null}

      <Input label="Konum" value={location} onChangeText={setLocation} placeholder="Bursa" maxLength={80} />
      <Input
        label="Açıklama"
        value={description}
        onChangeText={setDescription}
        placeholder="Bu görevde neler yaptınız?"
        multiline
        numberOfLines={4}
        maxLength={600}
      />

      {error ? <InlineError message={error} /> : null}

      {existing ? (
        <Button kind="danger" fullWidth label="Deneyimi sil" disabled={saving} onPress={remove} />
      ) : null}
    </Screen>
  );
}
