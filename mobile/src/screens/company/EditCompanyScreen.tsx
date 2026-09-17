import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { ChipSelect } from '../../components/ChipSelect';
import { PhotoGridEditor } from '../../components/PhotoGridEditor';
import { PrimaryButton } from '../../components/PrimaryButton';
import { CompanyLogoPicker } from '../../components/CompanyLogoPicker';
import { ApiError, fetchCompany, updateCompany } from '../../api/client';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { companyLogoKey, loadCompanyLogo, setCachedCompanyLogo } from '../../features/companies/companyLogoCache';
import { useCompanyGalleries } from '../../features/companies/useCompanyGalleries';
import { MAX_COMPANY_PHOTOS } from '../../features/companies/limits';
import { MIN_COMPANY_NAME_LENGTH, foundedYearError, foundedYearPayload } from '../../features/companies/validation';
import { COMPANY_TYPES } from '../../features/products/catalog';
import { colors, fonts, spacing, typography } from '../../theme';
import type { VerificationStatus } from '../../types';

type Props = RootStackScreenProps<'EditCompany'>;

// Şirket tipi seçenekleri; boş seçenek "belirtilmemiş".
const TYPE_OPTIONS = [{ value: '', label: 'Belirtilmemiş' }, ...COMPANY_TYPES.map((t) => ({ value: t.key, label: t.label }))];

export function EditCompanyScreen({ route, navigation }: Props) {
  const { companyId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [originalName, setOriginalName] = useState('');
  const [verification, setVerification] = useState<VerificationStatus>('dogrulanmamis');
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  // Aşama B: firma sayfasındaki "Şirket genel bakışı" alanları.
  const [companyType, setCompanyType] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [mainMarkets, setMainMarkets] = useState('');
  // Galeriler (Aşama B): ofis/üretim fotoğrafları ve sertifikalar.
  const gallery = useCompanyGalleries(companyId);
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
        setCompanyType(company.companyType ?? '');
        setFoundedYear(company.foundedYear ? String(company.foundedYear) : '');
        setWebsite(company.website ?? '');
        setCity(company.city ?? '');
        setDistrict(company.district ?? '');
        setAddress(company.address ?? '');
        setMainMarkets(company.mainMarkets ?? '');
        gallery.load('office', company.officePhotoCount ?? 0);
        gallery.load('certificate', company.certificatePhotoCount ?? 0);
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
    // gallery.load kimliği companyId'ye bağlı; bağımlılığa eklenirse yükleme döngüye girer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const addPhoto = async (kind: 'office' | 'certificate') => {
    setError(null);
    const message = await gallery.add(kind);
    if (message) setError(message);
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
        companyType,
        foundedYear: foundedYearPayload(foundedYear),
        website: website.trim(),
        city: city.trim(),
        district: district.trim(),
        address: address.trim(),
        mainMarkets: mainMarkets.trim(),
        ...gallery.payload(),
        ...(logoChange !== undefined ? { logo: logoChange } : {}),
      });
      // Yeni logo zaten elimizde; firma sayfasına dönünce tekrar indirilmesin.
      if (typeof logoChange === 'string' && company.logoUpdatedAt) {
        setCachedCompanyLogo(companyLogoKey(company.id, company.logoUpdatedAt), logoChange);
      }
      // Galeri sıraları değişmiş olabilir: önbellekteki eski sıralar atılıyor.
      gallery.commit();
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

  const yearError = foundedYearError(foundedYear);

  const handleSave = async () => {
    if (yearError) {
      setError(yearError);
      haptics.error();
      return;
    }
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Logo</Text>
        <CompanyLogoPicker
          companyName={name}
          preview={logoPreview}
          onError={setError}
          onChange={(dataUrl) => {
            setLogoPreview(dataUrl);
            setLogoChange(dataUrl);
          }}
        />

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
        <TextField
          label="Web sitesi"
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="www.firmaniz.com"
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Şehir" value={city} onChangeText={setCity} placeholder="İstanbul" autoCapitalize="words" />
          </View>
          <View style={styles.half}>
            <TextField label="İlçe / Bölge" value={district} onChangeText={setDistrict} placeholder="Bağcılar" autoCapitalize="words" />
          </View>
        </View>
        <TextField label="Adres" value={address} onChangeText={setAddress} multiline placeholder="Cadde, sokak, no" />
        <Text style={styles.hint}>Bu iletişim bilgileri firma sayfanızda herkese görünür. Vergi numarası ve şirket kodu değiştirilemez.</Text>

        <Text style={styles.label}>Şirket tipi</Text>
        <ChipSelect options={TYPE_OPTIONS} value={companyType} onChange={setCompanyType} compact />
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField
              label="Kuruluş yılı"
              value={foundedYear}
              onChangeText={setFoundedYear}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="2002"
            />
          </View>
          <View style={styles.half}>
            <TextField label="Ana pazarlar" value={mainMarkets} onChangeText={setMainMarkets} placeholder="Avrupa, Türkiye" />
          </View>
        </View>
        <Text style={styles.hint}>
          Bu bilgiler firma sayfanızdaki "Şirket genel bakışı" bölümünde görünür. Ürün gruplarınız eklediğiniz ürünlerden
          otomatik çıkar.
        </Text>

        <Text style={styles.label}>Firmadan görseller ({gallery.photos.office.length}/{MAX_COMPANY_PHOTOS})</Text>
        <Text style={styles.hint}>Ofis, fabrika ve üretim fotoğrafları firma sayfanızda görünür.</Text>
        <PhotoGridEditor
          photos={gallery.photos.office}
          max={MAX_COMPANY_PHOTOS}
          busy={gallery.picking === 'office'}
          onAdd={() => addPhoto('office')}
          onRemove={(key) => gallery.remove('office', key)}
          onMoveFirst={(key) => gallery.moveFirst('office', key)}
          firstBadge="İlk"
        />

        <Text style={[styles.label, styles.sectionGap]}>Sertifikalar ve başarılar ({gallery.photos.certificate.length}/{MAX_COMPANY_PHOTOS})</Text>
        <Text style={styles.hint}>Kalite belgeleri ve ödüller; alıcıların güveni için önemli.</Text>
        <PhotoGridEditor
          photos={gallery.photos.certificate}
          max={MAX_COMPANY_PHOTOS}
          busy={gallery.picking === 'certificate'}
          onAdd={() => addPhoto('certificate')}
          onRemove={(key) => gallery.remove('certificate', key)}
          onMoveFirst={(key) => gallery.moveFirst('certificate', key)}
          firstBadge="İlk"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={saving ? 'Kaydediliyor...' : 'Kaydet'}
          disabled={saving || name.trim().length < MIN_COMPANY_NAME_LENGTH || !!yearError}
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
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  sectionGap: { marginTop: spacing.lg },
  error: { ...typography.label, fontFamily: fonts.regular, color: colors.danger, marginBottom: spacing.sm },
});
