// İplik ekleme / düzenleme formu — yeni tasarım (DESIGN.md §2/§3). Veri ve
// doğrulama katmanı (createYarn/updateYarn/deleteProduct, etiketten doldurma,
// gönderilen gövde) AYNEN korunur; yalnızca görünüm: SectionTitle bölümleri,
// ui/Input (birim sağda), Chip/ChipRow, fotoğraf/belge seçiciler Card içinde,
// yapışkan tek dolu "Kaydet". Ham hex / ham px yok: her değer useTheme() token'ı.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, Platform } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  ApiError,
  createYarn,
  deleteProduct,
  extractYarnLabel,
  fetchCertificateImage,
  fetchProduct,
  updateYarn,
  type CertificateInput,
  type NewYarnInput,
  type ProductImageInput,
  type YarnLabelExtractInput,
  type YarnLabelOutcome,
} from '../../api/client';
import { captureCompressedImage, pickCompressedImage, pickCompressedImages } from '../../features/imagePicker';
import {
  getCachedGalleryImage,
  loadGalleryImage,
  replaceCachedProductImages,
} from '../../features/products/productImageCache';
import { MAX_CERTIFICATES, MAX_PRODUCT_IMAGES } from '../../features/products/limits';
import { PRICE_CURRENCIES } from '../../features/products/catalog';
import { CERTIFICATES, FIBERS } from '../../features/products/glossaryLabels';
import { CompositionEditor } from '../../components/passport/CompositionEditor';
import { CertificatesEditor } from '../../components/passport/CertificatesEditor';
import {
  certificateDateInvalid,
  certificateIncomplete,
  certificateInputs,
  certificateRowsFrom,
  compositionItems,
  compositionRowsFrom,
  compositionState,
  emptyCertificateRow,
  emptyCompositionRow,
  newKey,
  withCertificateImage,
  type CertificateRow,
  type CompositionRow,
} from '../../components/passport/rows';
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
import { useTheme } from '../../theme/ThemeContext';
import { locale, tr } from '../../i18n';
import {
  AppBar,
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  Icon,
  Input,
  ListRow,
  Screen,
  SectionTitle,
  Skeleton,
  SkeletonText,
} from '../../ui';
import { ErrorBanner } from '../products/FavoriteProductsScreen';

// Sayısal alan: ondalık klavye (DESIGN.md §3 giriş alanı).
const numericProps = { inputMode: 'decimal', keyboardType: 'decimal-pad' } as const;

/** Tek seçimli çip satırı. */
function SingleChips({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <ChipRow>
      {options.map((o) => (
        <Chip
          key={o.value || '__none'}
          label={o.label}
          selected={o.value === value}
          onPress={() => {
            haptics.selection();
            onChange(o.value);
          }}
        />
      ))}
    </ChipRow>
  );
}

/** Çok seçimli çip satırı. */
function MultiChips({
  options,
  values,
  onChange,
}: {
  options: readonly { key: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <ChipRow>
      {options.map((o) => {
        const selected = values.includes(o.key);
        return (
          <Chip
            key={o.key}
            label={o.label}
            icon={selected ? 'check' : undefined}
            selected={selected}
            onPress={() => {
              haptics.selection();
              onChange(selected ? values.filter((v) => v !== o.key) : [...values, o.key]);
            }}
          />
        );
      })}
    </ChipRow>
  );
}

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

const PHOTO_SIZE = 96;

const CURRENCY_OPTIONS = PRICE_CURRENCIES.map((value) => ({ value: value as string, label: value }));
// Etiket çizim anında çevrilir (modül düzeyinde tr() çağrılmaz).
const twistOptions = () => [
  { value: '', label: tr('Belirtilmemiş') },
  { value: 'S', label: 'S' },
  { value: 'Z', label: 'Z' },
];

// --- Etiketten doldur (iplik) ---
// Sunucu: POST /api/yarns/extract. Fiyat/stok HİÇ gelmez (tasarım gereği).
const MAX_LABEL_IMAGES = 3;
const MAX_LABEL_TEXT = 4000;

const LABEL_WARNINGS: Record<string, string> = {
  composition_total_not_100: 'Karışım toplamı 100 etmiyor; elle kontrol edin.',
  count_unit_missing: 'Numaranın birimi okunamadı.',
};

function labelErrorMessage(err: unknown) {
  const code = err instanceof ApiError ? err.code : undefined;
  if (code === 'extract_not_configured') return tr('Etiketten doldurma bu sunucuda etkin değil.');
  if (code === 'extract_input_required') return tr('Okunacak bir fotoğraf ya da metin seçin.');
  if (code === 'unsupported_image') return tr('Bu fotoğraf biçimi okunamıyor, başka bir fotoğraf deneyin.');
  if (code === 'invalid_body') return tr('Gönderilen bilgi okunamadı; fotoğrafı küçültüp tekrar deneyin.');
  if (err instanceof ApiError && err.status === 0) return tr('Etiket okuma zaman aşımına uğradı, tekrar deneyin.');
  return tr('Etiket okunamadı, tekrar deneyin ya da elle girin.');
}

// Özet satırındaki alan adları (dolan alanlar bu adlarla sayılır).
interface LabelSummary {
  recognized: boolean;
  filled: string[];
  warnings: string[];
  notes: string;
  leftovers: string[];
}

// Sunucu hata kodları → ekranda görünen Türkçe metin.
function saveErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'no_company') return tr('İplik eklemek için önce firma bilgilerinizi tamamlayın.');
    if (err.code === 'not_your_company') return tr('Bu iplik başka bir firmaya ait, düzenleyemezsiniz.');
    if (err.code === 'yarn_not_found') return tr('İplik bulunamadı, kaldırılmış olabilir.');
    const fieldErrors = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
    if (fieldErrors?.composition?.includes('composition_total_not_100')) {
      return tr('Karışım oranlarının toplamı 100 olmalı.');
    }
    if (err.code === 'invalid_body') {
      const first = fieldErrors ? Object.keys(fieldErrors)[0] : undefined;
      return first
        ? tr('Bilgilerde eksik ya da hatalı alan var ({field}). Kontrol edip tekrar deneyin.', { field: first })
        : tr('Bilgilerde eksik ya da hatalı alan var. Kontrol edip tekrar deneyin.');
    }
    if (err.status === 0) return tr('Sunucuya ulaşılamadı, tekrar deneyin.');
  }
  return tr('İplik kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.');
}

export function YarnFormScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const t = useTheme();
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
  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Etiketten doldur ---
  // Kaynak seçimi ekran içinde açılır (web'de Alert.alert yok).
  const [labelOpen, setLabelOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelSummary, setLabelSummary] = useState<LabelSummary | null>(null);
  // Varsayılanı olan alanlar (aile, numara birimi, kat) hiçbir zaman "boş"
  // görünmediği için, kullanıcı dokunduysa üzerine yazılmasın diye ayrı izlenir.
  const [familyTouched, setFamilyTouched] = useState(false);
  const [countUnitTouched, setCountUnitTouched] = useState(false);
  const [plyTouched, setPlyTouched] = useState(false);

  useLayoutEffect(() => {
    // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
    navigation.setOptions({ headerShown: false });
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
          // Kayıttan gelen değerlerin üzerine etiket yazmasın.
          setFamilyTouched(true);
          setCountUnitTouched(true);
          setPlyTouched(true);
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

        setCompositionRows(compositionRowsFrom(product.composition ?? []));

        const certificates = product.certificates ?? [];
        setCertificateRows(certificateRowsFrom(certificates));
        setCertificateOpen(certificates.length > 0);
        for (const certificate of certificates) {
          if (!certificate.hasImage) continue;
          fetchCertificateImage(yarnId, certificate.position)
            .then(({ imageUrl }) => {
              if (cancelled) return;
              setCertificateRows((prev) => withCertificateImage(prev, certificate.position, imageUrl));
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
        if (!cancelled) setError(tr('İplik yüklenemedi, lütfen tekrar deneyin.'));
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
    setFamilyTouched(true);
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
          ? tr('Galeriye erişim izni verilmedi.')
          : tr('Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.')
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

  // Karışım ve sertifika satırları ortak bileşenlerde
  // (components/passport/CompositionEditor, CertificatesEditor).

  // --- Etiketten doldur ---
  // Kural: yalnızca formda BOŞ olan alanlar doldurulur; kullanıcının elle
  // girdiği hiçbir değer değiştirilmez. Aile en başta uygulanır, çünkü
  // görünen alanlar (eğirme, filament...) aileye göre değişiyor.
  const applyLabel = (outcome: YarnLabelOutcome) => {
    if (!outcome.recognized) {
      setLabelSummary({ recognized: false, filled: [], warnings: [], notes: '', leftovers: [] });
      return;
    }
    const s = outcome.suggestion;
    const filled: string[] = [];
    const leftovers: string[] = [];

    const fillText = (label: string, value: string, current: string, setter: (v: string) => void) => {
      if (value && !current.trim()) {
        setter(value);
        filled.push(label);
      }
    };
    const fillNumber = (label: string, value: number | null, current: string, setter: (v: string) => void) => {
      if (value != null && !current.trim()) {
        setter(toInputNumber(value));
        filled.push(label);
      }
    };
    const fillOption = (
      label: string,
      value: string,
      current: string,
      list: readonly { key: string }[],
      setter: (v: string) => void
    ) => {
      if (value && !current && list.some((o) => o.key === value)) {
        setter(value);
        filled.push(label);
      }
    };

    // 1) Aile (görünen alanları belirler).
    let nextFamily = family;
    if (s.family && !familyTouched && options.families.some((o) => o.key === s.family)) {
      nextFamily = s.family;
      setFamily(s.family);
      setFamilyTouched(true);
      filled.push(tr('iplik çeşidi'));
    }
    const nextFields = yarnFields(nextFamily);

    fillText(tr('kod'), s.code, code, setCode);
    fillNumber(tr('numara'), s.count, count, setCount);
    if (s.countUnit && !countUnitTouched && options.countUnits.some((o) => o.key === s.countUnit)) {
      setCountUnit(s.countUnit);
      setCountUnitTouched(true);
      filled.push(tr('numara birimi'));
    }
    if (s.ply != null && !plyTouched) {
      setPly(String(s.ply));
      setPlyTouched(true);
      filled.push(tr('kat'));
    }

    if (nextFields.staple) {
      fillOption(tr('eğirme sistemi'), s.spinning, spinning, options.spinnings, setSpinning);
      fillOption(tr('penye / karde'), s.combing, combing, options.combings, setCombing);
      if (s.twistDirection && !twistDirection) {
        setTwistDirection(s.twistDirection);
        filled.push(tr('büküm yönü'));
      }
      fillNumber(tr('büküm (T/m)'), s.twistTpm, twistTpm, setTwistTpm);
    }
    if (nextFields.filament) {
      fillNumber(tr('filament sayısı'), s.filaments, filaments, setFilaments);
      fillOption(tr('filament tipi'), s.filamentType, filamentType, options.filamentTypes, setFilamentType);
      fillOption(tr('parlaklık'), s.luster, luster, options.lusters, setLuster);
    }

    fillOption(tr('renk durumu'), s.colorState, colorState, options.colorStates, setColorState);
    fillText(tr('renk'), s.color, color, setColor);
    fillText(tr('çeşit / yapı'), s.variety, variety, setVariety);
    fillText(tr('marka'), s.brand, brand, setBrand);
    fillText(tr('menşe'), s.origin, origin, setOrigin);
    fillNumber(tr('bobin ağırlığı'), s.coneWeightKg, coneWeightKg, setConeWeightKg);

    // Karışım: formda dolu satır varsa hiç dokunulmaz.
    const hasComposition = compositionRows.some((row) => row.fiber || row.percent.trim());
    const newComposition = s.composition.filter((item) => FIBERS.some((f) => f.key === item.fiber));
    if (!hasComposition && newComposition.length) {
      setCompositionRows(compositionRowsFrom(newComposition));
      filled.push(tr('karışım'));
    } else if (s.compositionText && (hasComposition || !newComposition.length)) {
      leftovers.push(tr('Karışım metni forma aktarılmadı: {text}', { text: s.compositionText }));
    }

    // Sertifikalar: formda satır varsa dokunulmaz.
    const knownCertificates = s.certificates.filter((key) => CERTIFICATES.some((c) => c.key === key));
    if (!certificateRows.length && knownCertificates.length) {
      setCertificateRows(knownCertificates.slice(0, MAX_CERTIFICATES).map((name) => ({ ...emptyCertificateRow(), name })));
      setCertificateOpen(true);
      filled.push(tr('sertifikalar'));
    } else if (s.certificatesText && (certificateRows.length || !knownCertificates.length)) {
      leftovers.push(tr('Sertifika metni forma aktarılmadı: {text}', { text: s.certificatesText }));
    }

    setLabelSummary({
      recognized: true,
      filled,
      warnings: outcome.warnings.map((w) => (LABEL_WARNINGS[w] ? tr(LABEL_WARNINGS[w]) : w)),
      notes: outcome.notes,
      leftovers,
    });
  };

  const runLabelExtract = async (input: YarnLabelExtractInput) => {
    setLabelOpen(false);
    setExtracting(true);
    setLabelError(null);
    setLabelSummary(null);
    try {
      const outcome = await extractYarnLabel(input);
      haptics.success();
      setPasteOpen(false);
      setPasteText('');
      applyLabel(outcome);
    } catch (err) {
      haptics.error();
      setLabelError(labelErrorMessage(err));
    } finally {
      setExtracting(false);
    }
  };

  const labelFromCamera = async () => {
    setLabelError(null);
    try {
      const picked = await captureCompressedImage();
      if (!picked) return;
      await runLabelExtract({ images: [picked.dataUrl] });
    } catch (err) {
      setLabelError(
        err instanceof Error && err.message === 'camera_permission_denied'
          ? tr('Kameraya erişim izni verilmedi.')
          : tr('Fotoğraf işlenemedi, lütfen tekrar deneyin.')
      );
    }
  };

  const labelFromGallery = async () => {
    setLabelError(null);
    try {
      const picked = await pickCompressedImages(MAX_LABEL_IMAGES);
      if (!picked.length) return;
      await runLabelExtract({ images: picked.map((image) => image.dataUrl) });
    } catch (err) {
      setLabelError(
        err instanceof Error && err.message === 'permission_denied'
          ? tr('Galeriye erişim izni verilmedi.')
          : tr('Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.')
      );
    }
  };

  const labelFromText = async () => {
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    await runLabelExtract({ text: trimmed.slice(0, MAX_LABEL_TEXT) });
  };

  // --- Doğrulama ---
  const countNum = parseNumber(count);
  const stockNum = stock.trim() ? parseNumber(stock) : 0;
  const {
    valid: validCompositionRows,
    total: compositionTotal,
    incomplete: compositionIncomplete,
  } = compositionState(compositionRows);
  // Sunucu karışım verilmişse toplamı 100 istiyor (400 composition_total_not_100).
  const compositionTotalWrong = validCompositionRows.length > 0 && Math.abs(compositionTotal - 100) > 0.5;

  const formErrors: string[] = [];
  if (compositionIncomplete) formErrors.push(tr('Karışım satırlarında lif ve oranı birlikte doldurun (oran 0 ile 100 arası).'));
  if (compositionTotalWrong) formErrors.push(tr('Karışım toplamı %{total}; 100 olmalı.', { total: compositionTotal.toLocaleString(locale(), { maximumFractionDigits: 2 }) }));
  if (certificateIncomplete(certificateRows)) formErrors.push(tr('Her sertifika satırında bir sertifika adı seçin.'));
  if (certificateDateInvalid(certificateRows)) formErrors.push(tr('Sertifika geçerlilik tarihini YYYY-AA-GG biçiminde yazın (örn. 2027-03-01).'));

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
    const certificates: CertificateInput[] = certificateInputs(certificateRows);
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
      composition: compositionItems(validCompositionRows),
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
      title: tr('İpliği sil'),
      message: tr('{name} silinsin mi? İpliğe gelen numune talepleri de silinir.', { name: code || tr('Bu iplik') }),
      confirmLabel: tr('Sil'),
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
      setError(tr('İplik silinemedi, lütfen tekrar deneyin.'));
      setDeleting(false);
    }
  };
  const title = isEditing ? tr('İpliği düzenle') : tr('İplik ekle');
  const subLabel = (text: string) => <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;
  const hint = (text: string) => <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>;
  const none = { value: '', label: tr('Belirtilmemiş') };
  const half = { flex: 1, minWidth: 0 } as const;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        <AppBar title={title} leading="back" onBack={() => navigation.goBack()} />
        <Screen>
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Skeleton width={PHOTO_SIZE} height={PHOTO_SIZE} />
            <Skeleton width={PHOTO_SIZE} height={PHOTO_SIZE} />
          </View>
          <SkeletonText lines={3} />
          <SkeletonText lines={4} />
        </Screen>
      </View>
    );
  }

  const photoTile = (photo: PhotoItem, index: number) => (
    <View key={photo.key} style={{ width: PHOTO_SIZE, height: PHOTO_SIZE }}>
      <Pressable
        onPress={() => index > 0 && makeCover(photo.key)}
        disabled={index === 0}
        // Kaldır düğmesiyle kardeş: web'de iç içe <button> olmasın.
        accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
        accessibilityLabel={index === 0 ? tr('Fotoğraf {n}, kapak', { n: index + 1 }) : tr('Fotoğraf {n}, kapak yap', { n: index + 1 })}
        style={({ pressed }) => [
          {
            width: PHOTO_SIZE,
            height: PHOTO_SIZE,
            borderRadius: t.radius.sm,
            borderWidth: 1,
            borderColor: t.colors.line,
            backgroundColor: t.colors.surface2,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          },
          pressed && { opacity: 0.8 },
        ]}
      >
        {photo.uri ? (
          <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <ActivityIndicator color={t.colors.ink3} />
        )}
      </Pressable>
      {index === 0 ? (
        <View style={{ position: 'absolute', left: t.space[1], bottom: t.space[1] }} pointerEvents="none">
          <Badge kind="info" label={tr('Kapak')} />
        </View>
      ) : null}
      <Pressable
        onPress={() => removePhoto(photo.key)}
        hitSlop={t.space[2]}
        accessibilityRole="button"
        accessibilityLabel={tr('Fotoğraf {n}, kaldır', { n: index + 1 })}
        style={({ pressed }) => ({
          position: 'absolute',
          top: t.space[1],
          right: t.space[1],
          width: t.size.iconSm + t.space[2],
          height: t.size.iconSm + t.space[2],
          borderRadius: t.radius.full,
          backgroundColor: pressed ? t.colors.danger : t.colors.overlay,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <Icon name="x" size={t.size.iconXs} color="onBrand" />
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={title} leading="back" onBack={() => navigation.goBack()} />
      <Screen
        sticky={
          <Button
            size="lg"
            label={isEditing ? tr('Değişiklikleri kaydet') : tr('İpliği kaydet')}
            loading={submitting}
            disabled={!canSubmit || deleting}
            onPress={() => void handleSubmit()}
          />
        }
      >
        {/* Fotoğraflar */}
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={tr('Fotoğraflar ({n}/{max})', { n: photos.length, max: MAX_PRODUCT_IMAGES })} />
          <Card style={{ gap: t.space[3] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {photos.map(photoTile)}
              {photos.length < MAX_PRODUCT_IMAGES ? (
                <Pressable
                  onPress={() => void addPhoto()}
                  disabled={pickingImage}
                  accessibilityRole="button"
                  accessibilityLabel={tr('Fotoğraf ekle')}
                  accessibilityState={{ disabled: pickingImage, busy: pickingImage }}
                  style={({ pressed }) => ({
                    width: PHOTO_SIZE,
                    height: PHOTO_SIZE,
                    borderRadius: t.radius.sm,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: t.colors.lineStrong,
                    backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: t.space[1],
                  })}
                >
                  {pickingImage ? (
                    <ActivityIndicator color={t.colors.brand} />
                  ) : (
                    <>
                      <Icon name="plus" color="brand" />
                      <Text style={[t.type.label14, { color: t.colors.brand }]}>{tr('Fotoğraf')}</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>
            {hint(tr('İlk fotoğraf kapak olur. Başka bir fotoğrafı kapak yapmak için üstüne dokun.'))}
          </Card>
        </View>

        {/* Etiketten doldur */}
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={tr('Etiketten doldur')} />
          <Card style={{ gap: t.space[3] }}>
            {hint(tr('Bobin etiketini okutup formu dolduralım. Yalnızca boş alanlar doldurulur; yazdıkların değişmez.'))}
            <Button
              kind="secondary"
              fullWidth
              icon="scan-outline"
              label={tr('Etiketten doldur')}
              loading={extracting}
              onPress={() => {
                haptics.selection();
                setLabelError(null);
                setLabelOpen((v) => !v);
              }}
            />

            {labelOpen && !extracting ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: t.colors.line,
                  borderRadius: t.radius.md,
                  paddingHorizontal: t.space[3],
                  overflow: 'hidden',
                }}
              >
                {/* Kamera yalnızca telefonda; web'de tarayıcı kamerası yok. */}
                {Platform.OS !== 'web' ? (
                  <ListRow
                    title={tr('Fotoğraf çek')}
                    left={<Icon name="camera" color="brand" />}
                    onPress={() => void labelFromCamera()}
                  />
                ) : null}
                <ListRow
                  title={tr('Galeriden seç')}
                  subtitle={tr('En fazla {n} fotoğraf', { n: MAX_LABEL_IMAGES })}
                  left={<Icon name="images-outline" color="brand" />}
                  onPress={() => void labelFromGallery()}
                />
                <ListRow
                  title={tr('Metin yapıştır')}
                  subtitle={tr('WhatsApp\'tan gelen iplik bilgisi')}
                  left={<Icon name="clipboard-outline" color="brand" />}
                  divider={false}
                  onPress={() => {
                    haptics.selection();
                    setLabelOpen(false);
                    setPasteOpen(true);
                  }}
                />
              </View>
            ) : null}

            {pasteOpen ? (
              <View style={{ gap: t.space[3] }}>
                <Input
                  label={tr('İplik bilgisi')}
                  value={pasteText}
                  onChangeText={setPasteText}
                  placeholder={tr('Bobin etiketindeki ya da WhatsApp\'tan gelen iplik bilgisini yapıştır')}
                  multiline
                  maxLength={MAX_LABEL_TEXT}
                />
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Button
                    kind="secondary"
                    label={tr('Oku')}
                    disabled={!pasteText.trim() || extracting}
                    onPress={() => void labelFromText()}
                    style={{ flex: 1 }}
                  />
                  <Button
                    kind="quiet"
                    label={tr('Kapat')}
                    onPress={() => {
                      haptics.selection();
                      setPasteOpen(false);
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : null}

            {labelSummary && !labelSummary.recognized ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2] }}>
                <Icon name="warning" size={t.size.iconSm} color="warning" />
                <Text style={[t.type.body14, { color: t.colors.warning, flex: 1, minWidth: 0 }]}>
                  {tr('Bu görselde iplik etiketi okunamadı. Etiketi yakından ve net çekip yeniden dene.')}
                </Text>
              </View>
            ) : null}
            {labelSummary?.recognized ? (
              <View
                style={{
                  backgroundColor: t.colors.surface2,
                  borderRadius: t.radius.md,
                  padding: t.space[3],
                  gap: t.space[1],
                }}
              >
                <Text style={[t.type.body14, { color: t.colors.ink }]}>
                  {labelSummary.filled.length
                    ? tr('{n} alan dolduruldu: {list}.', { n: labelSummary.filled.length, list: labelSummary.filled.join(', ') })
                    : tr('Etiket okundu ama formdaki boş alanlara yazılacak yeni bilgi çıkmadı.')}
                </Text>
                {labelSummary.notes ? hint(tr('Etiketten notlar: {notes}', { notes: labelSummary.notes })) : null}
                {labelSummary.leftovers.map((line) => (
                  <Text key={line} style={[t.type.body14, { color: t.colors.ink2 }]}>
                    {line}
                  </Text>
                ))}
                {labelSummary.warnings.map((line) => (
                  <View key={line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2] }}>
                    <Icon name="warning" size={t.size.iconSm} color="warning" />
                    <Text style={[t.type.body14, { color: t.colors.warning, flex: 1, minWidth: 0 }]}>{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {hint(tr('Fiyat ve stok etiketten alınmaz. Kaydetmeden önce alanları kontrol et.'))}
            {labelError ? <ErrorBanner message={labelError} /> : null}
          </Card>
        </View>

        {/* İplik */}
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={tr('İplik')} />
          <Input label={tr('Ürün kodu')} value={code} onChangeText={setCode} placeholder={tr('Örn. IPL-3010')} />
          {subLabel(tr('İplik çeşidi'))}
          <SingleChips options={optionValues(options.families)} value={family} onChange={changeFamily} />

          {fields.freeform ? (
            <Input
              label={tr('Çeşit / yapı')}
              value={variety}
              onChangeText={setVariety}
              placeholder={varietyPlaceholder(family)}
              maxLength={120}
              helper={tr('Fantezi ve gipe ipliklerde yapıyı buraya yaz; alıcılar bu metinle arıyor.')}
            />
          ) : null}

          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <Input
              containerStyle={half}
              label={tr('Numara')}
              unit={options.countUnits.find((o) => o.key === countUnit)?.label ?? countUnit}
              value={count}
              onChangeText={setCount}
              placeholder={tr('Örn. 30')}
              {...numericProps}
            />
            <Input
              containerStyle={half}
              label={tr('Kat')}
              value={ply}
              onChangeText={(value) => {
                setPlyTouched(true);
                setPly(value);
              }}
              placeholder="1"
              inputMode="numeric"
              keyboardType="number-pad"
            />
          </View>
          {subLabel(tr('Numara birimi'))}
          <SingleChips
            options={optionValues(options.countUnits)}
            value={countUnit}
            onChange={(value) => {
              setCountUnitTouched(true);
              setCountUnit(value);
            }}
          />

          {fields.staple ? (
            <>
              {subLabel(tr('Eğirme sistemi'))}
              <SingleChips options={[none, ...optionValues(options.spinnings)]} value={spinning} onChange={setSpinning} />
              {subLabel(tr('Penye / karde'))}
              <SingleChips options={[none, ...optionValues(options.combings)]} value={combing} onChange={setCombing} />
              {subLabel(tr('Büküm yönü'))}
              <SingleChips options={twistOptions()} value={twistDirection} onChange={setTwistDirection} />
              <Input
                label={tr('Büküm (isteğe bağlı)')}
                unit="T/m"
                value={twistTpm}
                onChangeText={setTwistTpm}
                placeholder={tr('Örn. 780')}
                {...numericProps}
              />
            </>
          ) : null}

          {fields.filament ? (
            <>
              <Input
                label={tr('Filament sayısı (isteğe bağlı)')}
                value={filaments}
                onChangeText={setFilaments}
                placeholder={tr('Örn. 48')}
                {...numericProps}
              />
              {subLabel(tr('Filament tipi'))}
              <SingleChips
                options={[none, ...optionValues(options.filamentTypes)]}
                value={filamentType}
                onChange={setFilamentType}
              />
              {subLabel(tr('Parlaklık'))}
              <SingleChips options={[none, ...optionValues(options.lusters)]} value={luster} onChange={setLuster} />
            </>
          ) : null}

          {!fields.freeform ? (
            <Input
              label={tr('Çeşit / yapı (isteğe bağlı)')}
              value={variety}
              onChangeText={setVariety}
              placeholder={varietyPlaceholder(family)}
              maxLength={120}
            />
          ) : null}
        </View>

        {/* Karışım */}
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={tr('Karışım')} />
          <Card>
            <CompositionEditor
              rows={compositionRows}
              onChange={setCompositionRows}
              hint={
                compositionRows.length === 0
                  ? tr('Karışım girersen alıcılar life göre arayabilir. Girersen toplam 100 olmalı.')
                  : undefined
              }
              totalWarning={compositionTotalWrong}
            />
          </Card>
        </View>

        {/* Kullanım ve görünüm */}
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={tr('Kullanım ve görünüm')} />
          {subLabel(tr('Kullanım yeri'))}
          {hint(tr('Birden fazla seçebilirsin; alıcılar bu başlıklarla arıyor.'))}
          <MultiChips options={options.endUses} values={endUses} onChange={setEndUses} />
          {subLabel(tr('Renk durumu'))}
          <SingleChips options={[none, ...optionValues(options.colorStates)]} value={colorState} onChange={setColorState} />
          <Input label={tr('Renk (isteğe bağlı)')} value={color} onChangeText={setColor} placeholder={tr('Örn. Siyah')} maxLength={60} />
          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <Input containerStyle={half} label={tr('Menşe')} value={origin} onChangeText={setOrigin} placeholder={tr('Örn. Türkiye')} maxLength={60} />
            <Input containerStyle={half} label={tr('Marka')} value={brand} onChangeText={setBrand} placeholder={tr('Üretici markası')} maxLength={60} />
          </View>
          <Input
            label={tr('Bobin ağırlığı (isteğe bağlı)')}
            unit="kg"
            value={coneWeightKg}
            onChangeText={setConeWeightKg}
            placeholder={tr('Örn. 1,8')}
            {...numericProps}
          />
        </View>

        {/* Ticari */}
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={tr('Ticari')} />
          {subLabel(tr('Satıcı'))}
          <SingleChips options={[none, ...optionValues(options.sellerRoles)]} value={sellerRole} onChange={setSellerRole} />
          <Input label={tr('Stok')} unit="kg" value={stock} onChangeText={setStock} placeholder={tr('Örn. 4500')} {...numericProps} />
          <Input label={tr('En az sipariş')} unit="kg" value={moq} onChangeText={setMoq} placeholder={tr('Örn. 500')} {...numericProps} />
          <Input
            label={tr('Termin')}
            unit={tr('gün')}
            value={leadTimeDays}
            onChangeText={setLeadTimeDays}
            placeholder={tr('Örn. 15')}
            {...numericProps}
          />
          <Input
            label={tr('Fiyat (kg başına)')}
            unit={`${priceCurrency}/kg`}
            value={priceValue}
            onChangeText={setPriceValue}
            placeholder={tr('Örn. 3,20')}
            helper={tr('Fiyat yalnızca sana görünür. Diğer firmalar iplik sayfasında fiyatı görmez.')}
            {...numericProps}
          />
          {subLabel(tr('Para birimi'))}
          <SingleChips options={CURRENCY_OPTIONS} value={priceCurrency} onChange={setPriceCurrency} />
          <Input label={tr('Not (isteğe bağlı)')} value={note} onChangeText={setNote} placeholder={tr('Örn. Stoktan hemen teslim')} maxLength={500} />
        </View>

        {/* Sertifikalar (açılır bölüm) */}
        <View style={{ gap: t.space[3] }}>
          <SectionTitle
            title={certificateRows.length ? tr('Sertifikalar · {n}', { n: certificateRows.length }) : tr('Sertifikalar')}
            linkLabel={certificateOpen ? tr('Gizle') : tr('Göster')}
            onLinkPress={() => {
              haptics.selection();
              setCertificateOpen((v) => !v);
            }}
          />
          {certificateOpen ? (
            <Card>
              <CertificatesEditor
                rows={certificateRows}
                onChange={setCertificateRows}
                hint={tr('Sertifika eklenen iplikler aramalarda öne çıkar.')}
                onError={setError}
              />
            </Card>
          ) : null}
        </View>

        {!user?.companyId || formErrors.length || error ? (
          <View style={{ gap: t.space[2] }}>
            {!user?.companyId ? (
              <ErrorBanner message={tr('İplik eklemek için önce firma bilgilerini tamamlaman gerekir.')} />
            ) : null}
            {formErrors.map((message) => (
              <ErrorBanner key={message} message={message} />
            ))}
            {error ? <ErrorBanner message={error} /> : null}
          </View>
        ) : null}

        {isEditing ? (
          <Button kind="danger" fullWidth label={tr('İpliği sil')} loading={deleting} onPress={() => void handleDelete()} />
        ) : null}
      </Screen>
    </View>
  );
}
