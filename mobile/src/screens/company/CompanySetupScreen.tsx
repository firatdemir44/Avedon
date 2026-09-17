import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Platform, Share, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { ChipSelect } from '../../components/ChipSelect';
import { PhotoGridEditor } from '../../components/PhotoGridEditor';
import { PrimaryButton } from '../../components/PrimaryButton';
import { CompanyLogoPicker } from '../../components/CompanyLogoPicker';
import { SkeletonDetail } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
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
import { MIN_TOUCH, colors, radius, spacing, typography } from '../../theme';

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
  const { user } = useSession();
  const companyId = user?.companyId ?? null;
  const insets = useSafeAreaInsets();

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
          ? 'Bilgileri kontrol edin: e-posta geçerli bir adres olmalı, kuruluş yılı dört haneli olmalı.'
          : friendlyMessage(err, 'Değişiklikler kaydedilemedi')
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
    const message = `Avedon'da ${name} firmasına katılmak için şirket kodu: ${companyCode}`;
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
        setError('Kod kopyalanamadı; kodu seçip elle kopyalayabilirsiniz.');
      }
      return;
    }
    Share.share({ message }).catch(() => {});
  };

  if (!companyId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <EmptyState
          icon="business-outline"
          title="Firmaya bağlı değilsiniz"
          message="Bu adımlar yalnızca bir firmaya bağlı hesaplarda kullanılır."
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonDetail variant="company" />
      </SafeAreaView>
    );
  }

  if (loadError && !loadedRef.current) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ErrorState error={loadError} fallback="Firma bilgisi alınamadı" onRetry={() => navigation.replace('CompanySetup', route.params)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.progressBlock}>
        <View style={styles.segments}>
          {completeness.steps.map((step, i) => (
            <View
              key={step.key}
              style={[
                styles.segment,
                step.done && styles.segmentDone,
                i === stepIndex && !step.done && styles.segmentCurrent,
              ]}
            />
          ))}
        </View>
        <View style={styles.progressMeta}>
          <Text style={styles.stepCount}>
            {stepIndex + 1} / {COMPANY_SETUP_STEP_ORDER.length}
          </Text>
          <Text style={styles.stepTitle} numberOfLines={1}>
            {completeness.steps[stepIndex].title}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepHint}>{STEP_HINTS[stepKey]}</Text>

        {stepKey === 'tanitim' ? (
          <View>
            <TextField
              label="Hakkında"
              value={about}
              onChangeText={setAbout}
              multiline
              placeholder="Ne ürettiğiniz, aylık kapasiteniz ve öne çıkan özelliğiniz. Örnek: 1998'den beri süprem ve interlok örüyoruz; aylık 120 ton kapasite, OEKO-TEX sertifikalı boyahane."
            />
            <Text style={styles.label}>Şirket tipi</Text>
            <ChipSelect options={TYPE_OPTIONS} value={companyType} onChange={setCompanyType} compact />
            <TextField
              label="Kuruluş yılı"
              value={foundedYear}
              onChangeText={setFoundedYear}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="2002"
            />
          </View>
        ) : null}

        {stepKey === 'iletisim' ? (
          <View>
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
                <TextField
                  label="İlçe / Bölge"
                  value={district}
                  onChangeText={setDistrict}
                  placeholder="Bağcılar"
                  autoCapitalize="words"
                />
              </View>
            </View>
            <TextField label="Adres" value={address} onChangeText={setAddress} multiline placeholder="Cadde, sokak, no" />
            <TextField label="Ana pazarlar" value={mainMarkets} onChangeText={setMainMarkets} placeholder="Avrupa, Türkiye" />
          </View>
        ) : null}

        {stepKey === 'logo' ? (
          <CompanyLogoPicker
            companyName={name}
            preview={logoPreview}
            onError={setError}
            onChange={(dataUrl) => {
              setLogoPreview(dataUrl);
              setLogoChange(dataUrl);
            }}
          />
        ) : null}

        {stepKey === 'fotograflar' ? (
          <View>
            <Text style={styles.label}>
              Firmadan görseller ({gallery.photos.office.length}/{MAX_COMPANY_PHOTOS})
            </Text>
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
            <Text style={[styles.label, styles.sectionGap]}>
              Sertifikalar ve başarılar ({gallery.photos.certificate.length}/{MAX_COMPANY_PHOTOS})
            </Text>
            <Text style={styles.hint}>Kalite belgeleri ve ödüller isteğe bağlı, ama alıcıların güveni için önemli.</Text>
            <PhotoGridEditor
              photos={gallery.photos.certificate}
              max={MAX_COMPANY_PHOTOS}
              busy={gallery.picking === 'certificate'}
              onAdd={() => addPhoto('certificate')}
              onRemove={(key) => gallery.remove('certificate', key)}
              onMoveFirst={(key) => gallery.moveFirst('certificate', key)}
              firstBadge="İlk"
            />
          </View>
        ) : null}

        {stepKey === 'urun' ? (
          <View>
            <Text style={styles.label}>Şirket kodunuz</Text>
            <Text style={styles.companyCode} selectable>
              {companyCode}
            </Text>
            <Text style={styles.hint}>
              Çalışanlarınız kayıt olurken bu kodu girerek firmanıza katılır.
            </Text>
            <PrimaryButton
              label={codeCopied ? 'Kod kopyalandı' : 'Kodu paylaş'}
              variant="outline"
              icon={codeCopied ? 'checkmark' : 'share-outline'}
              onPress={shareCode}
            />

            <Text style={[styles.label, styles.sectionGap]}>İlk ürününüz</Text>
            {productCount > 0 ? (
              <View style={styles.doneRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.doneText}>{productCount} ürününüz var.</Text>
              </View>
            ) : (
              <Text style={styles.hint}>
                Ürünleriniz katalogda aranabilir olur ve firma sayfanızda listelenir.
              </Text>
            )}
            <PrimaryButton
              label={productCount > 0 ? 'Yeni ürün ekleyin' : 'İlk ürününüzü ekleyin'}
              variant={productCount > 0 ? 'outline' : 'primary'}
              icon="add"
              onPress={() => navigation.navigate('AddProduct')}
            />
          </View>
        ) : null}

        {error ? <InlineError message={error} style={styles.error} /> : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: spacing.sm + insets.bottom }]}>
        <PrimaryButton label="Atla" variant="outline" size="lg" onPress={goNext} style={styles.actionButton} />
        <PrimaryButton
          label={saving ? 'Kaydediliyor...' : isLast ? 'Bitir' : 'Kaydet ve devam'}
          size="lg"
          disabled={saving}
          onPress={saveAndContinue}
          style={styles.actionButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  progressBlock: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: radius.sm, backgroundColor: colors.divider },
  segmentDone: { backgroundColor: colors.primary },
  segmentCurrent: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.primary },
  progressMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepCount: { ...typography.mono, color: colors.textMuted },
  stepTitle: { ...typography.subtitle, color: colors.text, flexShrink: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  stepHint: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
  label: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  sectionGap: { marginTop: spacing.lg },
  companyCode: {
    ...typography.monoStrong,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH - 12, marginBottom: spacing.sm },
  doneText: { ...typography.body, color: colors.text },
  error: { marginTop: spacing.md },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  actionButton: { flex: 1 },
});
