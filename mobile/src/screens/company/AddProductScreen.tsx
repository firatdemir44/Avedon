import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  createProduct,
  deleteProduct,
  extractPassport,
  fetchCertificateImage,
  fetchProduct,
  fetchTestReportImage,
  updateProduct,
  type CertificateInput,
  type ExtractionFieldName,
  type FieldMetaInput,
  type PassportExtractInput,
  type PassportInput,
  type ProductImageInput,
  type TestReportInput,
  type YarnInput,
} from '../../api/client';
import { captureCompressedImage, pickCompressedImage, pickCompressedImages } from '../../features/imagePicker';
import { DocumentPickError, pickPdf } from '../../features/documentPicker';
import type { PassportImport } from '../../features/products/passportImport';
import {
  getCachedGalleryImage,
  loadGalleryImage,
  replaceCachedProductImages,
} from '../../features/products/productImageCache';
import {
  MAX_CERTIFICATES,
  MAX_COMPOSITION_ROWS,
  MAX_PRODUCT_IMAGES,
  MAX_TEST_REPORTS,
  MAX_YARNS,
} from '../../features/products/limits';
import {
  FINISH_TAGS,
  PRICE_CURRENCIES,
  PRODUCT_TYPES,
  STOCK_UNITS,
  STOCK_UNIT_LABELS,
  SUBTYPES,
  TYPE_LABELS,
  USAGES,
  YARN_ROLES,
  YARN_PRODUCT_TYPE,
  YARN_TYPES,
  YARN_UNITS,
  type ProductType,
  type StockUnit,
} from '../../features/products/catalog';
import {
  CERTIFICATES,
  FIBERS,
  WIDTH_MEANINGS,
  WIDTH_MEANING_LABELS,
  WIDTH_TYPES,
  WIDTH_TYPE_LABELS,
  effectiveWidthCm,
} from '../../features/products/glossaryLabels';
import { formatMeasure, parseNumber, toInputNumber } from '../../features/calculators/parse';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'AddProduct'>;

// existing: sunucudaki fotoğrafın eski sırası (kaydederken yeniden yüklenmez).
// dataUrl: yeni seçilen fotoğraf.
interface PhotoItem {
  key: string;
  uri: string | null;
  dataUrl: string | null;
  existing?: number;
}

// Pasaport satırları metin olarak tutuluyor (kullanıcı "15," yazarken
// silinmesin diye); kaydederken sayıya çevriliyor.
interface CompositionRow {
  key: string;
  fiber: string;
  percent: string;
}

interface YarnRow {
  key: string;
  role: string;
  count: string;
  unit: string;
  ply: string;
  yarnType: string;
}

// Belge fotoğrafı üç durumdan biri: yok · sunucudaki eski sıradaki · yeni seçilen.
type DocImage =
  | { kind: 'none' }
  | { kind: 'existing'; position: number; uri: string | null }
  | { kind: 'new'; uri: string; dataUrl: string };

interface CertificateRow {
  key: string;
  name: string;
  number: string;
  // Kullanıcının yazdığı biçim: YYYY-AA-GG (boş bırakılabilir).
  validUntil: string;
  image: DocImage;
}

interface TestReportRow {
  key: string;
  // Serbest metin: laboratuvarın yazdığı test adı listeye sığmıyor olabilir.
  kind: string;
  result: string;
  // Kullanıcının yazdığı biçim: YYYY-AA-GG (boş bırakılabilir).
  testedAt: string;
  image: DocImage;
}

// Test türü için öneri çipleri (serbest metni doldurur, kısıtlamaz).
const TEST_KIND_SUGGESTIONS = [
  'Çekme',
  'Boncuklanma (pilling)',
  'Renk haslığı',
  'Yıkama sonrası boyut değişimi',
  'Gramaj',
  'Patlama mukavemeti',
];

// Sunucudaki testReportSchema ile aynı (backend/src/passport.ts).
const MAX_TEST_KIND_CHARS = 80;
const MAX_TEST_RESULT_CHARS = 200;

const TYPE_OPTIONS = PRODUCT_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }));
const UNIT_OPTIONS = STOCK_UNITS.map((value) => ({
  value,
  label: value === 'm' ? 'Metre (m)' : 'Kilogram (kg)',
}));
// ChipSelect tek seçim; boş değer "belirtilmemiş" demek.
const WIDTH_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Belirtilmemiş' },
  ...WIDTH_TYPES.map((value) => ({ value, label: WIDTH_TYPE_LABELS[value] })),
];
// Tüp ende: girilen en tek yüzün eni mi, yoksa zaten açık en mi. Varsayılan
// seçili değil (boş = belirtilmemiş, hesap eni girilen en olur).
const WIDTH_MEANING_OPTIONS: { value: string; label: string }[] = WIDTH_MEANINGS.map((value) => ({
  value,
  label: WIDTH_MEANING_LABELS[value],
}));
const FIBER_OPTIONS: { value: string; label: string }[] = FIBERS.map((f) => ({ value: f.key, label: f.label }));
const CERTIFICATE_OPTIONS: { value: string; label: string }[] = CERTIFICATES.map((c) => ({
  value: c.key,
  label: c.label,
}));
const YARN_ROLE_OPTIONS: { value: string; label: string }[] = YARN_ROLES.map((r) => ({ value: r.key, label: r.label }));
const YARN_UNIT_OPTIONS: { value: string; label: string }[] = YARN_UNITS.map((u) => ({ value: u.key, label: u.label }));
const YARN_TYPE_OPTIONS: { value: string; label: string }[] = YARN_TYPES.map((t) => ({ value: t.key, label: t.label }));
const MOQ_UNIT_OPTIONS: { value: StockUnit; label: string }[] = [
  { value: 'm', label: 'Metre' },
  { value: 'kg', label: 'Kilogram' },
];
const CURRENCY_OPTIONS: { value: string; label: string }[] = PRICE_CURRENCIES.map((value) => ({
  value,
  label: value,
}));
const PRICE_UNIT_OPTIONS: { value: StockUnit; label: string }[] = [
  { value: 'm', label: 'metre başına' },
  { value: 'kg', label: 'kilogram başına' },
];

const PHOTO_SIZE = 96;
const DOC_PHOTO_SIZE = 64;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Sunucudaki MAX_EXTRACT_IMAGES ile aynı.
const MAX_EXTRACT_IMAGES = 4;
// Sunucudaki MAX_TEXT_CHARS ile aynı.
const MAX_EXTRACT_TEXT = 4000;

// Etiket okuma hataları (sunucu kodları) → ekranda görünen Türkçe metin.
function extractErrorMessage(err: unknown) {
  const code = err instanceof ApiError ? err.code : undefined;
  if (code === 'extract_not_configured') return 'Fotoğraftan doldurma bu sunucuda etkin değil.';
  if (code === 'image_too_large') return 'Fotoğraf çok büyük. Daha küçük bir fotoğraf seçin.';
  if (code === 'document_too_large') return 'PDF çok büyük (en fazla 10 MB).';
  if (code === 'extract_input_required') return 'Okunacak bir fotoğraf, PDF ya da metin seçin.';
  if (err instanceof ApiError && err.status === 0) return 'Etiket okuma zaman aşımına uğradı, tekrar deneyin.';
  return 'Etiket okunamadı, tekrar deneyin ya da elle girin.';
}

let rowSeq = 0;
const newKey = (prefix: string) => `${prefix}-${++rowSeq}`;

const emptyCompositionRow = (): CompositionRow => ({ key: newKey('lif'), fiber: '', percent: '' });
const emptyYarnRow = (): YarnRow => ({ key: newKey('iplik'), role: '', count: '', unit: 'ne', ply: '1', yarnType: '' });
const emptyCertificateRow = (): CertificateRow => ({
  key: newKey('sertifika'),
  name: '',
  number: '',
  validUntil: '',
  image: { kind: 'none' },
});
const emptyTestReportRow = (): TestReportRow => ({
  key: newKey('rapor'),
  kind: '',
  result: '',
  testedAt: '',
  image: { kind: 'none' },
});

// Sunucudan gelen ISO tarihi form alanına: "2027-03-01T00:00:00.000Z" → "2027-03-01".
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

// Eski serbest içerik metnini ("%95 Pamuk %5 Elastan") satırlara böler.
// Yalnızca TÜM parçalar tanınan life oturursa kabul edilir; tanınmayan bir şey
// varsa kullanıcı satırları kendisi doldursun (sunucu da kaydederken deniyor).
function splitCompositionText(text: string): CompositionRow[] {
  const matches = [...text.matchAll(/%\s*(\d+(?:[.,]\d+)?)\s*([^%\d]+)/g)];
  if (!matches.length) return [];
  const rows: CompositionRow[] = [];
  for (const match of matches) {
    const name = match[2].trim().toLocaleLowerCase('tr-TR');
    const fiber = FIBERS.find((f) => f.label.toLocaleLowerCase('tr-TR') === name || f.key === name);
    if (!fiber) return [];
    rows.push({ key: newKey('lif'), fiber: fiber.key, percent: match[1].replace('.', ',') });
  }
  return rows.slice(0, MAX_COMPOSITION_ROWS);
}

// Ürün kartı formu: çoklu fotoğraf, çeşit → alt çeşit, kullanım amaçları,
// metre/kg stok ve kumaş pasaportu (kompozisyon, ticari bilgiler, iplik,
// sertifikalar). Pazar Masası düzeni: gri zemin üstünde başlıklı beyaz
// bloklar, altta sabit kaydet çubuğu.
export function AddProductScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const productId = route.params?.productId ?? null;
  const isEditing = !!productId;
  const scrollRef = useRef<ScrollView>(null);

  const [type, setType] = useState<ProductType>('orme');
  const [subtype, setSubtype] = useState('');
  const [usages, setUsages] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [stock, setStock] = useState('');
  const [stockUnit, setStockUnit] = useState<StockUnit>('m');
  const [weightGsm, setWeightGsm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [content, setContent] = useState('');
  const [useArea, setUseArea] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosDirty, setPhotosDirty] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);
  // Kayıt başarılı ama sunucu makullük uyarısı döndüyse: geri dönmeden önce
  // sarı kutuda gösterilir (web'de Alert.alert hiçbir şey göstermiyor).
  const [savedWarnings, setSavedWarnings] = useState<string[] | null>(null);
  // Uyarı kutusuyla biten YENİ kayıtta ürünün kimliği: "Devam" bunu kullanıp
  // "Akışta paylaşılsın mı?" sorusunu soruyor.
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);

  // --- Pasaport ---
  // Kompozisyon satır kipinde mi, yoksa eski serbest metin kutusunda mı.
  const [compositionRowMode, setCompositionRowMode] = useState(!isEditing);
  const [compositionRows, setCompositionRows] = useState<CompositionRow[]>(
    isEditing ? [] : [emptyCompositionRow()]
  );
  // Fırat (2026-09-17): boyalı/mamul kumaşta en büyük çoğunlukla açık endir; tüp en
  // genellikle yalnızca ham kumaşta olur. Yeni üründe varsayılan "Açık en".
  const [widthType, setWidthType] = useState(productId ? '' : 'acik');
  // Yalnızca "Tüp en" seçiliyken sorulur; varsayılan seçili DEĞİL (otomatik
  // çarpma her zaman doğru değil, Fırat'ın kararı: faz1-plani Adım 4 madde 2).
  const [widthMeaning, setWidthMeaning] = useState('');
  const [finishTags, setFinishTags] = useState<string[]>([]);
  const [moq, setMoq] = useState('');
  const [moqUnit, setMoqUnit] = useState<StockUnit>('m');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [priceValue, setPriceValue] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<string>('TRY');
  const [priceUnit, setPriceUnit] = useState<StockUnit>('m');
  // AB Dijital Ürün Pasaportu'na hazırlık (Faz 3, Adım 7). Yeni üründe hepsi
  // boş; `dppInitial` düzenlemede sunucudan gelen değerleri tutar ki kaydederken
  // yalnızca dolu ya da DEĞİŞEN (temizlenen) alanlar gövdeye girsin.
  const [originCountry, setOriginCountry] = useState('');
  const [recycledPercent, setRecycledPercent] = useState('');
  const [careNotes, setCareNotes] = useState('');
  const [dppOpen, setDppOpen] = useState(false);
  const dppInitial = useRef<{ originCountry: string; careNotes: string; recycledPercent: number | null }>({
    originCountry: '',
    careNotes: '',
    recycledPercent: null,
  });
  const [yarnRows, setYarnRows] = useState<YarnRow[]>([]);
  const [certificateRows, setCertificateRows] = useState<CertificateRow[]>([]);
  const [testReportRows, setTestReportRows] = useState<TestReportRow[]>([]);
  // İplik, Sertifikalar ve Test raporları kapalı gelir (kullanıcı kararı
  // 2026-09-16); ürünün o bölümünde veri varsa açık gelsin.
  const [yarnOpen, setYarnOpen] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [testReportOpen, setTestReportOpen] = useState(false);
  const [pickingDoc, setPickingDoc] = useState<string | null>(null);

  // --- Etiketten doldur (Adım 3) ---
  // Kaynak seçimi ekran içinde açılan beyaz blok (web'de Alert.alert yok).
  const [sourceOpen, setSourceOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  // Çıkarımdan gelip forma aktarılan alanlar: alan → güven. Kullanıcı alanı
  // elle değiştirirse satır düşer (artık çıkarım değeri değil).
  const [extractedFields, setExtractedFields] = useState<Partial<Record<ExtractionFieldName, number>>>({});
  // Çeşit ipucu sunucuya yalnızca kullanıcı gerçekten seçtiyse (ya da mevcut
  // ürün yüklendiyse) gider: varsayılan "Örme" yüzünden etiketteki alt çeşit
  // ("poplin") boşuna elenmesin.
  const [typeChosen, setTypeChosen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Ürünü Düzenle' : 'Ürün Ekle' });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetchProduct(productId)
      .then(({ product }) => {
        if (cancelled) return;
        // İplik bu formla düzenlenmez (YarnFormScreen'e gidilir); yine de
        // yanlışlıkla açılırsa kumaş çeşidi alanı bozulmasın.
        if (product.type !== YARN_PRODUCT_TYPE) setType(product.type);
        setTypeChosen(true);
        setSubtype(product.subtype ?? '');
        setUsages(product.usages ?? []);
        setCode(product.code);
        setStock(toInputNumber(product.stock));
        setStockUnit(product.stockUnit ?? 'm');
        setWeightGsm(toInputNumber(product.weightGsm));
        setWidthCm(toInputNumber(product.widthCm));
        setContent(product.content);
        setUseArea(product.useArea);

        // Kompozisyon satırları varsa satır kipi; yoksa eski metin kutusu kalır.
        const composition = product.composition ?? [];
        if (composition.length) {
          setCompositionRowMode(true);
          setCompositionRows(
            composition.map((item) => ({
              key: newKey('lif'),
              fiber: item.fiber,
              percent: toInputNumber(item.percent),
            }))
          );
        } else {
          setCompositionRowMode(false);
          setCompositionRows([]);
        }

        setWidthType(product.widthType ?? '');
        // Enin anlamı yalnızca tüp ende seçilebiliyor; açık ende zaten 'acik'.
        setWidthMeaning(product.widthType === 'tup' ? (product.widthMeaning ?? '') : '');
        setFinishTags(product.finishTags ?? []);
        setMoq(product.moq == null ? '' : toInputNumber(product.moq));
        if (product.moqUnit) setMoqUnit(product.moqUnit);
        setLeadTimeDays(product.leadTimeDays == null ? '' : String(product.leadTimeDays));
        // Fiyat yalnızca sahibine geliyor; başkasının yanıtında alan hiç yok.
        if (product.price) {
          setPriceValue(toInputNumber(product.price.value));
          if (product.price.currency) setPriceCurrency(product.price.currency);
          if (product.price.unit === 'm' || product.price.unit === 'kg') setPriceUnit(product.price.unit);
        }

        // AB pasaportuna hazırlık alanları (eski sunucuda hiç gelmez).
        const loadedOrigin = product.originCountry ?? '';
        const loadedCare = product.careNotes ?? '';
        const loadedRecycled = product.recycledPercent ?? null;
        dppInitial.current = {
          originCountry: loadedOrigin,
          careNotes: loadedCare,
          recycledPercent: loadedRecycled,
        };
        setOriginCountry(loadedOrigin);
        setCareNotes(loadedCare);
        setRecycledPercent(loadedRecycled == null ? '' : toInputNumber(loadedRecycled));
        setDppOpen(!!loadedOrigin || !!loadedCare || loadedRecycled != null);

        const yarns = product.yarns ?? [];
        setYarnRows(
          yarns.map((y) => ({
            key: newKey('iplik'),
            role: y.role ?? '',
            count: toInputNumber(y.count),
            unit: y.unit,
            ply: String(y.ply ?? 1),
            yarnType: y.yarnType ?? '',
          }))
        );
        setYarnOpen(yarns.length > 0);

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
        // Mevcut belge fotoğrafları yalnızca önizleme için çekiliyor;
        // kaydederken sıraları gönderiliyor, kendileri yeniden yüklenmiyor.
        for (const certificate of certificates) {
          if (!certificate.hasImage) continue;
          fetchCertificateImage(productId, certificate.position)
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

        const testReports = product.testReports ?? [];
        setTestReportRows(
          testReports.map((report) => ({
            key: newKey('rapor'),
            kind: report.kind,
            result: report.result ?? '',
            testedAt: toDateInput(report.testedAt),
            image: report.hasImage ? { kind: 'existing', position: report.position, uri: null } : { kind: 'none' },
          }))
        );
        setTestReportOpen(testReports.length > 0);
        for (const report of testReports) {
          if (!report.hasImage) continue;
          fetchTestReportImage(productId, report.position)
            .then(({ imageUrl }) => {
              if (cancelled) return;
              setTestReportRows((prev) =>
                prev.map((row) =>
                  row.image.kind === 'existing' && row.image.position === report.position
                    ? { ...row, image: { ...row.image, uri: imageUrl } }
                    : row
                )
              );
            })
            .catch(() => {});
        }

        const count = product.imageCount ?? (product.hasImage ? 1 : 0);
        setPhotos(
          Array.from({ length: count }, (_, i) => ({
            key: `mevcut-${i}`,
            existing: i,
            dataUrl: null,
            uri: getCachedGalleryImage(productId, i) ?? null,
          }))
        );
        // Mevcut fotoğraflar yalnızca önizleme için çekiliyor; kaydederken
        // sıraları gönderiliyor, kendileri yeniden yüklenmiyor.
        for (let i = 0; i < count; i++) {
          if (getCachedGalleryImage(productId, i)) continue;
          loadGalleryImage(productId, i)
            .then((url) => {
              if (cancelled) return;
              setPhotos((prev) => prev.map((p) => (p.existing === i && !p.uri ? { ...p, uri: url } : p)));
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setError('Ürün yüklenemedi, lütfen tekrar deneyin.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Alan elle değiştirildi: artık çıkarımdan gelen değer değil, kayıt isteğinde
  // fieldMeta satırı gönderilmez.
  const forgetExtracted = (...fields: ExtractionFieldName[]) =>
    setExtractedFields((prev) => {
      if (!fields.some((field) => field in prev)) return prev;
      const next = { ...prev };
      for (const field of fields) delete next[field];
      return next;
    });

  const changeType = (next: ProductType) => {
    setType(next);
    setTypeChosen(true);
    forgetExtracted('type');
    // Alt çeşit yalnızca kendi çeşidinde geçerli.
    if (!SUBTYPES[next].some((s) => s.key === subtype)) {
      setSubtype('');
      forgetExtracted('subtype');
    }
  };

  const changeSubtype = (next: string) => {
    setSubtype(next);
    forgetExtracted('subtype');
  };

  const changeCode = (next: string) => {
    setCode(next);
    forgetExtracted('code');
  };

  const changeWeightGsm = (next: string) => {
    setWeightGsm(next);
    forgetExtracted('weightGsm');
  };

  const changeWidthCm = (next: string) => {
    setWidthCm(next);
    forgetExtracted('widthCm');
  };

  const changeWidthType = (next: string) => {
    setWidthType(next);
    // Tüp en dışında "enin anlamı" sorusu yok: seçim sıfırlanır.
    if (next !== 'tup') setWidthMeaning('');
    forgetExtracted('widthType');
  };


  const changeUsages = (next: string[]) => {
    setUsages(next);
    forgetExtracted('usages');
  };

  const changeFinishTags = (next: string[]) => {
    setFinishTags(next);
    forgetExtracted('finishTags');
  };

  // --- Etiketten doldur ---
  const runExtract = async (input: PassportExtractInput) => {
    setSourceOpen(false);
    setExtracting(true);
    setExtractError(null);
    try {
      const outcome = await extractPassport({ ...input, ...(typeChosen ? { hints: { type } } : {}) });
      haptics.success();
      setPasteOpen(false);
      setPasteText('');
      navigation.navigate('PassportReview', { productId: productId ?? undefined, outcome });
    } catch (err) {
      haptics.error();
      setExtractError(extractErrorMessage(err));
    } finally {
      setExtracting(false);
    }
  };

  const extractFromCamera = async () => {
    setExtractError(null);
    try {
      const picked = await captureCompressedImage();
      if (!picked) return;
      await runExtract({ images: [{ imageBase64: picked.dataUrl, mediaType: 'image/jpeg' }] });
    } catch (err) {
      setExtractError(
        err instanceof Error && err.message === 'camera_permission_denied'
          ? 'Kameraya erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen tekrar deneyin.'
      );
    }
  };

  const extractFromGallery = async () => {
    setExtractError(null);
    try {
      const picked = await pickCompressedImages(MAX_EXTRACT_IMAGES);
      if (!picked.length) return;
      await runExtract({
        images: picked.map((image) => ({ imageBase64: image.dataUrl, mediaType: 'image/jpeg' as const })),
      });
    } catch (err) {
      setExtractError(
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.'
      );
    }
  };

  const extractFromPdf = async () => {
    setExtractError(null);
    try {
      const picked = await pickPdf();
      if (!picked) return;
      await runExtract({ document: { dataBase64: picked.dataBase64, mediaType: 'application/pdf' } });
    } catch (err) {
      setExtractError(
        err instanceof DocumentPickError && err.code === 'too_large'
          ? 'PDF çok büyük (en fazla 10 MB).'
          : 'PDF okunamadı, lütfen başka bir dosya deneyin.'
      );
    }
  };

  const extractFromText = async () => {
    const trimmed = pasteText.trim();
    if (!trimmed) return;
    await runExtract({ text: trimmed.slice(0, MAX_EXTRACT_TEXT) });
  };

  // Onay ekranından dönen alanları forma yazar. importKey her aktarımda
  // değiştiği için aynı öneri ikinci kez aktarılsa da çalışır.
  const appliedImportKey = useRef<number | null>(null);
  const importKey = route.params?.importKey ?? null;
  const passportImport = route.params?.passportImport ?? null;

  useEffect(() => {
    if (!passportImport || importKey == null || appliedImportKey.current === importKey) return;
    appliedImportKey.current = importKey;
    applyPassportImport(passportImport);
    // applyPassportImport yalnızca setState çağırıyor; importKey yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importKey]);

  const applyPassportImport = (imported: PassportImport) => {
    const { values } = imported;
    const nextType = values.type ?? type;
    const applied = new Set<ExtractionFieldName>(imported.fields.map((item) => item.field));

    if (values.type) {
      setType(values.type);
      setTypeChosen(true);
    }

    // Alt çeşit yalnızca kendi çeşidinde geçerli; değilse aktarılmaz.
    if (values.subtype !== undefined) {
      if (SUBTYPES[nextType].some((s) => s.key === values.subtype)) setSubtype(values.subtype);
      else applied.delete('subtype');
    } else if (values.type && !SUBTYPES[nextType].some((s) => s.key === subtype)) {
      setSubtype('');
    }

    if (values.code !== undefined) setCode(values.code);

    if (values.composition?.length) {
      // Kompozisyon geldiyse form satır kipine geçer.
      setCompositionRowMode(true);
      setCompositionRows(
        values.composition.slice(0, MAX_COMPOSITION_ROWS).map((item) => ({
          key: newKey('lif'),
          fiber: item.fiber,
          percent: toInputNumber(item.percent),
        }))
      );
    }

    if (values.weightGsm != null) setWeightGsm(toInputNumber(values.weightGsm));
    if (values.widthCm != null) setWidthCm(toInputNumber(values.widthCm));
    if (values.widthType) {
      setWidthType(values.widthType);
      // Etiketten "tüp" geldiyse enin anlamını kullanıcı seçer (boş kalır).
      setWidthMeaning('');
    }

    if (values.yarns?.length) {
      setYarnRows(
        values.yarns.slice(0, MAX_YARNS).map((yarn) => ({
          key: newKey('iplik'),
          role: yarn.role,
          count: toInputNumber(yarn.count),
          unit: yarn.unit,
          ply: String(yarn.ply || 1),
          yarnType: yarn.yarnType,
        }))
      );
      setYarnOpen(true);
    }

    if (values.certificates?.length) {
      setCertificateRows(
        values.certificates.slice(0, MAX_CERTIFICATES).map((certificate) => ({
          key: newKey('sertifika'),
          name: certificate.name,
          number: certificate.number,
          validUntil: toDateInput(certificate.validUntil),
          image: { kind: 'none' },
        }))
      );
      setCertificateOpen(true);
    }

    if (values.finishTags) setFinishTags(values.finishTags);
    if (values.usages) setUsages(values.usages);

    setExtractedFields((prev) => {
      const next = { ...prev };
      for (const item of imported.fields) {
        if (applied.has(item.field)) next[item.field] = item.confidence;
      }
      return next;
    });
    haptics.success();
  };

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

  // --- Kompozisyon satırları ---
  const updateCompositionRow = (key: string, patch: Partial<CompositionRow>) => {
    setCompositionRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    forgetExtracted('composition');
  };

  const addCompositionRow = () => {
    if (compositionRows.length >= MAX_COMPOSITION_ROWS) return;
    haptics.selection();
    setCompositionRows((prev) => [...prev, emptyCompositionRow()]);
    forgetExtracted('composition');
  };

  const removeCompositionRow = (key: string) => {
    haptics.selection();
    setCompositionRows((prev) => prev.filter((row) => row.key !== key));
    forgetExtracted('composition');
  };

  const switchToCompositionRows = () => {
    haptics.selection();
    const parsed = splitCompositionText(content);
    setCompositionRows(parsed.length ? parsed : [emptyCompositionRow()]);
    setCompositionRowMode(true);
    forgetExtracted('composition');
  };

  // --- İplik satırları ---
  const updateYarnRow = (key: string, patch: Partial<YarnRow>) => {
    setYarnRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    forgetExtracted('yarns');
  };

  const addYarnRow = () => {
    if (yarnRows.length >= MAX_YARNS) return;
    haptics.selection();
    setYarnRows((prev) => [...prev, emptyYarnRow()]);
    forgetExtracted('yarns');
  };

  const removeYarnRow = (key: string) => {
    haptics.selection();
    setYarnRows((prev) => prev.filter((row) => row.key !== key));
    forgetExtracted('yarns');
  };

  // --- Sertifika satırları ---
  const updateCertificateRow = (key: string, patch: Partial<CertificateRow>) => {
    setCertificateRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    // Belge fotoğrafı eklemek çıkarım değerini değiştirmez.
    if (!('image' in patch)) forgetExtracted('certificates');
  };

  const addCertificateRow = () => {
    if (certificateRows.length >= MAX_CERTIFICATES) return;
    haptics.selection();
    setCertificateRows((prev) => [...prev, emptyCertificateRow()]);
    forgetExtracted('certificates');
  };

  const removeCertificateRow = (key: string) => {
    haptics.selection();
    setCertificateRows((prev) => prev.filter((row) => row.key !== key));
    forgetExtracted('certificates');
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

  // --- Test raporu satırları ---
  // Test raporları çıkarımdan gelmiyor; fieldMeta'ya dokunulmuyor.
  const updateTestReportRow = (key: string, patch: Partial<TestReportRow>) =>
    setTestReportRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addTestReportRow = () => {
    if (testReportRows.length >= MAX_TEST_REPORTS) return;
    haptics.selection();
    setTestReportRows((prev) => [...prev, emptyTestReportRow()]);
  };

  const removeTestReportRow = (key: string) => {
    haptics.selection();
    setTestReportRows((prev) => prev.filter((row) => row.key !== key));
  };

  const addTestReportPhoto = async (key: string) => {
    setPickingDoc(key);
    setError(null);
    try {
      const picked = await pickCompressedImage();
      if (!picked) return;
      updateTestReportRow(key, { image: { kind: 'new', uri: picked.uri, dataUrl: picked.dataUrl } });
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
  const stockNum = parseNumber(stock);
  const weightGsmNum = parseNumber(weightGsm);
  const widthCmNum = parseNumber(widthCm);

  // Canlı bilgi satırı: "Hesap eni: 160 cm (80 × 2)" ya da "Hesap eni: 80 cm".
  // En girilmediyse ya da tüp en seçili değilse gösterilmez.
  const effectiveWidthText =
    widthType === 'tup' && widthCmNum > 0
      ? widthMeaning === 'tup_tek_yuz'
        ? `Hesap eni: ${formatMeasure(effectiveWidthCm(widthCmNum, widthMeaning))} cm (${formatMeasure(
            widthCmNum
          )} × 2)`
        : `Hesap eni: ${formatMeasure(widthCmNum)} cm`
      : '';

  const filledCompositionRows = compositionRows.filter((row) => row.fiber || row.percent.trim());
  const validCompositionRows = filledCompositionRows.filter(
    (row) => row.fiber && parseNumber(row.percent) > 0 && parseNumber(row.percent) <= 100
  );
  const compositionTotal = validCompositionRows.reduce((sum, row) => sum + parseNumber(row.percent), 0);
  const compositionIncomplete = compositionRowMode && filledCompositionRows.length !== validCompositionRows.length;
  const hasComposition = compositionRowMode && validCompositionRows.length > 0;

  const filledYarnRows = yarnRows.filter((row) => row.count.trim());
  const yarnIncomplete = filledYarnRows.some((row) => parseNumber(row.count) <= 0 || !row.unit);
  const certificateIncomplete = certificateRows.some((row) => !row.name);
  const certificateDateInvalid = certificateRows.some(
    (row) => row.validUntil.trim() && !DATE_PATTERN.test(row.validUntil.trim())
  );

  // Türü boş ama başka bir alanı doldurulmuş satır kaydedilemez (sunucu kind
  // zorunlu tutuyor); tamamen boş satır sessizce atılır.
  const filledTestReportRows = testReportRows.filter(
    (row) => row.kind.trim() || row.result.trim() || row.testedAt.trim() || row.image.kind !== 'none'
  );
  const testReportIncomplete = filledTestReportRows.some((row) => !row.kind.trim());
  const testReportDateInvalid = testReportRows.some(
    (row) => row.testedAt.trim() && !DATE_PATTERN.test(row.testedAt.trim())
  );

  const formErrors: string[] = [];
  if (compositionIncomplete) formErrors.push('Kompozisyon satırlarında lif ve yüzdeyi birlikte doldurun (yüzde 0 ile 100 arası).');
  if (yarnIncomplete) formErrors.push('İplik satırlarında numara sıfırdan büyük olmalı ve birim seçilmeli.');
  if (certificateIncomplete) formErrors.push('Her sertifika satırında bir sertifika adı seçin.');
  if (certificateDateInvalid) formErrors.push('Sertifika geçerlilik tarihini YYYY-AA-GG biçiminde yazın (örn. 2027-03-01).');
  if (testReportIncomplete) formErrors.push('Her test raporu satırında test türünü yazın.');
  if (testReportDateInvalid) formErrors.push('Test tarihini YYYY-AA-GG biçiminde yazın (örn. 2027-03-01).');
  // AB pasaportuna hazırlık: oran 0-100 arası (0 geçerli, boş "belirtilmedi").
  if (recycledPercent.trim() && !(parseNumber(recycledPercent) >= 0 && parseNumber(recycledPercent) <= 100))
    formErrors.push('Geri dönüştürülmüş içerik oranı 0 ile 100 arasında olmalı.');

  // Mevcut fotoğraflardan biri henüz yüklenmediyse önizleme boş ama sırası
  // biliniyor; kaydetmeyi engellemez.
  const canSubmit =
    !!user?.companyId &&
    code.trim().length > 0 &&
    (hasComposition || (!compositionRowMode && content.trim().length > 0)) &&
    stock.trim().length > 0 &&
    stockNum >= 0 &&
    weightGsm.trim().length > 0 &&
    weightGsmNum > 0 &&
    widthCm.trim().length > 0 &&
    widthCmNum > 0 &&
    formErrors.length === 0;

  // Formdaki pasaport alanlarını sunucu sözleşmesine çevirir. Gönderilmeyen
  // alana sunucu dokunmaz; test raporları artık bu formda düzenlendiği için
  // HER KAYITTA tam liste gidiyor (hepsi silinirse boş dizi gider).
  const passportPayload = (): PassportInput => {
    const yarns: YarnInput[] = filledYarnRows.map((row) => ({
      role: row.role,
      count: parseNumber(row.count),
      unit: row.unit,
      ply: Math.max(1, Math.round(parseNumber(row.ply) || 1)),
      yarnType: row.yarnType,
    }));
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
    const testReports: TestReportInput[] = filledTestReportRows
      .filter((row) => row.kind.trim())
      .map((row) => ({
        kind: row.kind.trim(),
        result: row.result.trim(),
        testedAt: row.testedAt.trim() ? row.testedAt.trim() : null,
        image:
          row.image.kind === 'new'
            ? row.image.dataUrl
            : row.image.kind === 'existing'
              ? { existing: row.image.position }
              : null,
      }));
    // Çıkarımdan gelip forma aktarılan ve elle değiştirilmemiş alanlar; sunucu
    // ProductFieldMeta satırını onaylanmış olarak yazar. Boşsa gönderilmez.
    const fieldMeta: FieldMetaInput[] = (Object.keys(extractedFields) as ExtractionFieldName[]).map((field) => ({
      field,
      confidence: extractedFields[field]!,
      source: 'extracted',
      confirmed: true,
    }));
    const moqNum = moq.trim() ? parseNumber(moq) : null;
    const leadTimeNum = leadTimeDays.trim() ? Math.round(parseNumber(leadTimeDays)) : null;
    const priceNum = priceValue.trim() ? parseNumber(priceValue) : null;
    // AB pasaportuna hazırlık: alan yalnızca doluysa ya da önceden dolu olup
    // şimdi temizlendiyse gönderilir. Böylece bu alanları tanımayan bir
    // sunucuya boş yeni üründe hiç gitmez.
    const originTrimmed = originCountry.trim();
    const careTrimmed = careNotes.trim();
    const recycledNum = recycledPercent.trim() ? parseNumber(recycledPercent) : null;
    const dpp = {
      ...(originTrimmed || dppInitial.current.originCountry ? { originCountry: originTrimmed } : {}),
      ...(careTrimmed || dppInitial.current.careNotes ? { careNotes: careTrimmed } : {}),
      // 0 geçerli bir değer: `!= null` ile bakılıyor.
      ...(recycledNum != null || dppInitial.current.recycledPercent != null
        ? { recycledPercent: recycledNum }
        : {}),
    };
    return {
      ...(hasComposition
        ? {
            composition: validCompositionRows.map((row) => ({
              fiber: row.fiber,
              percent: parseNumber(row.percent),
            })),
          }
        : {}),
      yarns,
      certificates,
      testReports,
      widthType,
      // Açık ende anlam zaten açık en; tüpte kullanıcının seçimi (seçmediyse
      // boş gider ve hesap eni girilen en olur).
      widthMeaning: widthType === 'acik' ? 'acik' : widthType === 'tup' ? widthMeaning : '',
      moq: moqNum,
      // MOQ temizlendiyse birim de temizlenir.
      moqUnit: moqNum == null ? '' : moqUnit,
      leadTimeDays: leadTimeNum,
      priceValue: priceNum,
      priceCurrency: priceNum == null ? '' : priceCurrency,
      priceUnit: priceNum == null ? '' : priceUnit,
      finishTags,
      ...dpp,
      ...(fieldMeta.length ? { fieldMeta } : {}),
    };
  };

  // Yeni ürün kaydedildikten sonra "Akışta paylaş" sorusu (Faz 1, Adım 6).
  // Otomatik gönderi YOK: yüzlerce ürün girişi akışı doldurur. Düzenlemede
  // hiç sorulmaz. Evet denirse CreatePost ürün seçili açılır; AddProduct
  // yığında bırakılmaz (kayıt bitti, forma geri dönülmez).
  const offerFeedShare = async (newProductId: string) => {
    const share = await confirmAction({
      title: 'Ürün kaydedildi',
      message: 'Ürün kaydedildi. Akışta paylaşılsın mı?',
      confirmLabel: 'Akışta paylaş',
      cancelLabel: 'Şimdi değil',
    });
    if (share) navigation.replace('CreatePost', { productId: newProductId, pickedAt: Date.now() });
    else navigation.goBack();
  };

  const handleSubmit = async () => {
    if (!user?.companyId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSavedWarnings(null);
    const fields = {
      code: code.trim(),
      type,
      subtype,
      usages,
      stock: stockNum,
      stockUnit,
      weightGsm: weightGsmNum,
      widthCm: widthCmNum,
      // Kompozisyon satırı varsa metni sunucu üretir; yoksa metin gönderilir.
      ...(hasComposition ? {} : { content: content.trim() }),
      useArea: useArea.trim(),
      ...passportPayload(),
    };
    try {
      let notes: string[] = [];
      // Yeni kayıtta dolu: uyarı kutusu varsa "Devam"dan sonra sorulacak.
      let createdId: string | null = null;
      if (isEditing && productId) {
        const images: ProductImageInput[] | undefined = photosDirty
          ? photos.map((p) => (p.existing !== undefined ? { existing: p.existing } : p.dataUrl!))
          : undefined;
        const result = await updateProduct(productId, images ? { ...fields, images } : fields);
        notes = result.warnings?.notes ?? [];
        // Fotoğraflar yeniden sıralanmış olabilir: önbellekteki eski sıralar atılıyor.
        if (photosDirty) replaceCachedProductImages(productId, photos.map((p) => p.dataUrl ?? p.uri));
      } else {
        const result = await createProduct({ ...fields, images: photos.map((p) => p.dataUrl!) });
        notes = result.warnings?.notes ?? [];
        createdId = result.product.id;
        replaceCachedProductImages(result.product.id, photos.map((p) => p.dataUrl));
      }
      haptics.success();
      if (notes.length) {
        // Kayıt tamam; kullanıcı uyarıyı okuyup "Devam" ile ilerliyor
        // (yeni üründe "Devam" akışta paylaşmayı sorar).
        setSavedWarnings(notes);
        setCreatedProductId(createdId);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else if (createdId) {
        await offerFeedShare(createdId);
      } else {
        navigation.goBack();
      }
    } catch {
      haptics.error();
      setError('Ürün kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    const confirmed = await confirmAction({
      title: 'Ürünü sil',
      message: `${code || 'Bu ürün'} silinsin mi? Ürüne gelen numune talepleri de silinir.`,
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(productId);
      haptics.success();
      // Ürün sayfasından gelindiyse o sayfa artık boş: ikisi birden kapanır.
      const routes = navigation.getState().routes;
      if (routes[routes.length - 2]?.name === 'ProductDetail') navigation.pop(2);
      else navigation.goBack();
    } catch {
      haptics.error();
      setError('Ürün silinemedi, lütfen tekrar deneyin.');
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

  const subtypeOptions = [
    { value: '', label: 'Belirtilmemiş' },
    ...SUBTYPES[type].map((s) => ({ value: s.key, label: s.label })),
  ];
  const totalText = compositionTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

  return (
    <View style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {savedWarnings ? (
          <View style={styles.warningBox} accessibilityRole="alert">
            <View style={styles.warningTitleRow}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
              <Text style={styles.warningTitle}>Kaydedildi. Dikkat:</Text>
            </View>
            {savedWarnings.map((note) => (
              <Text key={note} style={styles.warningNote}>
                {note}
              </Text>
            ))}
          </View>
        ) : null}

        <SectionHeader title={`Fotoğraflar (${photos.length}/${MAX_PRODUCT_IMAGES})`} first />
        <View style={styles.block}>
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <View key={photo.key} style={styles.photoTile}>
                <Pressable
                  onPress={() => index > 0 && makeCover(photo.key)}
                  disabled={index === 0}
                  // Yanındaki kaldır düğmesiyle kardeş (iç içe değil): web'de
                  // iç içe <button> oluşmasın.
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
          <Text style={styles.hint}>
            İlk fotoğraf kapak olur. Başka bir fotoğrafı kapak yapmak için üstüne dokunun.
          </Text>
        </View>

        <SectionHeader title="Etiketten doldur" />
        <View style={[styles.block, styles.extractBlock]}>
          <Text style={styles.labelHint}>
            Etiket, kartela ya da test raporundan bilgileri okuyup forma dolduralım. Aktarmadan önce siz onaylarsınız.
          </Text>
          <View style={styles.extractRow}>
            <PrimaryButton
              label={extracting ? 'Etiket okunuyor...' : 'Etiketten doldur'}
              variant="outline"
              icon="scan-outline"
              disabled={extracting}
              onPress={() => {
                haptics.selection();
                setExtractError(null);
                setSourceOpen((v) => !v);
              }}
              style={styles.extractButton}
            />
            {extracting ? <ActivityIndicator color={colors.primary} /> : null}
          </View>

          {sourceOpen && !extracting ? (
            <View style={styles.sourceBox}>
              {/* Kamera yalnızca telefonda; web'de tarayıcı kamerası yok. */}
              {Platform.OS !== 'web' ? (
                <ListRow
                  title="Fotoğraf çek"
                  left={<Ionicons name="camera-outline" size={20} color={colors.primary} />}
                  onPress={extractFromCamera}
                />
              ) : null}
              <ListRow
                title="Galeriden seç"
                subtitle={`En fazla ${MAX_EXTRACT_IMAGES} fotoğraf`}
                left={<Ionicons name="images-outline" size={20} color={colors.primary} />}
                onPress={extractFromGallery}
              />
              <ListRow
                title="PDF seç"
                subtitle="Test raporu ya da kartela belgesi"
                left={<Ionicons name="document-text-outline" size={20} color={colors.primary} />}
                onPress={extractFromPdf}
              />
              <ListRow
                title="Metin yapıştır"
                subtitle="WhatsApp'tan gelen etiket bilgisi"
                left={<Ionicons name="clipboard-outline" size={20} color={colors.primary} />}
                divider={false}
                onPress={() => {
                  haptics.selection();
                  setSourceOpen(false);
                  setPasteOpen(true);
                }}
              />
            </View>
          ) : null}

          {pasteOpen ? (
            <View style={styles.pasteBox}>
              <TextField
                label="Etiket metni"
                value={pasteText}
                onChangeText={setPasteText}
                placeholder="Örn. 95% CO 5% EA, 220 gsm, 180 cm tubular"
                multiline
                maxLength={MAX_EXTRACT_TEXT}
              />
              <View style={styles.pasteActions}>
                <PrimaryButton
                  label="Oku"
                  disabled={!pasteText.trim() || extracting}
                  onPress={extractFromText}
                  style={styles.pasteAction}
                />
                <PrimaryButton
                  label="Kapat"
                  variant="outline"
                  onPress={() => {
                    haptics.selection();
                    setPasteOpen(false);
                  }}
                  style={styles.pasteAction}
                />
              </View>
            </View>
          ) : null}

          {extractError ? <Text style={styles.extractError}>{extractError}</Text> : null}
        </View>

        <SectionHeader title="Kumaş" />
        <View style={[styles.block, styles.formBlock]}>
          <Text style={styles.label}>Çeşit</Text>
          <ChipSelect options={TYPE_OPTIONS} value={type} onChange={changeType} />
          {SUBTYPES[type].length > 0 ? (
            <>
              <Text style={styles.label}>Alt çeşit</Text>
              <ChipSelect options={subtypeOptions} value={subtype} onChange={changeSubtype} compact />
            </>
          ) : null}
          <Text style={styles.label}>En tipi</Text>
          <ChipSelect options={WIDTH_TYPE_OPTIONS} value={widthType} onChange={changeWidthType} compact />
          {widthType === 'tup' ? (
            <>
              <Text style={styles.hint}>Tüp en genellikle ham kumaşta olur; boyalı kumaş çoğunlukla açık endir.</Text>
              <Text style={styles.label}>Girdiğiniz en neyi gösteriyor?</Text>
              <ChipSelect
                options={WIDTH_MEANING_OPTIONS}
                value={widthMeaning}
                onChange={setWidthMeaning}
                compact
              />
              {effectiveWidthText ? <Text style={styles.labelHint}>{effectiveWidthText}</Text> : null}
            </>
          ) : null}
          <Text style={styles.label}>Kullanım amaçları</Text>
          <Text style={styles.labelHint}>Birden fazla seçebilirsiniz; alıcılar bu başlıklarla arıyor.</Text>
          <MultiChipSelect options={USAGES} values={usages} onChange={changeUsages} />
          <Text style={styles.label}>Apre / boya</Text>
          <Text style={styles.labelHint}>Kumaşa uygulanan işlemler.</Text>
          <MultiChipSelect options={FINISH_TAGS} values={finishTags} onChange={changeFinishTags} />
        </View>

        <SectionHeader title="Bilgiler" />
        <View style={[styles.block, styles.formBlock]}>
          <TextField label="Ürün Kodu" value={code} onChangeText={changeCode} placeholder="Örn. ORM-1042" />

          <Text style={styles.label}>Kompozisyon</Text>
          {compositionRowMode ? (
            <>
              <Text style={styles.labelHint}>Her satırda bir lif ve oranı. Toplam genelde 100 olur.</Text>
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
                    placeholder="Örn. 95"
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
                <Text style={[styles.totalText, compositionTotal !== 100 && styles.totalWarning]}>
                  Toplam %{totalText}
                  {compositionTotal !== 100 ? ' (genelde 100 olur, yine de kaydedebilirsiniz)' : ''}
                </Text>
              ) : null}
              {/* Listede olmayan bir lif ya da serbest bir açıklama gerekiyorsa metne dönüş. */}
              <Pressable
                onPress={() => {
                  haptics.selection();
                  setCompositionRowMode(false);
                  forgetExtracted('composition');
                }}
                accessibilityRole="button"
                accessibilityLabel="İçeriği metin olarak yaz"
                style={({ pressed }) => [styles.textLink, pressed && styles.textLinkPressed]}
              >
                <Text style={styles.textLinkLabel}>Metin olarak yazmak istiyorum</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextField
                label="İçerik"
                value={content}
                onChangeText={setContent}
                placeholder="Örn. %95 Pamuk %5 Elastan"
              />
              <Pressable
                onPress={switchToCompositionRows}
                accessibilityRole="button"
                accessibilityLabel="İçeriği kompozisyon satırlarına böl"
                style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
              >
                <Ionicons name="git-branch-outline" size={18} color={colors.accent} />
                <Text style={styles.addRowText}>Satırlara böl</Text>
              </Pressable>
              <Text style={styles.labelHint}>
                Satırlara bölerseniz alıcılar lif ve orana göre arayabilir.
              </Text>
            </>
          )}

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <TextField
                label="Gramaj (gr/m²)"
                value={weightGsm}
                onChangeText={changeWeightGsm}
                placeholder="Örn. 220"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.fieldHalf}>
              <TextField label="En (cm)" value={widthCm} onChangeText={changeWidthCm} placeholder="Örn. 150" keyboardType="numeric" />
            </View>
          </View>
          <Text style={styles.label}>Stok birimi</Text>
          <ChipSelect options={UNIT_OPTIONS} value={stockUnit} onChange={setStockUnit} compact />
          <TextField
            label={`Stok (${STOCK_UNIT_LABELS[stockUnit].long})`}
            value={stock}
            onChangeText={setStock}
            placeholder={stockUnit === 'm' ? 'Örn. 1200' : 'Örn. 450'}
            keyboardType="numeric"
          />
          <TextField
            label="Not (isteğe bağlı)"
            value={useArea}
            onChangeText={setUseArea}
            placeholder="Örn. Şardonlu, yıkamalı"
          />
        </View>

        <SectionHeader title="Ticari" />
        <View style={[styles.block, styles.formBlock]}>
          <TextField
            label="En az sipariş (MOQ)"
            value={moq}
            onChangeText={setMoq}
            placeholder="Örn. 300"
            keyboardType="numeric"
          />
          <Text style={styles.label}>MOQ birimi</Text>
          <Text style={styles.labelHint}>Stok biriminden farklı olabilir.</Text>
          <ChipSelect options={MOQ_UNIT_OPTIONS} value={moqUnit} onChange={setMoqUnit} compact />
          <TextField
            label="Termin (gün)"
            value={leadTimeDays}
            onChangeText={setLeadTimeDays}
            placeholder="Örn. 15"
            keyboardType="numeric"
          />
          <TextField
            label="Fiyat"
            value={priceValue}
            onChangeText={setPriceValue}
            placeholder="Örn. 4,50"
            keyboardType="numeric"
          />
          <Text style={styles.label}>Para birimi</Text>
          <ChipSelect options={CURRENCY_OPTIONS} value={priceCurrency} onChange={setPriceCurrency} compact />
          <Text style={styles.label}>Fiyat birimi</Text>
          <ChipSelect options={PRICE_UNIT_OPTIONS} value={priceUnit} onChange={setPriceUnit} compact />
          <Text style={styles.noteBox}>Fiyat yalnızca size görünür. Diğer firmalar ürün sayfasında fiyatı görmez.</Text>
        </View>

        <CollapsibleSection
          title="İplik"
          count={filledYarnRows.length || undefined}
          open={yarnOpen}
          onToggle={() => setYarnOpen((v) => !v)}
        >
          <View style={[styles.block, styles.formBlock]}>
            {yarnRows.length === 0 ? (
              <Text style={styles.labelHint}>İplik numarası ve tipi girilirse alıcı kumaşın tuşesini tahmin edebilir.</Text>
            ) : null}
            {yarnRows.map((row, index) => (
              <View key={row.key} style={styles.rowCard}>
                <View style={styles.rowCardHead}>
                  <Text style={styles.rowCardTitle}>{index + 1}. iplik</Text>
                  <Pressable
                    onPress={() => removeYarnRow(row.key)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${index + 1}. iplik satırını kaldır`}
                    style={({ pressed }) => [styles.rowRemove, pressed && styles.rowRemovePressed]}
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={styles.label}>Rol</Text>
                <ChipSelect
                  options={YARN_ROLE_OPTIONS}
                  value={row.role}
                  onChange={(role) => updateYarnRow(row.key, { role })}
                  compact
                />
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <TextField
                      label="Numara"
                      value={row.count}
                      onChangeText={(count) => updateYarnRow(row.key, { count })}
                      placeholder="Örn. 30"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <TextField
                      label="Kat"
                      value={row.ply}
                      onChangeText={(ply) => updateYarnRow(row.key, { ply })}
                      placeholder="1"
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <Text style={styles.label}>Numara sistemi</Text>
                <ChipSelect
                  options={YARN_UNIT_OPTIONS}
                  value={row.unit}
                  onChange={(unit) => updateYarnRow(row.key, { unit })}
                  compact
                />
                <Text style={styles.label}>İplik tipi</Text>
                <ChipSelect
                  options={YARN_TYPE_OPTIONS}
                  value={row.yarnType}
                  onChange={(yarnType) => updateYarnRow(row.key, { yarnType })}
                  compact
                />
              </View>
            ))}
            {yarnRows.length < MAX_YARNS ? (
              <Pressable
                onPress={addYarnRow}
                accessibilityRole="button"
                accessibilityLabel="İplik satırı ekle"
                style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
              >
                <Ionicons name="add" size={18} color={colors.accent} />
                <Text style={styles.addRowText}>İplik ekle</Text>
              </Pressable>
            ) : null}
          </View>
        </CollapsibleSection>

        <CollapsibleSection
          title="Sertifikalar"
          count={certificateRows.length || undefined}
          open={certificateOpen}
          onToggle={() => setCertificateOpen((v) => !v)}
        >
          <View style={[styles.block, styles.formBlock]}>
            {certificateRows.length === 0 ? (
              <Text style={styles.labelHint}>Sertifika eklenen ürünler aramalarda öne çıkar.</Text>
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

        <CollapsibleSection
          title="Test raporları"
          count={filledTestReportRows.length || undefined}
          open={testReportOpen}
          onToggle={() => setTestReportOpen((v) => !v)}
        >
          <View style={[styles.block, styles.formBlock]}>
            {testReportRows.length === 0 ? (
              <Text style={styles.labelHint}>
                Laboratuvar sonuçları (çekme, haslık, boncuklanma) alıcının güvenini artırır.
              </Text>
            ) : null}
            {testReportRows.map((row, index) => (
              <View key={row.key} style={styles.rowCard}>
                <View style={styles.rowCardHead}>
                  <Text style={styles.rowCardTitle}>{index + 1}. test</Text>
                  <Pressable
                    onPress={() => removeTestReportRow(row.key)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${index + 1}. test raporu satırını kaldır`}
                    style={({ pressed }) => [styles.rowRemove, pressed && styles.rowRemovePressed]}
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <TextField
                  label="Test türü"
                  value={row.kind}
                  onChangeText={(kind) => updateTestReportRow(row.key, { kind })}
                  placeholder="Örn. Renk haslığı"
                  maxLength={MAX_TEST_KIND_CHARS}
                />
                <View style={styles.suggestRow}>
                  {TEST_KIND_SUGGESTIONS.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      onPress={() => {
                        haptics.selection();
                        updateTestReportRow(row.key, { kind: suggestion });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Test türü: ${suggestion}`}
                      hitSlop={8}
                      style={({ pressed }) => [styles.suggestChip, pressed && styles.suggestChipPressed]}
                    >
                      <Text style={styles.suggestChipText}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextField
                  label="Sonuç (isteğe bağlı)"
                  value={row.result}
                  onChangeText={(result) => updateTestReportRow(row.key, { result })}
                  placeholder="Örn. 4-5 (iyi)"
                  maxLength={MAX_TEST_RESULT_CHARS}
                />
                <TextField
                  label="Test tarihi (YYYY-AA-GG, isteğe bağlı)"
                  value={row.testedAt}
                  onChangeText={(testedAt) => updateTestReportRow(row.key, { testedAt })}
                  placeholder="Örn. 2026-05-14"
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
                      onPress={() => addTestReportPhoto(row.key)}
                      disabled={pickingDoc !== null}
                      accessibilityLabel={`${index + 1}. test raporu fotoğrafı seç`}
                    />
                    {row.image.kind !== 'none' ? (
                      <PrimaryButton
                        label="Kaldır"
                        variant="outline"
                        onPress={() => {
                          haptics.selection();
                          updateTestReportRow(row.key, { image: { kind: 'none' } });
                        }}
                        accessibilityLabel={`${index + 1}. test raporu fotoğrafını kaldır`}
                      />
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
            {testReportRows.length < MAX_TEST_REPORTS ? (
              <Pressable
                onPress={addTestReportRow}
                accessibilityRole="button"
                accessibilityLabel="Test raporu satırı ekle"
                style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
              >
                <Ionicons name="add" size={18} color={colors.accent} />
                <Text style={styles.addRowText}>Test raporu ekle</Text>
              </Pressable>
            ) : null}
          </View>
        </CollapsibleSection>

        {/* Faz 3, Adım 7: AB Dijital Ürün Pasaportu'na HAZIRLIK. AB'nin tekstil
            için zorunlu alanları henüz yayımlanmadı; burası bir uyum beyanı
            değil, hazırlıktır. Üç alan da isteğe bağlı. */}
        <CollapsibleSection
          title="AB pasaportuna hazırlık (isteğe bağlı)"
          open={dppOpen}
          onToggle={() => setDppOpen((v) => !v)}
        >
          <View style={[styles.block, styles.formBlock]}>
            <Text style={styles.labelHint}>
              AB, tekstil ürünleri için dijital ürün pasaportunu zorunlu hale getirmeye hazırlanıyor. Bu bilgiler
              herkese açık pasaport sayfanızda görünür; ihracat müşterileriniz için şimdiden hazır olursunuz.
            </Text>
            <TextField
              label="Menşe ülke"
              value={originCountry}
              onChangeText={setOriginCountry}
              placeholder="Örn. Türkiye"
              maxLength={60}
            />
            <TextField
              label="Geri dönüştürülmüş içerik oranı (%)"
              value={recycledPercent}
              onChangeText={setRecycledPercent}
              placeholder="Örn. 30"
              keyboardType="numeric"
            />
            <Text style={styles.labelHint}>Boş bırakırsanız "belirtilmedi" sayılır; geri dönüşüm yoksa 0 yazın.</Text>
            <TextField
              label="Bakım / yıkama bilgisi"
              value={careNotes}
              onChangeText={setCareNotes}
              placeholder="Örn. 30 derecede yıkayın, ütülemeyin"
              multiline
              maxLength={500}
            />
          </View>
        </CollapsibleSection>

        {formErrors.map((message) => (
          <Text key={message} style={styles.error}>
            {message}
          </Text>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isEditing ? (
          <View style={[styles.block, styles.deleteBlock]}>
            <ListRow
              title={deleting ? 'Siliniyor...' : 'Ürünü Sil'}
              tone="danger"
              chevron={false}
              divider={false}
              onPress={deleting ? undefined : handleDelete}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        {savedWarnings ? (
          <PrimaryButton
            label="Devam"
            size="lg"
            onPress={() => {
              if (createdProductId) void offerFeedShare(createdProductId);
              else navigation.goBack();
            }}
            style={styles.actionMain}
          />
        ) : (
          <PrimaryButton
            label={submitting ? 'Kaydediliyor...' : isEditing ? 'Değişiklikleri Kaydet' : 'Ürünü Kaydet'}
            size="lg"
            disabled={!canSubmit || submitting || deleting}
            onPress={handleSubmit}
            style={styles.actionMain}
          />
        )}
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
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  // Etiketten doldur bloğu (Adım 3): açıklama + çerçeveli düğme, altında
  // ekran içinde açılan kaynak listesi (web'de Alert.alert çalışmıyor).
  extractBlock: { paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter, paddingBottom: spacing.sm },
  extractRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  extractButton: { flex: 1 },
  sourceBox: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pasteBox: { marginTop: spacing.sm },
  pasteActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pasteAction: { flex: 1 },
  extractError: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  label: { ...typography.label, fontFamily: fonts.semibold, color: colors.text, marginBottom: spacing.xs },
  labelHint: { ...typography.caption, color: colors.textMuted, marginTop: -2, marginBottom: spacing.sm },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldHalf: { flex: 1 },
  // Tekrarlanan satırlar (kompozisyon, iplik, sertifika): ince çerçeveli kutu.
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
  textLink: { minHeight: 44, justifyContent: 'center', marginBottom: spacing.sm },
  textLinkPressed: { opacity: 0.6 },
  textLinkLabel: { ...typography.label, color: colors.accent },
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
  // Kaydedildi ama makullük uyarısı var: sarı kutu (web'de Alert çalışmıyor).
  warningBox: {
    backgroundColor: colors.warningSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
    gap: 4,
  },
  warningTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warningTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.warning },
  warningNote: { ...typography.caption, color: colors.text },
  // Test türü öneri çipleri: serbest metin alanını dolduran kısayollar
  // (ChipSelect değil, çünkü değer listeyle sınırlı değil).
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -spacing.xs, marginBottom: spacing.md },
  suggestChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  suggestChipPressed: { backgroundColor: colors.pressed },
  suggestChipText: { ...typography.caption, color: colors.primary },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  docPhoto: {
    width: DOC_PHOTO_SIZE,
    height: DOC_PHOTO_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
  },
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
