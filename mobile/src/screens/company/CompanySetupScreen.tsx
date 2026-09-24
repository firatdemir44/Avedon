// Firma sayfasını tamamlama sihirbazı (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri katmanı eskisiyle aynı (adım başına updateCompany, aynı gövde); yalnızca
// görünüm: AppBar + Screen, adım göstergesi caption12 + ilerleme çubuğu,
// alanlar `ui/Input`, her adımda tek dolu düğme ("Kaydet ve devam" / "Bitir"),
// "Atla" kenarlıklı.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { PhotoGridEditor } from '../../components/PhotoGridEditor';
import { CompanyLogoPicker } from '../../components/CompanyLogoPicker';
import { ErrorState, friendlyMessage } from '../../components/StateView';
import { ApiError, fetchCompany, updateCompany, type UpdateCompanyInput } from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { haptics } from '../../features/haptics';
import { companyLogoKey, loadCompanyLogo, setCachedCompanyLogo } from '../../features/companies/companyLogoCache';
import { useCompanyGalleries } from '../../features/companies/useCompanyGalleries';
import { MAX_COMPANY_PHOTOS } from '../../features/companies/limits';
import { foundedYearError, foundedYearPayload } from '../../features/companies/validation';
import {
  COMPANY_SETUP_STEP_ORDER,
  companyCompleteness,
  isCompanySetupStepKey,
  type CompanySetupStepKey,
} from '../../features/companies/completeness';
import { COMPANY_TYPES } from '../../features/products/catalog';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
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
  Skeleton,
  SkeletonText,
} from '../../ui';

type Props = RootStackScreenProps<'CompanySetup'>;

// Şirket tipi seçenekleri; boş seçenek "belirtilmemiş".
const TYPE_OPTIONS = [{ value: '', label: 'Belirtilmemiş' }, ...COMPANY_TYPES.map((t) => ({ value: t.key, label: t.label }))];

const STEP_HINTS: Record<CompanySetupStepKey, string> = {
  tanitim: 'Alıcılar firma sayfanızda ilk bu bölümü okuyor.',
  iletisim: 'Bu bilgiler firma sayfanızda herkese görünür.',
  logo: 'Logonuz akışta, ürünlerinizde ve firma sayfanızda görünür.',
  fotograflar: 'Fotoğraflar firmanızın gerçekten üretim yaptığını gösterir.',
  urun: 'Son adım: ekibinizi çağırın ve ilk ürününüzü ekleyin.',
};

export function CompanySetupScreen({ route, navigation }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const companyId = user?.companyId ?? null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Firma bilgileri
  const [name, setName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [productCount, setProductCount] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);

  // 1. adım
  const [about, setAbout] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  // 2. adım
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [mainMarkets, setMainMarkets] = useState('');
  // 3. adım
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  // undefined: logoya dokunulmadı · string: yeni logo · null: logo kaldırıldı
  const [logoChange, setLogoChange] = useState<string | null | undefined>(undefined);
  // 4. adım
  const gallery = useCompanyGalleries(companyId ?? '');

  const loadedRef = useRef(false);
  const requestedStep = route.params?.step;

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchCompany(companyId)
      .then(({ company }) => {
        if (cancelled) return;
        setName(company.name);
        setCompanyCode(company.companyCode);
        setProductCount(company.products.length);
        setAbout(company.about ?? '');
        setCompanyType(company.companyType ?? '');
        setFoundedYear(company.foundedYear ? String(company.foundedYear) : '');
        setContactEmail(company.contactEmail ?? '');
        setContactPhone(company.contactPhone ?? '');
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
        // Adım verilmediyse tamamlanmamış ilk adımdan başlanır; hepsi tamamsa
        // baştan (kullanıcı bilgilerini gözden geçirmek için de gelebilir).
        const startKey =
          requestedStep && isCompanySetupStepKey(requestedStep)
            ? requestedStep
            : companyCompleteness({
                about: company.about,
                companyType: company.companyType,
                contactEmail: company.contactEmail,
                contactPhone: company.contactPhone,
                city: company.city,
                logoUpdatedAt: company.logoUpdatedAt,
                officePhotoCount: company.officePhotoCount,
                productCount: company.products.length,
              }).firstIncomplete ?? 'tanitim';
        setStepIndex(Math.max(0, COMPANY_SETUP_STEP_ORDER.indexOf(startKey)));
        loadedRef.current = true;
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // gallery.load kimliği companyId'ye bağlı; bağımlılığa eklenirse yükleme döngüye girer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, requestedStep]);

  // Ürün ekleyip geri dönünce son adımdaki "N ürününüz var" satırı güncellensin.
  // Form alanlarına dokunmuyoruz: yalnızca ürün sayısı tazeleniyor.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!companyId || !loadedRef.current) return;
      fetchCompany(companyId)
        .then(({ company }) => setProductCount(company.products.length))
        .catch(() => {});
    });
    return unsubscribe;
  }, [navigation, companyId]);

  // Canlı ilerleme: kullanıcı alan doldurdukça çubuk hemen doluyor.
  const completeness = companyCompleteness({
    about,
    companyType,
    contactEmail,
    contactPhone,
    city,
    // Logo "var" sayılması için: ya sunucuda vardı ve kaldırılmadı, ya yeni seçildi.
    logoUpdatedAt: logoPreview ? 'var' : null,
    officePhotoCount: gallery.photos.office.length,
    productCount,
  });

  const stepKey = COMPANY_SETUP_STEP_ORDER[stepIndex];
  const isLast = stepIndex === COMPANY_SETUP_STEP_ORDER.length - 1;

  const finish = useCallback(() => {
    // Yığında ayakta olan firma sayfasına GERİ dönülüyor (navigate ikinci bir
    // kopya açardı); sayfa odaklanınca veriyi kendisi tazeliyor.
    try {
      navigation.popTo('CompanyProfile', { companyId: companyId ?? undefined }, { merge: true });
    } catch {
      navigation.navigate('CompanyProfile', { companyId: companyId ?? undefined });
    }
  }, [navigation, companyId]);

  const goNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    setError(null);
    setStepIndex((prev) => Math.min(prev + 1, COMPANY_SETUP_STEP_ORDER.length - 1));
  }, [isLast, finish]);

  // Her adım yalnızca kendi alanlarını gönderir; değişiklik yoksa istek atılmaz.
  const patchForStep = (): UpdateCompanyInput | null => {
    if (stepKey === 'tanitim') {
      return { about: about.trim(), companyType, foundedYear: foundedYearPayload(foundedYear) };
    }
    if (stepKey === 'iletisim') {
      return {
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        website: website.trim(),
        city: city.trim(),
        district: district.trim(),
        address: address.trim(),
        mainMarkets: mainMarkets.trim(),
      };
    }
    if (stepKey === 'logo') {
      return logoChange !== undefined ? { logo: logoChange } : null;
    }
    if (stepKey === 'fotograflar') {
      const payload = gallery.payload();
      return Object.keys(payload).length > 0 ? payload : null;
    }
    return null;
  };

  const saveAndContinue = async () => {
    if (!companyId) return;
    if (stepKey === 'tanitim') {
      const yearError = foundedYearError(foundedYear);
      if (yearError) {
        setError(yearError);
        haptics.error();
        return;
      }
    }
    const patch = patchForStep();
    if (!patch) {
      goNext();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { company } = await updateCompany(companyId, patch);
      if (stepKey === 'logo') {
        if (typeof logoChange === 'string' && company.logoUpdatedAt) {
          setCachedCompanyLogo(companyLogoKey(company.id, company.logoUpdatedAt), logoChange);
        }
        setLogoChange(undefined);
      }
      if (stepKey === 'fotograflar') gallery.commit();
      haptics.success();
      goNext();
    } catch (err) {
      haptics.error();
      setError(
        err instanceof ApiError && err.code === 'invalid_body'
          ? tr('Bilgileri kontrol edin: e-posta geçerli bir adres olmalı, kuruluş yılı dört haneli olmalı.')
          : friendlyMessage(err, tr('Değişiklikler kaydedilemedi'))
      );
    } finally {
      setSaving(false);
    }
  };

  const addPhoto = async (kind: 'office' | 'certificate') => {
    setError(null);
    const message = await gallery.add(kind);
    if (message) setError(message);
  };

  const shareCode = async () => {
    const message = tr('Takyon\'da {name} firmasına katılmak için şirket kodu: {code}', { name, code: companyCode });
    if (Platform.OS === 'web') {
      // Web'de paylaşım penceresi yok: kod panoya kopyalanır.
      const clipboard = (globalThis as { navigator?: { clipboard?: { writeText(text: string): Promise<void> } } })
        .navigator?.clipboard;
      try {
        if (!clipboard) throw new Error('clipboard_yok');
        await clipboard.writeText(companyCode);
        setCodeCopied(true);
        setError(null);
      } catch {
        setError(tr('Kod kopyalanamadı; kodu seçip elle kopyalayabilirsiniz.'));
      }
      return;
    }
    Share.share({ message }).catch(() => {});
  };

  const shell = (children: React.ReactNode, sticky?: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Firma sayfanı tamamla')} leading="back" onBack={() => navigation.goBack()} />
      <Screen sticky={sticky}>{children}</Screen>
    </View>
  );

  if (!companyId) {
    return shell(
      <EmptyState
        icon="business-outline"
        title={tr('Firmaya bağlı değilsiniz')}
        description={tr('Bu adımlar yalnızca bir firmaya bağlı hesaplarda kullanılır.')}
      />
    );
  }

  if (loading) {
    return shell(
      <>
        <Skeleton height={t.space[2]} />
        <SkeletonText lines={2} />
        <SkeletonText lines={4} />
      </>
    );
  }

  if (loadError && !loadedRef.current) {
    return shell(
      <ErrorState
        error={loadError}
        fallback={tr('Firma bilgisi alınamadı')}
        onRetry={() => navigation.replace('CompanySetup', route.params)}
      />
    );
  }

  const hint = (text: string) => <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>;
  const fieldLabel = (text: string) => <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;

  const yearError = stepKey === 'tanitim' ? foundedYearError(foundedYear) : null;

  return shell(
    <>
      {/* Adım göstergesi: ilerleme parçaları + "1 / 5 · Tanıtım" (caption12). */}
      <View style={{ gap: t.space[2] }}>
        <View style={{ flexDirection: 'row', gap: t.space[1] }} accessibilityElementsHidden>
          {completeness.steps.map((step, i) => (
            <View
              key={step.key}
              style={{
                flex: 1,
                height: t.space[1],
                borderRadius: t.radius.full,
                backgroundColor: step.done ? t.colors.brand : i === stepIndex ? t.colors.brandSoft : t.colors.surface2,
                borderWidth: i === stepIndex && !step.done ? 1 : 0,
                borderColor: t.colors.brand,
              }}
            />
          ))}
        </View>
        <Text
          accessibilityRole="header"
          style={[t.type.caption12, { color: t.colors.ink3 }]}
        >{`${stepIndex + 1} / ${COMPANY_SETUP_STEP_ORDER.length} · ${completeness.steps[stepIndex].title}`}</Text>
        <Text style={[t.type.title22, { color: t.colors.ink }]}>{completeness.steps[stepIndex].title}</Text>
        {hint(tr(STEP_HINTS[stepKey]))}
      </View>

      {error ? (
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
      ) : null}

      {stepKey === 'tanitim' ? (
        <View style={{ gap: t.space[3] }}>
          <Input
            label={tr('Hakkında')}
            value={about}
            onChangeText={setAbout}
            multiline
            placeholder={tr('Ne ürettiğiniz, aylık kapasiteniz ve öne çıkan özelliğiniz. Örnek: 1998\'den beri süprem ve interlok örüyoruz; aylık 120 ton kapasite, OEKO-TEX sertifikalı boyahane.')}
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
          <Input
            label={tr('Kuruluş yılı')}
            value={foundedYear}
            onChangeText={setFoundedYear}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={4}
            placeholder="2002"
            error={yearError}
          />
        </View>
      ) : null}

      {stepKey === 'iletisim' ? (
        <View style={{ gap: t.space[3] }}>
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
          <Input label={tr('Ana pazarlar')} value={mainMarkets} onChangeText={setMainMarkets} placeholder={tr('Avrupa, Türkiye')} />
        </View>
      ) : null}

      {stepKey === 'logo' ? (
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
      ) : null}

      {stepKey === 'fotograflar' ? (
        <>
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
                {hint(tr('Kalite belgeleri ve ödüller isteğe bağlı, ama alıcıların güveni için önemli.'))}
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
        </>
      ) : null}

      {stepKey === 'urun' ? (
        <>
          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('Şirket kodunuz')} />
            <Card>
              <View style={{ gap: t.space[3] }}>
                <Text selectable style={[t.type.display28, { color: t.colors.brand, fontFamily: t.type.mono20.fontFamily }]}>
                  {companyCode}
                </Text>
                {hint(tr('Çalışanlarınız kayıt olurken bu kodu girerek firmanıza katılır.'))}
                <Button
                  kind="secondary"
                  fullWidth
                  label={codeCopied ? tr('Kod kopyalandı') : tr('Kodu paylaş')}
                  icon={codeCopied ? 'check' : 'share'}
                  onPress={shareCode}
                />
              </View>
            </Card>
          </View>
          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('İlk ürününüz')} />
            <Card>
              <View style={{ gap: t.space[3] }}>
                {productCount > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                    <Icon name="check" size={t.size.iconSm} color="success" />
                    <Text style={[t.type.body16, { color: t.colors.ink }]}>{tr('{n} ürününüz var.', { n: productCount })}</Text>
                  </View>
                ) : (
                  hint(tr('Ürünleriniz katalogda aranabilir olur ve firma sayfanızda listelenir.'))
                )}
                {/* Ekranda tek dolu düğme alt çubukta; bu eylem kenarlıklı. */}
                <Button
                  kind="secondary"
                  fullWidth
                  label={productCount > 0 ? tr('Yeni ürün ekleyin') : tr('İlk ürününüzü ekleyin')}
                  icon="plus"
                  onPress={() => navigation.navigate('AddProduct')}
                />
              </View>
            </Card>
          </View>
        </>
      ) : null}
    </>,
    <View style={{ flexDirection: 'row', gap: t.space[3] }}>
      <Button kind="secondary" label={tr('Atla')} onPress={goNext} style={{ flex: 1 }} />
      <Button
        label={isLast ? tr('Bitir') : tr('Kaydet ve devam')}
        loading={saving}
        onPress={saveAndContinue}
        style={{ flex: 2 }}
      />
    </View>
  );
}
