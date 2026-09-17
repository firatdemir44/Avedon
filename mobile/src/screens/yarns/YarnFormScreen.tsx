import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ChipSelect } from '../../components/ChipSelect';
import { MultiChipSelect } from '../../components/MultiChipSelect';
import { SectionHeader } from '../../components/SectionHeader';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { ListRow } from '../../components/ListRow';
import { useSession } from '../../context/SessionContext';
import {
  ApiError,
  createYarn,
  deleteProduct,
  fetchCertificateImage,
  fetchProduct,
  updateYarn,
  type CertificateInput,
  type NewYarnInput,
  type ProductImageInput,
} from '../../api/client';
import { pickCompressedImage } from '../../features/imagePicker';
import {
  getCachedGalleryImage,
  loadGalleryImage,
  replaceCachedProductImages,
} from '../../features/products/productImageCache';
import { MAX_CERTIFICATES, MAX_COMPOSITION_ROWS, MAX_PRODUCT_IMAGES } from '../../features/products/limits';
import { PRICE_CURRENCIES } from '../../features/products/catalog';
import { CERTIFICATES, FIBERS } from '../../features/products/glossaryLabels';
import {
  optionValues,
  suggestedFiber,
  useYarnOptions,
  varietyPlaceholder,
  yarnFields,
} from '../../features/yarns/catalog';
import { parseNumber, toInputNumber } from '../../features/calculators/parse';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'YarnForm'>;

// İplik ekleme / düzenleme formu (Faz 2, Adım 6). Sade, tek ekran, bölümlü.
// Ürün formundaki (AddProductScreen) kalıplar birebir: fotoğraf ızgarası,
// satır kutuları (kompozisyon, sertifika), ChipSelect'ler, altta sabit
// kaydet çubuğu. Kumaşa özel alanlar (gramaj, en, örgü) burada YOK.

interface PhotoItem {
  key: string;
  uri: string | null;
  dataUrl: string | null;
  existing?: number;
}

interface CompositionRow {
  key: string;
  fiber: string;
  percent: string;
}

type DocImage =
  | { kind: 'none' }
  | { kind: 'existing'; position: number; uri: string | null }
  | { kind: 'new'; uri: string; dataUrl: string };

interface CertificateRow {
  key: string;
  name: string;
  number: string;
  validUntil: string;
  image: DocImage;
}

let rowSeq = 0;
const newKey = (prefix: string) => `${prefix}-${++rowSeq}`;
const emptyCompositionRow = (fiber = ''): CompositionRow => ({ key: newKey('lif'), fiber, percent: fiber ? '100' : '' });
const emptyCertificateRow = (): CertificateRow => ({
  key: newKey('sertifika'),
  name: '',
  number: '',
  validUntil: '',
  image: { kind: 'none' },
});

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

const PHOTO_SIZE = 96;
const DOC_PHOTO_SIZE = 64;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FIBER_OPTIONS = FIBERS.map((f) => ({ value: f.key, label: f.label }));
const CERTIFICATE_OPTIONS = CERTIFICATES.map((c) => ({ value: c.key, label: c.label }));
const CURRENCY_OPTIONS = PRICE_CURRENCIES.map((value) => ({ value: value as string, label: value }));
const TWIST_OPTIONS = [
  { value: '', label: 'Belirtilmemiş' },
  { value: 'S', label: 'S' },
  { value: 'Z', label: 'Z' },
];

// Sunucu hata kodları → ekranda görünen Türkçe metin.
function saveErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'no_company') return 'İplik eklemek için önce firma bilgilerinizi tamamlayın.';
    if (err.code === 'not_your_company') return 'Bu iplik başka bir firmaya ait, düzenleyemezsiniz.';
    if (err.code === 'yarn_not_found') return 'İplik bulunamadı, kaldırılmış olabilir.';
    const fieldErrors = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
    if (fieldErrors?.composition?.includes('composition_total_not_100')) {
      return 'Karışım oranlarının toplamı 100 olmalı.';
    }
    if (err.code === 'invalid_body') {
      const first = fieldErrors ? Object.keys(fieldErrors)[0] : undefined;
      return first
        ? `Bilgilerde eksik ya da hatalı alan var (${first}). Kontrol edip tekrar deneyin.`
        : 'Bilgilerde eksik ya da hatalı alan var. Kontrol edip tekrar deneyin.';
    }
    if (err.status === 0) return 'Sunucuya ulaşılamadı, tekrar deneyin.';
  }
  return 'İplik kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.';
}

export function YarnFormScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const options = useYarnOptions();
  const yarnId = route.params?.yarnId ?? null;
  const isEditing = !!yarnId;

  const [code, setCode] = useState('');
  const [family, setFamily] = useState('pamuk');
  const [count, setCount] = useState('');
  const [countUnit, setCountUnit] = useState('ne');
  const [ply, setPly] = useState('1');
  const [filaments, setFilaments] = useState('');
  const [spinning, setSpinning] = useState('');
  const [combing, setCombing] = useState('');
  const [filamentType, setFilamentType] = useState('');
  const [luster, setLuster] = useState('');
  const [twistDirection, setTwistDirection] = useState('');
  const [twistTpm, setTwistTpm] = useState('');
  const [endUses, setEndUses] = useState<string[]>([]);
  const [colorState, setColorState] = useState('');
  const [color, setColor] = useState('');
  const [variety, setVariety] = useState('');
  const [origin, setOrigin] = useState('');
  const [brand, setBrand] = useState('');
  const [coneWeightKg, setConeWeightKg] = useState('');
  const [sellerRole, setSellerRole] = useState('');
  const [stock, setStock] = useState('');
  const [moq, setMoq] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [priceValue, setPriceValue] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<string>('USD');
  const [note, setNote] = useState('');
  const [compositionRows, setCompositionRows] = useState<CompositionRow[]>([]);
  const [certificateRows, setCertificateRows] = useState<CertificateRow[]>([]);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosDirty, setPhotosDirty] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [pickingDoc, setPickingDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEditing ? 'İpliği Düzenle' : 'İplik Ekle' });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!yarnId) return;
    let cancelled = false;
    fetchProduct(yarnId)
      .then(({ product }) => {
        if (cancelled) return;
        setCode(product.code);
        setStock(toInputNumber(product.stock));
        setNote(product.useArea ?? '');
        setMoq(product.moq == null ? '' : toInputNumber(product.moq));
        setLeadTimeDays(product.leadTimeDays == null ? '' : String(product.leadTimeDays));
        if (product.price) {
          setPriceValue(toInputNumber(product.price.value));
          if (product.price.currency) setPriceCurrency(product.price.currency);
        }

        const spec = product.yarn;
        if (spec) {
          setFamily(spec.family);
          setCount(toInputNumber(spec.count));
          setCountUnit(spec.countUnit);
          setPly(String(spec.ply ?? 1));
          setFilaments(spec.filaments == null ? '' : String(spec.filaments));
          setSpinning(spec.spinning ?? '');
          setCombing(spec.combing ?? '');
          setFilamentType(spec.filamentType ?? '');
          setLuster(spec.luster ?? '');
          setTwistDirection(spec.twistDirection ?? '');
          setTwistTpm(spec.twistTpm == null ? '' : toInputNumber(spec.twistTpm));
          setEndUses(spec.endUses ?? []);
          setColorState(spec.colorState ?? '');
          setColor(spec.color ?? '');
          setVariety(spec.variety ?? '');
          setOrigin(spec.origin ?? '');
          setBrand(spec.brand ?? '');
          setConeWeightKg(spec.coneWeightKg == null ? '' : toInputNumber(spec.coneWeightKg));
          setSellerRole(spec.sellerRole ?? '');
        }

        setCompositionRows(
          (product.composition ?? []).map((item) => ({
            key: newKey('lif'),
            fiber: item.fiber,
            percent: toInputNumber(item.percent),
          }))
        );

        const certificates = product.certificates ?? [];
        setCertificateRows(
          certificates.map((c) => ({
            key: newKey('sertifika'),
            name: c.name,
            number: c.number ?? '',
            validUntil: toDateInput(c.validUntil),
            image: c.hasImage ? { kind: 'existing', position: c.position, uri: null } : { kind: 'none' },
          }))
        );
        setCertificateOpen(certificates.length > 0);
        for (const certificate of certificates) {
          if (!certificate.hasImage) continue;
          fetchCertificateImage(yarnId, certificate.position)
            .then(({ imageUrl }) => {
              if (cancelled) return;
              setCertificateRows((prev) =>
                prev.map((row) =>
                  row.image.kind === 'existing' && row.image.position === certificate.position
                    ? { ...row, image: { ...row.image, uri: imageUrl } }
                    : row
                )
              );
            })
            .catch(() => {});
        }

        const imageCount = product.imageCount ?? (product.hasImage ? 1 : 0);
        setPhotos(
          Array.from({ length: imageCount }, (_, i) => ({
            key: `mevcut-${i}`,
            existing: i,
            dataUrl: null,
            uri: getCachedGalleryImage(yarnId, i) ?? null,
          }))
        );
        for (let i = 0; i < imageCount; i++) {
          if (getCachedGalleryImage(yarnId, i)) continue;
          loadGalleryImage(yarnId, i)
            .then((url) => {
              if (cancelled) return;
              setPhotos((prev) => prev.map((p) => (p.existing === i && !p.uri ? { ...p, uri: url } : p)));
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setError('İplik yüklenemedi, lütfen tekrar deneyin.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [yarnId]);

  const fields = yarnFields(family);

  const changeFamily = (next: string) => {
    haptics.selection();
    setFamily(next);
    // Aileye uymayan alanlar temizlenir ki kayıtta yanlış bilgi gitmesin.
    const nextFields = yarnFields(next);
    if (!nextFields.staple) {
      setSpinning('');
      setCombing('');
    }
    if (!nextFields.filament) {
      setFilaments('');
      setFilamentType('');
      setLuster('');
    }
    // Küçük kolaylık: karışım boşken aileye uyan %100 satır önerilir.
    const fiber = suggestedFiber(next);
    if (fiber && compositionRows.length === 0) setCompositionRows([emptyCompositionRow(fiber)]);
  };

  // --- Fotoğraflar ---
  const addPhoto = async () => {
    if (photos.length >= MAX_PRODUCT_IMAGES) return;
    setPickingImage(true);
    setError(null);
    try {
      const picked = await pickCompressedImage();
      if (!picked) return;
      setPhotos((prev) => [...prev, { key: newKey('yeni'), uri: picked.uri, dataUrl: picked.dataUrl }]);
      setPhotosDirty(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.'
      );
    } finally {
      setPickingImage(false);
    }
  };

  const removePhoto = (key: string) => {
    haptics.selection();
    setPhotos((prev) => prev.filter((p) => p.key !== key));
    setPhotosDirty(true);
  };

  const makeCover = (key: string) => {
    haptics.selection();
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      return target ? [target, ...prev.filter((p) => p.key !== key)] : prev;
    });
    setPhotosDirty(true);
  };

  // --- Karışım satırları ---
  const updateCompositionRow = (key: string, patch: Partial<CompositionRow>) =>
    setCompositionRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addCompositionRow = () => {
    if (compositionRows.length >= MAX_COMPOSITION_ROWS) return;
    haptics.selection();
    setCompositionRows((prev) => [...prev, emptyCompositionRow()]);
  };

  const removeCompositionRow = (key: string) => {
    haptics.selection();
    setCompositionRows((prev) => prev.filter((row) => row.key !== key));
  };

  // --- Sertifika satırları ---
  const updateCertificateRow = (key: string, patch: Partial<CertificateRow>) =>
    setCertificateRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addCertificateRow = () => {
    if (certificateRows.length >= MAX_CERTIFICATES) return;
    haptics.selection();
    setCertificateRows((prev) => [...prev, emptyCertificateRow()]);
  };

  const removeCertificateRow = (key: string) => {
    haptics.selection();
    setCertificateRows((prev) => prev.filter((row) => row.key !== key));
  };

  const addCertificatePhoto = async (key: string) => {
    setPickingDoc(key);
    setError(null);
    try {
      const picked = await pickCompressedImage();
      if (!picked) return;
      updateCertificateRow(key, { image: { kind: 'new', uri: picked.uri, dataUrl: picked.dataUrl } });
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.'
      );
    } finally {
      setPickingDoc(null);
    }
  };

  // --- Doğrulama ---
  const countNum = parseNumber(count);
  const stockNum = stock.trim() ? parseNumber(stock) : 0;
  const filledCompositionRows = compositionRows.filter((row) => row.fiber || row.percent.trim());
  const validCompositionRows = filledCompositionRows.filter(
    (row) => row.fiber && parseNumber(row.percent) > 0 && parseNumber(row.percent) <= 100
  );
  const compositionTotal = validCompositionRows.reduce((sum, row) => sum + parseNumber(row.percent), 0);
  const compositionIncomplete = filledCompositionRows.length !== validCompositionRows.length;
  // Sunucu karışım verilmişse toplamı 100 istiyor (400 composition_total_not_100).
  const compositionTotalWrong = validCompositionRows.length > 0 && Math.abs(compositionTotal - 100) > 0.5;
  const certificateIncomplete = certificateRows.some((row) => !row.name);
  const certificateDateInvalid = certificateRows.some(
    (row) => row.validUntil.trim() && !DATE_PATTERN.test(row.validUntil.trim())
  );

  const formErrors: string[] = [];
  if (compositionIncomplete) formErrors.push('Karışım satırlarında lif ve oranı birlikte doldurun (oran 0 ile 100 arası).');
  if (compositionTotalWrong) formErrors.push(`Karışım toplamı %${compositionTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}; 100 olmalı.`);
  if (certificateIncomplete) formErrors.push('Her sertifika satırında bir sertifika adı seçin.');
  if (certificateDateInvalid) formErrors.push('Sertifika geçerlilik tarihini YYYY-AA-GG biçiminde yazın (örn. 2027-03-01).');

  const canSubmit =
    !!user?.companyId &&
    code.trim().length > 0 &&
    !!family &&
    count.trim().length > 0 &&
    countNum > 0 &&
    !!countUnit &&
    formErrors.length === 0;

  const payload = (): NewYarnInput => {
    const plyNum = Math.min(12, Math.max(1, Math.round(parseNumber(ply) || 1)));
    const filamentsNum = fields.filament && filaments.trim() ? Math.round(parseNumber(filaments)) : null;
    const twistNum = fields.staple && twistTpm.trim() ? parseNumber(twistTpm) : null;
    const coneNum = coneWeightKg.trim() ? parseNumber(coneWeightKg) : null;
    const moqNum = moq.trim() ? parseNumber(moq) : null;
    const leadNum = leadTimeDays.trim() ? Math.round(parseNumber(leadTimeDays)) : null;
    const priceNum = priceValue.trim() ? parseNumber(priceValue) : null;
    const certificates: CertificateInput[] = certificateRows
      .filter((row) => row.name)
      .map((row) => ({
        name: row.name,
        number: row.number.trim(),
        validUntil: row.validUntil.trim() ? row.validUntil.trim() : null,
        image:
          row.image.kind === 'new'
            ? row.image.dataUrl
            : row.image.kind === 'existing'
              ? { existing: row.image.position }
              : null,
      }));
    return {
      code: code.trim(),
      stock: stockNum,
      family,
      count: countNum,
      countUnit,
      ply: plyNum,
      // Aileye uymayan alanlar null / boş gider.
      filaments: filamentsNum && filamentsNum > 0 ? filamentsNum : null,
      spinning: fields.staple ? spinning : '',
      combing: fields.staple ? combing : '',
      filamentType: fields.filament ? filamentType : '',
      luster: fields.filament ? luster : '',
      twistDirection: fields.staple ? (twistDirection as '' | 'S' | 'Z') : '',
      twistTpm: twistNum && twistNum > 0 ? twistNum : null,
      endUses,
      colorState,
      color: color.trim(),
      variety: variety.trim(),
      origin: origin.trim(),
      brand: brand.trim(),
      coneWeightKg: coneNum && coneNum > 0 ? coneNum : null,
      sellerRole,
      composition: validCompositionRows.map((row) => ({ fiber: row.fiber, percent: parseNumber(row.percent) })),
      certificates,
      note: note.trim(),
      moq: moqNum,
      leadTimeDays: leadNum,
      priceValue: priceNum,
      priceCurrency: priceNum == null ? '' : priceCurrency,
    };
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = payload();
      if (isEditing && yarnId) {
        const images: ProductImageInput[] | undefined = photosDirty
          ? photos.map((p) => (p.existing !== undefined ? { existing: p.existing } : p.dataUrl!))
          : undefined;
        await updateYarn(yarnId, images ? { ...body, images } : body);
        if (photosDirty) replaceCachedProductImages(yarnId, photos.map((p) => p.dataUrl ?? p.uri));
      } else {
        const { yarn } = await createYarn({ ...body, images: photos.map((p) => p.dataUrl!) });
        replaceCachedProductImages(yarn.id, photos.map((p) => p.dataUrl));
      }
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(saveErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!yarnId) return;
    const confirmed = await confirmAction({
      title: 'İpliği sil',
      message: `${code || 'Bu iplik'} silinsin mi? İpliğe gelen numune talepleri de silinir.`,
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(yarnId);
      haptics.success();
      const routes = navigation.getState().routes;
      if (routes[routes.length - 2]?.name === 'ProductDetail') navigation.pop(2);
      else navigation.goBack();
    } catch {
      haptics.error();
      setError('İplik silinemedi, lütfen tekrar deneyin.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionHeader title={`Fotoğraflar (${photos.length}/${MAX_PRODUCT_IMAGES})`} first />
        <View style={styles.block}>
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <View key={photo.key} style={styles.photoTile}>
                <Pressable
                  onPress={() => index > 0 && makeCover(photo.key)}
                  disabled={index === 0}
                  // Kaldır düğmesiyle kardeş: web'de iç içe <button> olmasın.
                  accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                  accessibilityLabel={index === 0 ? `Fotoğraf ${index + 1}, kapak` : `Fotoğraf ${index + 1}, kapak yap`}
                  style={({ pressed }) => [styles.photoPress, pressed && styles.photoPressed]}
                >
                  {photo.uri ? (
                    <Image source={{ uri: photo.uri }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photo, styles.photoLoading]}>
                      <ActivityIndicator color={colors.chevron} />
                    </View>
                  )}
                </Pressable>
                {index === 0 ? (
                  <View style={styles.coverBadge} pointerEvents="none">
                    <Text style={styles.coverBadgeText}>Kapak</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => removePhoto(photo.key)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Fotoğraf ${index + 1}, kaldır`}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.removePressed]}
                >
                  <Ionicons name="close" size={16} color={colors.primaryText} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PRODUCT_IMAGES ? (
              <Pressable
                onPress={addPhoto}
                disabled={pickingImage}
                accessibilityRole="button"
                accessibilityLabel="Fotoğraf ekle"
                style={({ pressed }) => [styles.addTile, pressed && styles.photoPressed]}
              >
                {pickingImage ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="add" size={26} color={colors.primary} />
                    <Text style={styles.addTileText}>Fotoğraf</Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.hint}>İlk fotoğraf kapak olur. Başka bir fotoğrafı kapak yapmak için üstüne dokunun.</Text>
        </View>

        <SectionHeader title="İplik" />
        <View style={[styles.block, styles.formBlock]}>
          <TextField label="Ürün Kodu" value={code} onChangeText={setCode} placeholder="Örn. IPL-3010" />
          <Text style={styles.label}>İplik çeşidi</Text>
          <ChipSelect options={optionValues(options.families)} value={family} onChange={changeFamily} compact />

          {fields.freeform ? (
            <>
              <TextField
                label="Çeşit / yapı"
                value={variety}
                onChangeText={setVariety}
                placeholder={varietyPlaceholder(family)}
                maxLength={120}
              />
              <Text style={styles.labelHint}>
                Fantezi ve gipe ipliklerde yapıyı buraya yazın; alıcılar bu metinle arıyor.
              </Text>
            </>
          ) : null}

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <TextField
                label="Numara"
                value={count}
                onChangeText={setCount}
                placeholder="Örn. 30"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.fieldHalf}>
              <TextField label="Kat" value={ply} onChangeText={setPly} placeholder="1" keyboardType="number-pad" />
            </View>
          </View>
          <Text style={styles.label}>Numara birimi</Text>
          <ChipSelect options={optionValues(options.countUnits)} value={countUnit} onChange={setCountUnit} compact />

          {fields.staple ? (
            <>
              <Text style={styles.label}>Eğirme sistemi</Text>
              <ChipSelect
                options={[{ value: '', label: 'Belirtilmemiş' }, ...optionValues(options.spinnings)]}
                value={spinning}
                onChange={setSpinning}
                compact
              />
              <Text style={styles.label}>Penye / karde</Text>
              <ChipSelect
                options={[{ value: '', label: 'Belirtilmemiş' }, ...optionValues(options.combings)]}
                value={combing}
                onChange={setCombing}
                compact
              />
              <Text style={styles.label}>Büküm yönü</Text>
              <ChipSelect options={TWIST_OPTIONS} value={twistDirection} onChange={setTwistDirection} compact />
              <TextField
                label="Büküm (T/m, isteğe bağlı)"
                value={twistTpm}
                onChangeText={setTwistTpm}
                placeholder="Örn. 780"
                keyboardType="numeric"
              />
            </>
          ) : null}

          {fields.filament ? (
            <>
              <TextField
                label="Filament sayısı (isteğe bağlı)"
                value={filaments}
                onChangeText={setFilaments}
                placeholder="Örn. 48"
                keyboardType="numeric"
              />
              <Text style={styles.label}>Filament tipi</Text>
              <ChipSelect
                options={[{ value: '', label: 'Belirtilmemiş' }, ...optionValues(options.filamentTypes)]}
                value={filamentType}
                onChange={setFilamentType}
                compact
              />
              <Text style={styles.label}>Parlaklık</Text>
              <ChipSelect
                options={[{ value: '', label: 'Belirtilmemiş' }, ...optionValues(options.lusters)]}
                value={luster}
                onChange={setLuster}
                compact
              />
            </>
          ) : null}

          {!fields.freeform ? (
            <TextField
              label="Çeşit / yapı (isteğe bağlı)"
              value={variety}
              onChangeText={setVariety}
              placeholder={varietyPlaceholder(family)}
              maxLength={120}
            />
          ) : null}
        </View>

        <SectionHeader title="Karışım" />
        <View style={[styles.block, styles.formBlock]}>
          {compositionRows.length === 0 ? (
            <Text style={styles.labelHint}>
              Karışım girerseniz alıcılar life göre arayabilir. Girerseniz toplam 100 olmalı.
            </Text>
          ) : null}
          {compositionRows.map((row, index) => (
            <View key={row.key} style={styles.rowCard}>
              <View style={styles.rowCardHead}>
                <Text style={styles.rowCardTitle}>{index + 1}. lif</Text>
                <Pressable
                  onPress={() => removeCompositionRow(row.key)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${index + 1}. lif satırını kaldır`}
                  style={({ pressed }) => [styles.rowRemove, pressed && styles.rowRemovePressed]}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
              <ChipSelect
                options={FIBER_OPTIONS}
                value={row.fiber}
                onChange={(fiber) => updateCompositionRow(row.key, { fiber })}
                compact
              />
              <TextField
                label="Oran (%)"
                value={row.percent}
                onChangeText={(percent) => updateCompositionRow(row.key, { percent })}
                placeholder="Örn. 100"
                keyboardType="numeric"
              />
            </View>
          ))}
          {compositionRows.length < MAX_COMPOSITION_ROWS ? (
            <Pressable
              onPress={addCompositionRow}
              accessibilityRole="button"
              accessibilityLabel="Lif satırı ekle"
              style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
            >
              <Ionicons name="add" size={18} color={colors.accent} />
              <Text style={styles.addRowText}>Lif ekle</Text>
            </Pressable>
          ) : null}
          {validCompositionRows.length ? (
            <Text style={[styles.totalText, compositionTotalWrong && styles.totalWarning]}>
              Toplam %{compositionTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
            </Text>
          ) : null}
        </View>

        <SectionHeader title="Kullanım ve görünüm" />
        <View style={[styles.block, styles.formBlock]}>
          <Text style={styles.label}>Kullanım yeri</Text>
          <Text style={styles.labelHint}>Birden fazla seçebilirsiniz; alıcılar bu başlıklarla arıyor.</Text>
          <MultiChipSelect options={options.endUses} values={endUses} onChange={setEndUses} />
          <Text style={styles.label}>Renk durumu</Text>
          <ChipSelect
            options={[{ value: '', label: 'Belirtilmemiş' }, ...optionValues(options.colorStates)]}
            value={colorState}
            onChange={setColorState}
            compact
          />
          <TextField label="Renk (isteğe bağlı)" value={color} onChangeText={setColor} placeholder="Örn. Siyah" maxLength={60} />
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <TextField label="Menşe" value={origin} onChangeText={setOrigin} placeholder="Örn. Türkiye" maxLength={60} />
            </View>
            <View style={styles.fieldHalf}>
              <TextField label="Marka" value={brand} onChangeText={setBrand} placeholder="Üretici markası" maxLength={60} />
            </View>
          </View>
          <TextField
            label="Bobin ağırlığı (kg, isteğe bağlı)"
            value={coneWeightKg}
            onChangeText={setConeWeightKg}
            placeholder="Örn. 1,8"
            keyboardType="numeric"
          />
        </View>

        <SectionHeader title="Ticari" />
        <View style={[styles.block, styles.formBlock]}>
          <Text style={styles.label}>Satıcı</Text>
          <ChipSelect
            options={[{ value: '', label: 'Belirtilmemiş' }, ...optionValues(options.sellerRoles)]}
            value={sellerRole}
            onChange={setSellerRole}
            compact
          />
          <TextField label="Stok (kilogram)" value={stock} onChangeText={setStock} placeholder="Örn. 4500" keyboardType="numeric" />
          <TextField
            label="En az sipariş (kg)"
            value={moq}
            onChangeText={setMoq}
            placeholder="Örn. 500"
            keyboardType="numeric"
          />
          <TextField
            label="Termin (gün)"
            value={leadTimeDays}
            onChangeText={setLeadTimeDays}
            placeholder="Örn. 15"
            keyboardType="numeric"
          />
          <TextField label="Fiyat (kg başına)" value={priceValue} onChangeText={setPriceValue} placeholder="Örn. 3,20" keyboardType="numeric" />
          <Text style={styles.label}>Para birimi</Text>
          <ChipSelect options={CURRENCY_OPTIONS} value={priceCurrency} onChange={setPriceCurrency} compact />
          <Text style={styles.noteBox}>Fiyat yalnızca size görünür. Diğer firmalar iplik sayfasında fiyatı görmez.</Text>
          <TextField label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örn. Stoktan hemen teslim" maxLength={500} />
        </View>

        <CollapsibleSection
          title="Sertifikalar"
          count={certificateRows.length || undefined}
          open={certificateOpen}
          onToggle={() => setCertificateOpen((v) => !v)}
        >
          <View style={[styles.block, styles.formBlock]}>
            {certificateRows.length === 0 ? (
              <Text style={styles.labelHint}>Sertifika eklenen iplikler aramalarda öne çıkar.</Text>
            ) : null}
            {certificateRows.map((row, index) => (
              <View key={row.key} style={styles.rowCard}>
                <View style={styles.rowCardHead}>
                  <Text style={styles.rowCardTitle}>{index + 1}. sertifika</Text>
                  <Pressable
                    onPress={() => removeCertificateRow(row.key)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${index + 1}. sertifika satırını kaldır`}
                    style={({ pressed }) => [styles.rowRemove, pressed && styles.rowRemovePressed]}
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <ChipSelect
                  options={CERTIFICATE_OPTIONS}
                  value={row.name}
                  onChange={(name) => updateCertificateRow(row.key, { name })}
                  compact
                />
                <TextField
                  label="Belge no (isteğe bağlı)"
                  value={row.number}
                  onChangeText={(number) => updateCertificateRow(row.key, { number })}
                  placeholder="Örn. 21.0.12345"
                />
                <TextField
                  label="Geçerlilik tarihi (YYYY-AA-GG, isteğe bağlı)"
                  value={row.validUntil}
                  onChangeText={(validUntil) => updateCertificateRow(row.key, { validUntil })}
                  placeholder="Örn. 2027-03-01"
                  autoCapitalize="none"
                />
                <Text style={styles.label}>Belge fotoğrafı</Text>
                <View style={styles.docRow}>
                  {row.image.kind !== 'none' ? (
                    row.image.uri ? (
                      <Image source={{ uri: row.image.uri }} style={styles.docPhoto} />
                    ) : (
                      <View style={[styles.docPhoto, styles.photoLoading]}>
                        <ActivityIndicator color={colors.chevron} />
                      </View>
                    )
                  ) : (
                    <View style={[styles.docPhoto, styles.docPhotoEmpty]}>
                      <Ionicons name="document-outline" size={20} color={colors.chevron} />
                    </View>
                  )}
                  <View style={styles.docActions}>
                    <PrimaryButton
                      label={pickingDoc === row.key ? 'Seçiliyor...' : row.image.kind === 'none' ? 'Fotoğraf Ekle' : 'Değiştir'}
                      variant="outline"
                      onPress={() => addCertificatePhoto(row.key)}
                      disabled={pickingDoc !== null}
                      accessibilityLabel={`${index + 1}. sertifika belgesi fotoğrafı seç`}
                    />
                    {row.image.kind !== 'none' ? (
                      <PrimaryButton
                        label="Kaldır"
                        variant="outline"
                        onPress={() => {
                          haptics.selection();
                          updateCertificateRow(row.key, { image: { kind: 'none' } });
                        }}
                        accessibilityLabel={`${index + 1}. sertifika belgesi fotoğrafını kaldır`}
                      />
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
            {certificateRows.length < MAX_CERTIFICATES ? (
              <Pressable
                onPress={addCertificateRow}
                accessibilityRole="button"
                accessibilityLabel="Sertifika satırı ekle"
                style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
              >
                <Ionicons name="add" size={18} color={colors.accent} />
                <Text style={styles.addRowText}>Sertifika ekle</Text>
              </Pressable>
            ) : null}
          </View>
        </CollapsibleSection>

        {!user?.companyId ? (
          <Text style={styles.error}>İplik eklemek için önce firma bilgilerinizi tamamlamanız gerekir.</Text>
        ) : null}
        {formErrors.map((message) => (
          <Text key={message} style={styles.error}>
            {message}
          </Text>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isEditing ? (
          <View style={[styles.block, styles.deleteBlock]}>
            <ListRow
              title={deleting ? 'Siliniyor...' : 'İpliği Sil'}
              tone="danger"
              chevron={false}
              divider={false}
              onPress={deleting ? undefined : handleDelete}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <PrimaryButton
          label={submitting ? 'Kaydediliyor...' : isEditing ? 'Değişiklikleri Kaydet' : 'İpliği Kaydet'}
          size="lg"
          disabled={!canSubmit || submitting || deleting}
          onPress={handleSubmit}
          style={styles.actionMain}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface },
  formBlock: { paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.gutter,
  },
  photoTile: { width: PHOTO_SIZE, height: PHOTO_SIZE },
  photoPress: { borderRadius: radius.md, overflow: 'hidden' },
  photoPressed: { opacity: 0.8 },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: radius.md, backgroundColor: colors.surfaceTonal },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  coverBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  coverBadgeText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.primaryText },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,26,34,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePressed: { backgroundColor: colors.danger },
  addTile: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addTileText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  hint: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm },
  label: { ...typography.label, fontFamily: fonts.semibold, color: colors.text, marginBottom: spacing.xs },
  labelHint: { ...typography.caption, color: colors.textMuted, marginTop: -2, marginBottom: spacing.sm },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldHalf: { flex: 1 },
  rowCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  rowCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  rowCardTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  rowRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  rowRemovePressed: { backgroundColor: colors.pressed },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  addRowPressed: { backgroundColor: colors.pressed },
  addRowText: { ...typography.label, color: colors.accent },
  totalText: { ...typography.label, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.md },
  totalWarning: { color: colors.warning },
  noteBox: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceTonal,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  docPhoto: { width: DOC_PHOTO_SIZE, height: DOC_PHOTO_SIZE, borderRadius: radius.md, backgroundColor: colors.surfaceTonal },
  docPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  docActions: { flex: 1, flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  error: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.danger,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  deleteBlock: { marginTop: spacing.lg },
  actionBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  actionMain: { flex: 1 },
});
