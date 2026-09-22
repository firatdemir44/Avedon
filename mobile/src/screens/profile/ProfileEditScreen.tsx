import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, updateMyProfile } from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { InlineError } from '../../components/StateView';
import { colors, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'ProfileEdit'>;

// Profil bilgileri (LinkedIn benzeri başlık, 2026-09-22): başlık, konum,
// hakkında. Kaydedince geri dönülür; profil ekranı odaklanınca kendini yeniler.
export function ProfileEditScreen({ navigation, route }: Props) {
  const [headline, setHeadline] = useState(route.params?.headline ?? '');
  const [location, setLocation] = useState(route.params?.location ?? '');
  const [about, setAbout] = useState(route.params?.about ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateMyProfile({ headline: headline.trim(), location: location.trim(), about: about.trim() });
      navigation.goBack();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_body'
          ? 'Girilen bilgiler çok uzun ya da geçersiz.'
          : 'Kaydedilemedi, tekrar deneyin.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.block}>
        <TextField
          label="Başlık"
          value={headline}
          onChangeText={setHeadline}
          placeholder="Genel Müdür · Melide Tekstil"
          maxLength={120}
        />
        <Text style={styles.hint}>Boş bırakırsanız unvanınız ve firma adınız yazılır.</Text>

        <TextField
          label="Konum"
          value={location}
          onChangeText={setLocation}
          placeholder="Bursa, Türkiye"
          maxLength={80}
        />

        <TextField
          label="Hakkında"
          value={about}
          onChangeText={setAbout}
          placeholder="Kısaca kendinizden ve işinizden bahsedin"
          multiline
          maxLength={1000}
        />

        {error ? <InlineError message={error} /> : null}

        <PrimaryButton label={saving ? 'Kaydediliyor...' : 'Kaydet'} size="lg" disabled={saving} onPress={save} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, padding: spacing.gutter, gap: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.sm },
});
