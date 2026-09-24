// Firma bilgilerini düzenleme (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri katmanı eskisiyle aynı (fetchCompany / updateCompany, aynı gövde);
// yalnızca görünüm: AppBar + Screen, alanlar `ui/Input`, bölümler `Card`,
// tek dolu "Kaydet" düğmesi yapışkan alt çubukta.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { PhotoGridEditor } from '../../components/PhotoGridEditor';
import { CompanyLogoPicker } from '../../components/CompanyLogoPicker';
import { ApiError, fetchCompany, updateCompany } from '../../api/client';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { companyLogoKey, loadCompanyLogo, setCachedCompanyLogo } from '../../features/companies/companyLogoCache';
import { useCompanyGalleries } from '../../features/companies/useCompanyGalleries';
import { MAX_COMPANY_PHOTOS } from '../../features/companies/limits';
import { MIN_COMPANY_NAME_LENGTH, foundedYearError, foundedYearPayload } from '../../features/companies/validation';
import { COMPANY_TYPES } from '../../features/products/catalog';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import type { VerificationStatus } from '../../types';
import {
  AppBar,
  Button,
  Card,
  Chip,
  ChipRow,
  Icon,
  Input,
  Screen,
  SectionTitle,
  Skeleton,
  SkeletonText,
} from '../../ui';

type Props = RootStackScreenProps<'EditCompany'>;

// Şirket tipi seçenekleri; boş seçenek "belirtilmemiş".
const TYPE_OPTIONS = [{ value: '', label: 'Belirtilmemiş' }, ...COMPANY_TYPES.map((t) => ({ value: t.key, label: t.label }))];

export function EditCompanyScreen({ route, navigation }: Props) {
  const t = useTheme();
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

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
        if (!cancelled) setError(err instanceof Error ? err.message : tr('Firma bilgisi alınamadı'));
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
        setError(tr('Bilgileri kontrol edin: firma adı en az 2 karakter olmalı, e-posta geçerli bir adres olmalı.'));
      } else {
        setError(err instanceof Error ? err.message : tr('Değişiklikler kaydedilemedi'));
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
        title: tr('Firma adı değişiyor'),
        message: tr(
          'Doğrulanmış bir firmanın adı değişince doğrulama yeniden incelemeye alınır ve onay rozeti inceleme bitene kadar kalkar.'
        ),
        confirmLabel: tr('Devam et'),
        destructive: true,
      });
      if (!confirmed) return;
    }
    save();
  };

  const hint = (text: string) => <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>;
  const fieldLabel = (text: string) => <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;

  const banner = error ? (
    <View
      accessibilityRole="alert"
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
      <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{error}</Text>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Firmayı düzenle')} leading="back" onBack={() => navigation.goBack()} />
      {loading ? (
        <Screen>
          <Skeleton height={t.size.thumb} width={t.size.thumb} />
          <SkeletonText lines={4} />
          <SkeletonText lines={3} />
        </Screen>
      ) : (
        <Screen
          sticky={
            <Button
              size="lg"
              label={tr('Kaydet')}
              loading={saving}
              disabled={name.trim().length < MIN_COMPANY_NAME_LENGTH || !!yearError}
              onPress={handleSave}
            />
          }
        >
          {banner}

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('Logo')} />
            <Card>
              <CompanyLogoPicker
                companyName={name}
                preview={logoPreview}
                onError={setError}
                onChange={(dataUrl) => {
                  setLogoPreview(dataUrl);
                  setLogoChange(dataUrl);
                }}
              />
            </Card>
          </View>

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('Firma')} />
            <Input
              label={tr('Firma adı')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="organization"
              textContentType="organizationName"
            />
            <Input
              label={tr('Hakkında')}
              value={about}
              onChangeText={setAbout}
              multiline
              placeholder={tr('Ürettiğiniz kumaşlar, makine parkınız, çalıştığınız pazarlar...')}
            />
            <View style={{ gap: t.space[1] }}>
              {fieldLabel(tr('Şirket tipi'))}
              <ChipRow>
                {TYPE_OPTIONS.map((o) => (
                  <Chip
                    key={o.value || 'bos'}
                    label={tr(o.label)}
                    selected={o.value === companyType}
                    onPress={() => setCompanyType(o.value)}
                  />
                ))}
              </ChipRow>
            </View>
            <View style={{ flexDirection: 'row', gap: t.space[3] }}>
              <Input
                containerStyle={{ flex: 1 }}
                label={tr('Kuruluş yılı')}
                value={foundedYear}
                onChangeText={setFoundedYear}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={4}
                placeholder="2002"
                error={yearError}
              />
              <Input
                containerStyle={{ flex: 1 }}
                label={tr('Ana pazarlar')}
                value={mainMarkets}
                onChangeText={setMainMarkets}
                placeholder={tr('Avrupa, Türkiye')}
              />
            </View>
            {hint(
              tr('Bu bilgiler firma sayfanızdaki "Şirket genel bakışı" bölümünde görünür. Ürün gruplarınız eklediğiniz ürünlerden otomatik çıkar.')
            )}
          </View>

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('İletişim')} />
            <Input
              label={tr('İletişim e-postası')}
              value={contactEmail}
              onChangeText={setContactEmail}
              keyboardType="email-address"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="ornek@firma.com"
            />
            <Input
              label={tr('İletişim telefonu')}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              inputMode="tel"
              autoComplete="tel"
              textContentType="telephoneNumber"
              placeholder="0212 000 00 00"
            />
            <Input
              label={tr('Web sitesi')}
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              keyboardType="url"
              inputMode="url"
              placeholder="www.firmaniz.com"
            />
            <View style={{ flexDirection: 'row', gap: t.space[3] }}>
              <Input
                containerStyle={{ flex: 1 }}
                label={tr('Şehir')}
                value={city}
                onChangeText={setCity}
                placeholder="İstanbul"
                autoCapitalize="words"
              />
              <Input
                containerStyle={{ flex: 1 }}
                label={tr('İlçe / bölge')}
                value={district}
                onChangeText={setDistrict}
                placeholder="Bağcılar"
                autoCapitalize="words"
              />
            </View>
            <Input label={tr('Adres')} value={address} onChangeText={setAddress} multiline placeholder={tr('Cadde, sokak, no')} />
            {hint(
              tr('Bu iletişim bilgileri firma sayfanızda herkese görünür. Vergi numarası ve şirket kodu değiştirilemez.')
            )}
          </View>

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('Firmadan görseller ({n}/{max})', { n: gallery.photos.office.length, max: MAX_COMPANY_PHOTOS })} />
            <Card>
              <View style={{ gap: t.space[3] }}>
                {hint(tr('Ofis, fabrika ve üretim fotoğrafları firma sayfanızda görünür.'))}
                <PhotoGridEditor
                  photos={gallery.photos.office}
                  max={MAX_COMPANY_PHOTOS}
                  busy={gallery.picking === 'office'}
                  onAdd={() => addPhoto('office')}
                  onRemove={(key) => gallery.remove('office', key)}
                  onMoveFirst={(key) => gallery.moveFirst('office', key)}
                  firstBadge={tr('İlk')}
                />
              </View>
            </Card>
          </View>

          <View style={{ gap: t.space[3] }}>
            <SectionTitle
              title={tr('Sertifikalar ve başarılar ({n}/{max})', { n: gallery.photos.certificate.length, max: MAX_COMPANY_PHOTOS })}
            />
            <Card>
              <View style={{ gap: t.space[3] }}>
                {hint(tr('Kalite belgeleri ve ödüller; alıcıların güveni için önemli.'))}
                <PhotoGridEditor
                  photos={gallery.photos.certificate}
                  max={MAX_COMPANY_PHOTOS}
                  busy={gallery.picking === 'certificate'}
                  onAdd={() => addPhoto('certificate')}
                  onRemove={(key) => gallery.remove('certificate', key)}
                  onMoveFirst={(key) => gallery.moveFirst('certificate', key)}
                  firstBadge={tr('İlk')}
                />
              </View>
            </Card>
          </View>
        </Screen>
      )}
    </View>
  );
}
