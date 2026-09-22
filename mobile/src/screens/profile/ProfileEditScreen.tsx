// Profil bilgileri (yeni tasarım, 4. adım): başlık, konum, hakkında.
// Kaydet, ekranın tek dolu düğmesi olarak yapışkan alt çubukta (DESIGN.md §2).
// Kaydedince geri dönülür; profil ekranı odaklanınca kendini yeniler.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, updateMyProfile } from '../../api/client';
import { InlineError } from '../../components/StateView';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Input, Screen } from '../../ui';

type Props = RootStackScreenProps<'ProfileEdit'>;

export function ProfileEditScreen({ navigation, route }: Props) {
  const t = useTheme();
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
    <Screen
      contentStyle={{ gap: t.space[4] }}
      sticky={<Button size="lg" label="Kaydet" loading={saving} onPress={save} />}
    >
      <Input
        label="Başlık"
        value={headline}
        onChangeText={setHeadline}
        placeholder="Genel Müdür · Melide Tekstil"
        maxLength={120}
        helper="Boş bırakırsanız unvanınız ve firma adınız yazılır."
      />

      <Input label="Konum" value={location} onChangeText={setLocation} placeholder="Bursa, Türkiye" maxLength={80} />

      <Input
        label="Hakkında"
        value={about}
        onChangeText={setAbout}
        placeholder="Kısaca kendinizden ve işinizden bahsedin"
        multiline
        // `Input` stil prop'u almıyor; çok satırlı alan numberOfLines ile açılıyor.
        numberOfLines={4}
        maxLength={1000}
      />

      {error ? <InlineError message={error} /> : null}
    </Screen>
  );
}
