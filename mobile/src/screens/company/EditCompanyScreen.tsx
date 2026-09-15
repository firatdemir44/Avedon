import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ApiError, fetchCompany, updateCompany } from '../../api/client';
import { pickCompressedImage } from '../../features/imagePicker';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { companyLogoKey, loadCompanyLogo, setCachedCompanyLogo } from '../../features/companies/companyLogoCache';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import type { VerificationStatus } from '../../types';

type Props = RootStackScreenProps<'EditCompany'>;

const LOGO_SIZE = 96;

export function EditCompanyScreen({ route, navigation }: Props) {
  const { companyId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [originalName, setOriginalName] = useState('');
  const [verification, setVerification] = useState<VerificationStatus>('dogrulanmamis');
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  // Ekranda görünen logo.
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  // undefined: logoya dokunulmadı · string: yeni logo · null: logo kaldırıldı
  const [logoChange, setLogoChange] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchCompany(companyId)
      .then(({ company }) => {
        if (cancelled) return;
        setOriginalName(company.name);
        setVerification(company.verification);
        setName(company.name);
        setAbout(company.about ?? '');
        setContactEmail(company.contactEmail ?? '');
        setContactPhone(company.contactPhone ?? '');
        if (company.logoUpdatedAt) {
          loadCompanyLogo(companyLogoKey(company.id, company.logoUpdatedAt))
            .then((url) => {
              if (!cancelled) setLogoPreview(url);
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Firma bilgisi alınamadı');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const pickLogo = async () => {
    setPickingLogo(true);
    setError(null);
    try {
      // Logo küçük görünür; 400 px genişlik her ekranda net durmaya yetiyor ve
      // dosyayı sunucunun kabul ettiği boyutun çok altında tutuyor.
      const picked = await pickCompressedImage(400, 0.8);
      if (!picked) return;
      setLogoPreview(picked.dataUrl);
      setLogoChange(picked.dataUrl);
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.'
      );
    } finally {
      setPickingLogo(false);
    }
  };

  const removeLogo = () => {
    setLogoPreview(null);
    setLogoChange(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { company } = await updateCompany(companyId, {
        name: name.trim(),
        about: about.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        ...(logoChange !== undefined ? { logo: logoChange } : {}),
      });
      // Yeni logo zaten elimizde; firma sayfasına dönünce tekrar indirilmesin.
      if (typeof logoChange === 'string' && company.logoUpdatedAt) {
        setCachedCompanyLogo(companyLogoKey(company.id, company.logoUpdatedAt), logoChange);
      }
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.code === 'invalid_body') {
        setError('Bilgileri kontrol edin: firma adı en az 2 karakter olmalı, e-posta geçerli bir adres olmalı.');
      } else {
        setError(err instanceof Error ? err.message : 'Değişiklikler kaydedilemedi');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const nameChanged = name.trim() !== originalName;
    // Onaylı rozetin kaybolması kullanıcı açısından geri alınamaz bir sonuç;
    // kaydetmeden önce haber veriyoruz. (Alert.alert web'de hiçbir şey
    // göstermediği için bu uyarı web'de hiç çıkmıyor ve kayıt hiç yapılmıyordu.)
    if (nameChanged && verification === 'dogrulanmis') {
      const confirmed = await confirmAction({
        title: 'Firma adı değişiyor',
        message:
          'Doğrulanmış bir firmanın adı değişince doğrulama yeniden incelemeye alınır ve onay rozeti inceleme bitene kadar kalkar.',
        confirmLabel: 'Devam et',
        destructive: true,
      });
      if (!confirmed) return;
    }
    save();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const initial = name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Logo</Text>
        <View style={styles.logoRow}>
          {logoPreview ? (
            <Image source={{ uri: logoPreview }} style={[styles.logo, styles.logoImage]} resizeMode="cover" />
          ) : (
            <View style={styles.logo}>
              <Text style={styles.logoInitial}>{initial}</Text>
            </View>
          )}
          <View style={styles.logoActions}>
            <PrimaryButton
              label={pickingLogo ? 'İşleniyor...' : logoPreview ? 'Logoyu Değiştir' : 'Logo Seç'}
              variant="secondary"
              disabled={pickingLogo}
              onPress={pickLogo}
            />
            {logoPreview ? <PrimaryButton label="Logoyu Kaldır" variant="secondary" onPress={removeLogo} /> : null}
          </View>
        </View>
        <Text style={styles.hint}>Kare ya da kareye yakın bir logo en iyi sonucu verir. Logo akışta, ürünlerde ve firma sayfanızda görünür.</Text>

        <TextField label="Firma adı" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="organization" textContentType="organizationName" />
        <TextField label="Hakkında" value={about} onChangeText={setAbout} multiline placeholder="Ürettiğiniz kumaşlar, makine parkınız, çalıştığınız pazarlar..." />
        <TextField
          label="İletişim e-postası"
          value={contactEmail}
          onChangeText={setContactEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="ornek@firma.com"
        />
        <TextField
          label="İletişim telefonu"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="0212 000 00 00"
        />
        <Text style={styles.hint}>Bu iletişim bilgileri firma sayfanızda herkese görünür. Vergi numarası ve şirket kodu değiştirilemez.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={saving ? 'Kaydediliyor...' : 'Kaydet'}
          disabled={saving || name.trim().length < 2}
          onPress={handleSave}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  label: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  logoInitial: { fontSize: 40, fontFamily: fonts.bold, color: colors.primaryText },
  logoActions: { flex: 1, gap: spacing.sm },
  error: { ...typography.label, fontFamily: fonts.regular, color: colors.danger, marginBottom: spacing.sm },
});
