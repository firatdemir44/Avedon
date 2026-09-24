import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { CareSymbolPicker } from '../../components/CareSymbolPicker';
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
  docImageInput,
  emptyCompositionRow,
  newKey,
  splitCompositionText,
  toDateInput,
  withCertificateImage,
  type CertificateRow,
  type CompositionRow,
  type DocImage,
} from '../../components/passport/rows';
import { DocField } from '../../components/passport/DocField';
import { useSession } from '../../context/SessionContext';
import {
  ApiError,
  createProduct,
  deleteProduct,
  dismissProductDraft,
  extractPassport,
  fetchProductDraft,
  markProductDraftUsed,
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
import {
  captureCompressedImage,
  fitDataUrl,
  pickCompressedImage,
  pickCompressedImages,
} from '../../features/imagePicker';
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
  MAX_PRODUCT_IMAGE_CHARS,
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
  WIDTH_MEANINGS,
  WIDTH_MEANING_LABELS,
  WIDTH_TYPES,
  WIDTH_TYPE_LABELS,
  effectiveWidthCm,
} from '../../features/products/glossaryLabels';
import { formatMeasure, parseNumber, toInputNumber } from '../../features/calculators/parse';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import {
  useBottomPadding,
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
  SkeletonText,
} from '../../ui';

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
// silinmesin diye); kaydederken sayıya çevriliyor. Kompozisyon ve sertifika
// satırlarının tipleri iplik formuyla ortak (components/passport/rows.ts).

interface YarnRow {
  key: string;
  role: string;
  count: string;
  unit: string;
  ply: string;
  yarnType: string;
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
const testKindSuggestions = () => [
  tr('Çekme'),
  tr('Boncuklanma (pilling)'),
  tr('Renk haslığı'),
  tr('Yıkama sonrası boyut değişimi'),
  tr('Gramaj'),
  tr('Patlama mukavemeti'),
];

// Sunucudaki testReportSchema ile aynı (backend/src/passport.ts).
const MAX_TEST_KIND_CHARS = 80;
const MAX_TEST_RESULT_CHARS = 200;

const TYPE_OPTIONS = PRODUCT_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }));
const unitOptions = () =>
  STOCK_UNITS.map((value) => ({
    value,
    label: value === 'm' ? tr('Metre (m)') : tr('Kilogram (kg)'),
  }));
// ChipSelect tek seçim; boş değer "belirtilmemiş" demek.
const widthTypeOptions = (): { value: string; label: string }[] => [
  { value: '', label: tr('Belirtilmemiş') },
  ...WIDTH_TYPES.map((value) => ({ value, label: WIDTH_TYPE_LABELS[value] })),
];
// Tüp ende: girilen en tek yüzün eni mi, yoksa zaten açık en mi. Varsayılan
// seçili değil (boş = belirtilmemiş, hesap eni girilen en olur).
const WIDTH_MEANING_OPTIONS: { value: string; label: string }[] = WIDTH_MEANINGS.map((value) => ({
  value,
  label: WIDTH_MEANING_LABELS[value],
}));
const YARN_ROLE_OPTIONS: { value: string; label: string }[] = YARN_ROLES.map((r) => ({ value: r.key, label: r.label }));
const YARN_UNIT_OPTIONS: { value: string; label: string }[] = YARN_UNITS.map((u) => ({ value: u.key, label: u.label }));
const YARN_TYPE_OPTIONS: { value: string; label: string }[] = YARN_TYPES.map((t) => ({ value: t.key, label: t.label }));
const moqUnitOptions = (): { value: StockUnit; label: string }[] => [
  { value: 'm', label: tr('Metre') },
  { value: 'kg', label: tr('Kilogram') },
];
const CURRENCY_OPTIONS: { value: string; label: string }[] = PRICE_CURRENCIES.map((value) => ({
  value,
  label: value,
}));
const priceUnitOptions = (): { value: StockUnit; label: string }[] => [
  { value: 'm', label: tr('metre başına') },
  { value: 'kg', label: tr('kilogram başına') },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Sunucu bakım sembolü hatalarını 400 invalid_body + fieldErrors.careSymbols
// olarak döndürür (backend/src/routes/products.ts, PassportError). Kullanıcıya
// "kaydedilemedi" yerine sebebi yazılır.
function careSymbolError(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const fieldErrors = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
  const codes = fieldErrors?.careSymbols ?? [];
  if (codes.includes('one_symbol_per_group')) return tr('Bakım sembollerinde her gruptan yalnızca bir sembol seçilebilir.');
  if (codes.includes('unknown_care_symbol')) return tr('Tanınmayan bir bakım sembolü seçildi. Seçimi yenileyip tekrar deneyin.');
  return null;
}
// Sunucudaki MAX_EXTRACT_IMAGES ile aynı.
const MAX_EXTRACT_IMAGES = 4;
// Sunucudaki MAX_TEXT_CHARS ile aynı.
const MAX_EXTRACT_TEXT = 4000;

// Etiket okuma hataları (sunucu kodları) → ekranda görünen Türkçe metin.
function extractErrorMessage(err: unknown) {
  const code = err instanceof ApiError ? err.code : undefined;
  if (code === 'extract_not_configured') return tr('Fotoğraftan doldurma bu sunucuda etkin değil.');
  if (code === 'image_too_large') return tr('Fotoğraf çok büyük. Daha küçük bir fotoğraf seçin.');
  if (code === 'document_too_large') return tr('PDF çok büyük (en fazla 10 MB).');
  if (code === 'extract_input_required') return tr('Okunacak bir fotoğraf, PDF ya da metin seçin.');
  if (err instanceof ApiError && err.status === 0) return tr('Etiket okuma zaman aşımına uğradı, tekrar deneyin.');
  return tr('Etiket okunamadı, tekrar deneyin ya da elle girin.');
}

const emptyYarnRow = (): YarnRow => ({ key: newKey('iplik'), role: '', count: '', unit: 'ne', ply: '1', yarnType: '' });
const emptyTestReportRow = (): TestReportRow => ({
  key: newKey('rapor'),
  kind: '',
  result: '',
  testedAt: '',
  image: { kind: 'none' },
});

// Ürün kartı formu: çoklu fotoğraf, çeşit → alt çeşit, kullanım amaçları,
// metre/kg stok ve kumaş pasaportu (kompozisyon, ticari bilgiler, iplik,
// sertifikalar). Yeni tasarım (4. adım, DESIGN.md §2/§3): AppBar + Screen,
// bölümler SectionTitle + Card, alanlar ui/Input, çipler ui/Chip, tek dolu
// kaydet düğmesi yapışkan alt çubukta. Veri katmanı ve gönderilen gövde
// eskisiyle AYNI. Ham hex / ham px yok.
export function AddProductScreen({ navigation, route }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { user } = useSession();
  const productId = route.params?.productId ?? null;
  const isEditing = !!productId;
  // WhatsApp taslağından gelindiyse (yalnızca yeni üründe anlamlı).
  const draftId = !productId ? (route.params?.draftId ?? null) : null;
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
  // Bakım sembolleri (Fırat 2026-09-21): serbest metin yerine etiket sembolleri.
  // `careNotes` sunucuda duruyor ama bu formdan artık GÖNDERİLMİYOR; eski
  // kayıttaki metne dokunulmaz.
  const [careSymbols, setCareSymbols] = useState<string[]>([]);
  const [careOpen, setCareOpen] = useState(false);
  const dppInitial = useRef<{ originCountry: string; careSymbols: string[]; recycledPercent: number | null }>({
    originCountry: '',
    careSymbols: [],
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

  // --- WhatsApp taslağı ---
  // Taslak yükleniyor / yüklenemedi durumu ve fotoğrafla ilgili kısa not
  // (fotoğraf ürün fotoğrafı sınırına sığmadıysa eklenmez).
  const [draftLoading, setDraftLoading] = useState(!!draftId);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [draftDismissing, setDraftDismissing] = useState(false);
  // Taslak yalnızca BİR kez açılır: onay ekranından forma dönüldüğünde
  // (popTo + merge, draftId parametrede kalır) yeniden açılmasın.
  const draftOpened = useRef(false);

  useEffect(() => {
    if (!draftId || draftOpened.current) return;
    draftOpened.current = true;
    let cancelled = false;
    setDraftLoading(true);
    fetchProductDraft(draftId)
      .then(async ({ draft }) => {
        if (cancelled) return;
        // Etiket fotoğrafı ürünün ilk (kapak) fotoğrafı olarak önerilir;
        // kullanıcı kaldırabilir.
        if (draft.imageUrl) {
          const fitted = await fitDataUrl(draft.imageUrl, MAX_PRODUCT_IMAGE_CHARS);
          if (cancelled) return;
          if (fitted) {
            setPhotos([{ key: newKey('taslak'), uri: fitted.uri, dataUrl: fitted.dataUrl }]);
            setPhotosDirty(true);
          } else {
            setDraftNote(tr('Etiket fotoğrafı ürün fotoğrafı olarak eklenemedi (çok büyük).'));
          }
        }
        setDraftLoading(false);
        // Etiketten doldurmayla AYNI yol: çıkarım sonucu onay ekranına gider,
        // onaylanan alanlar buraya popTo ile geri döner.
        navigation.navigate('PassportReview', { outcome: draft.outcome });
      })
      .catch((err) => {
        if (cancelled) return;
        setDraftLoading(false);
        setDraftError(
          err instanceof ApiError && err.status === 404
            ? tr('Bu taslak kullanılmış ya da silinmiş.')
            : tr('Taslak açılamadı, lütfen tekrar deneyin.')
        );
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, navigation]);

  // Taslağı sil: onaydan sonra sunucudan düşer ve forma dönülmez.
  const handleDismissDraft = async () => {
    if (!draftId || draftDismissing) return;
    const confirmed = await confirmAction({
      title: tr('Taslağı sil'),
      message: tr("WhatsApp'tan gelen bu taslak silinsin mi? Girdiğiniz bilgiler kaydedilmez."),
      confirmLabel: tr('Sil'),
      destructive: true,
    });
    if (!confirmed) return;
    setDraftDismissing(true);
    try {
      await dismissProductDraft(draftId);
      haptics.success();
      navigation.goBack();
    } catch {
      haptics.error();
      setDraftError(tr('Taslak silinemedi, lütfen tekrar deneyin.'));
      setDraftDismissing(false);
    }
  };

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
          setCompositionRows(compositionRowsFrom(composition));
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

        // Pasaport alanları (eski sunucuda hiç gelmez).
        const loadedOrigin = product.originCountry ?? '';
        const loadedCareSymbols = product.careSymbols ?? [];
        const loadedRecycled = product.recycledPercent ?? null;
        dppInitial.current = {
          originCountry: loadedOrigin,
          careSymbols: loadedCareSymbols,
          recycledPercent: loadedRecycled,
        };
        setOriginCountry(loadedOrigin);
        setCareSymbols(loadedCareSymbols);
        setRecycledPercent(loadedRecycled == null ? '' : toInputNumber(loadedRecycled));
        setCareOpen(loadedCareSymbols.length > 0);

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
        setCertificateRows(certificateRowsFrom(certificates));
        setCertificateOpen(certificates.length > 0);
        // Mevcut belge fotoğrafları yalnızca önizleme için çekiliyor;
        // kaydederken sıraları gönderiliyor, kendileri yeniden yüklenmiyor.
        for (const certificate of certificates) {
          if (!certificate.hasImage) continue;
          fetchCertificateImage(productId, certificate.position)
            .then(({ imageUrl }) => {
              if (cancelled) return;
              setCertificateRows((prev) => withCertificateImage(prev, certificate.position, imageUrl));
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
        if (!cancelled) setError(tr('Ürün yüklenemedi, lütfen tekrar deneyin.'));
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
          ? tr('Kameraya erişim izni verilmedi.')
          : tr('Fotoğraf işlenemedi, lütfen tekrar deneyin.')
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
          ? tr('Galeriye erişim izni verilmedi.')
          : tr('Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.')
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
          ? tr('PDF çok büyük (en fazla 10 MB).')
          : tr('PDF okunamadı, lütfen başka bir dosya deneyin.')
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
      setCompositionRows(compositionRowsFrom(values.composition.slice(0, MAX_COMPOSITION_ROWS)));
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
          image: { kind: 'none' } as DocImage,
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

  // --- Kompozisyon satırları (editör ortak: components/passport) ---
  const changeCompositionRows = (rows: CompositionRow[]) => {
    setCompositionRows(rows);
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

  // --- Sertifika satırları (editör ortak: components/passport) ---
  const changeCertificateRows = (rows: CertificateRow[], change?: 'image') => {
    setCertificateRows(rows);
    // Belge fotoğrafı eklemek çıkarım değerini değiştirmez.
    if (change !== 'image') forgetExtracted('certificates');
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

  // --- Doğrulama ---
  const stockNum = parseNumber(stock);
  const weightGsmNum = parseNumber(weightGsm);
  const widthCmNum = parseNumber(widthCm);

  // Canlı bilgi satırı: "Hesap eni: 160 cm (80 × 2)" ya da "Hesap eni: 80 cm".
  // En girilmediyse ya da tüp en seçili değilse gösterilmez.
  const effectiveWidthText =
    widthType === 'tup' && widthCmNum > 0
      ? widthMeaning === 'tup_tek_yuz'
        ? tr('Hesap eni: {w} cm ({x} × 2)', {
            w: formatMeasure(effectiveWidthCm(widthCmNum, widthMeaning)),
            x: formatMeasure(widthCmNum),
          })
        : tr('Hesap eni: {w} cm', { w: formatMeasure(widthCmNum) })
      : '';

  const {
    valid: validCompositionRows,
    total: compositionTotal,
    incomplete: compositionRowsIncomplete,
  } = compositionState(compositionRows);
  const compositionIncomplete = compositionRowMode && compositionRowsIncomplete;
  const hasComposition = compositionRowMode && validCompositionRows.length > 0;

  const filledYarnRows = yarnRows.filter((row) => row.count.trim());
  const yarnIncomplete = filledYarnRows.some((row) => parseNumber(row.count) <= 0 || !row.unit);

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
  if (compositionIncomplete) formErrors.push(tr('Kompozisyon satırlarında lif ve yüzdeyi birlikte doldurun (yüzde 0 ile 100 arası).'));
  if (yarnIncomplete) formErrors.push(tr('İplik satırlarında numara sıfırdan büyük olmalı ve birim seçilmeli.'));
  if (certificateIncomplete(certificateRows)) formErrors.push(tr('Her sertifika satırında bir sertifika adı seçin.'));
  if (certificateDateInvalid(certificateRows))
    formErrors.push(tr('Sertifika geçerlilik tarihini YYYY-AA-GG biçiminde yazın (örn. 2027-03-01).'));
  if (testReportIncomplete) formErrors.push(tr('Her test raporu satırında test türünü yazın.'));
  if (testReportDateInvalid) formErrors.push(tr('Test tarihini YYYY-AA-GG biçiminde yazın (örn. 2027-03-01).'));
  // AB pasaportuna hazırlık: oran 0-100 arası (0 geçerli, boş "belirtilmedi").
  if (recycledPercent.trim() && !(parseNumber(recycledPercent) >= 0 && parseNumber(recycledPercent) <= 100))
    formErrors.push(tr('Geri dönüştürülmüş içerik oranı 0 ile 100 arasında olmalı.'));

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
    const certificates: CertificateInput[] = certificateInputs(certificateRows);
    const testReports: TestReportInput[] = filledTestReportRows
      .filter((row) => row.kind.trim())
      .map((row) => ({
        kind: row.kind.trim(),
        result: row.result.trim(),
        testedAt: row.testedAt.trim() ? row.testedAt.trim() : null,
        image: docImageInput(row.image),
      }));
    // Çıkarımdan gelip forma aktarılan ve elle değiştirilmemiş alanlar; sunucu
    // ProductFieldMeta satırını onaylanmış olarak yazar. Boşsa gönderilmez.
    const fieldMeta: FieldMetaInput[] = (Object.keys(extractedFields) as ExtractionFieldName[]).map((field) => ({
      field,
      confidence: extractedFields[field]!,
      // Taslaktan gelen alanların kaynağı WhatsApp (sunucu bu kaynağı tanıyor).
      source: draftId ? 'whatsapp' : 'extracted',
      confirmed: true,
    }));
    const moqNum = moq.trim() ? parseNumber(moq) : null;
    const leadTimeNum = leadTimeDays.trim() ? Math.round(parseNumber(leadTimeDays)) : null;
    const priceNum = priceValue.trim() ? parseNumber(priceValue) : null;
    // AB pasaportuna hazırlık: alan yalnızca doluysa ya da önceden dolu olup
    // şimdi temizlendiyse gönderilir. Böylece bu alanları tanımayan bir
    // sunucuya boş yeni üründe hiç gitmez.
    const originTrimmed = originCountry.trim();
    const recycledNum = recycledPercent.trim() ? parseNumber(recycledPercent) : null;
    const dpp = {
      ...(originTrimmed || dppInitial.current.originCountry ? { originCountry: originTrimmed } : {}),
      // Bakım sembolleri: doluysa ya da önceden dolu olup şimdi hepsi
      // kaldırıldıysa gönderilir (o durumda boş dizi sunucudakini siler).
      ...(careSymbols.length || dppInitial.current.careSymbols.length ? { careSymbols } : {}),
      // 0 geçerli bir değer: `!= null` ile bakılıyor.
      ...(recycledNum != null || dppInitial.current.recycledPercent != null
        ? { recycledPercent: recycledNum }
        : {}),
    };
    return {
      ...(hasComposition ? { composition: compositionItems(validCompositionRows) } : {}),
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
      title: tr('Ürün kaydedildi'),
      message: tr('Ürün kaydedildi. Akışta paylaşılsın mı?'),
      confirmLabel: tr('Akışta paylaş'),
      cancelLabel: tr('Şimdi değil'),
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
        // Taslak kullanıldı: listeden düşsün. Hata olursa sessiz geçilir
        // (ürün zaten kaydedildi).
        if (draftId) markProductDraftUsed(draftId).catch(() => {});
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
    } catch (err) {
      haptics.error();
      setError(careSymbolError(err) ?? tr('Ürün kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    const confirmed = await confirmAction({
      title: tr('Ürünü sil'),
      message: tr('{name} silinsin mi? Ürüne gelen numune talepleri de silinir.', { name: code || tr('Bu ürün') }),
      confirmLabel: tr('Sil'),
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
      setError(tr('Ürün silinemedi, lütfen tekrar deneyin.'));
      setDeleting(false);
    }
  };

  const subtypeOptions = [
    { value: '', label: tr('Belirtilmemiş') },
    ...SUBTYPES[type].map((s) => ({ value: s.key, label: s.label })),
  ];

  const appBar = (
    <AppBar title={isEditing ? tr('Ürünü düzenle') : tr('Ürün ekle')} leading="back" onBack={() => navigation.goBack()} />
  );

  if (loading || draftLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {appBar}
        <Screen>
          <SkeletonText lines={2} />
          <SkeletonText lines={4} />
          <SkeletonText lines={3} />
        </Screen>
      </View>
    );
  }

  // --- Sunum yardımcıları (yalnızca görünüm) ---
  const hint = (text: string) => <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>;
  const fieldLabel = (text: string) => <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;

  const dangerBanner = (text: string, key?: string) => (
    <View
      key={key ?? text}
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
      <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{text}</Text>
    </View>
  );

  const section = (title: string, children: React.ReactNode) => (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title={title} />
      <Card>
        <View style={{ gap: t.space[3] }}>{children}</View>
      </Card>
    </View>
  );

  // Daraltılabilir bölüm: başlık satırı 44px dokunma hedefi, sağda chevron.
  const collapsible = (title: string, open: boolean, onToggle: () => void, children: React.ReactNode) => (
    <View style={{ gap: t.space[3] }}>
      <Pressable
        onPress={() => {
          haptics.selection();
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? tr('{title}, kapat', { title }) : tr('{title}, aç', { title })}
        style={{
          minHeight: t.size.touchMin,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: t.space[3],
        }}
      >
        <Text accessibilityRole="header" numberOfLines={1} style={[t.type.title18, { color: t.colors.ink, flexShrink: 1 }]}>
          {title}
        </Text>
        <Icon name={open ? 'chevron-up-outline' : 'chevron-down-outline'} color="ink3" />
      </Pressable>
      {open ? (
        <Card>
          <View style={{ gap: t.space[3] }}>{children}</View>
        </Card>
      ) : null}
    </View>
  );

  const singleChips = <T extends string>(
    label: string,
    options: readonly { value: T; label: string }[],
    value: T,
    onChange: (v: T) => void,
    subHint?: string
  ) => (
    <View style={{ gap: t.space[1] }}>
      {fieldLabel(label)}
      {subHint ? hint(subHint) : null}
      <ChipRow>
        {options.map((o) => (
          <Chip
            key={o.value || 'bos'}
            label={o.label}
            selected={o.value === value}
            onPress={() => {
              haptics.selection();
              onChange(o.value);
            }}
          />
        ))}
      </ChipRow>
    </View>
  );

  const multiChips = (
    label: string,
    options: readonly { key: string; label: string }[],
    values: string[],
    onChange: (v: string[]) => void,
    subHint?: string
  ) => (
    <View style={{ gap: t.space[1] }}>
      {fieldLabel(label)}
      {subHint ? hint(subHint) : null}
      <ChipRow>
        {options.map((o) => {
          const on = values.includes(o.key);
          return (
            <Chip
              key={o.key}
              label={o.label}
              selected={on}
              onPress={() => {
                haptics.selection();
                onChange(on ? values.filter((v) => v !== o.key) : [...values, o.key]);
              }}
            />
          );
        })}
      </ChipRow>
    </View>
  );

  const iconSquare = (name: React.ComponentProps<typeof Icon>['name']) => (
    <View
      style={{
        width: t.size.avatar,
        height: t.size.avatar,
        borderRadius: t.radius.sm,
        backgroundColor: t.colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} color="brand" />
    </View>
  );

  // Tekrarlanan satır kutusu (iplik, test raporu): ince çerçeve, başlık + kaldır.
  const rowCard = (
    key: string,
    title: string,
    removeLabel: string,
    onRemove: () => void,
    children: React.ReactNode
  ) => (
    <View
      key={key}
      style={{
        borderWidth: 1,
        borderColor: t.colors.line,
        borderRadius: t.radius.md,
        padding: t.space[3],
        gap: t.space[3],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2] }}>
        <Text style={[t.type.label14, { color: t.colors.brand }]}>{title}</Text>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          style={({ pressed }) => ({
            width: t.size.touchMin,
            height: t.size.touchMin,
            marginRight: -t.space[2],
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: t.radius.md,
            backgroundColor: pressed ? t.colors.surface2 : 'transparent',
          })}
        >
          <Icon name="x" size={t.size.iconSm} color="ink2" />
        </Pressable>
      </View>
      {children}
    </View>
  );

  const submitLabel = isEditing ? tr('Değişiklikleri kaydet') : tr('Ürünü kaydet');

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {appBar}
      <Screen
        scroll={false}
        noPadding
        sticky={
          savedWarnings ? (
            <Button
              size="lg"
              label={tr('Devam')}
              onPress={() => {
                if (createdProductId) void offerFeedShare(createdProductId);
                else navigation.goBack();
              }}
            />
          ) : (
            <Button
              size="lg"
              label={submitLabel}
              loading={submitting}
              disabled={!canSubmit || deleting}
              onPress={handleSubmit}
            />
          )
        }
      >
        {/* Kendi ScrollView'u: kayıt uyarısı gelince başa kaydırmak için ref gerekiyor. */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad, gap: t.space[6] }}
          keyboardShouldPersistTaps="handled"
        >
          {draftId ? (
            <Card>
              <View style={{ gap: t.space[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2] }}>
                  <Icon name="whatsapp" size={t.size.iconSm} color="ink2" />
                  <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>
                    {tr("WhatsApp'tan gönderdiğiniz etiketten hazırlandı. Fiyat ve stok etiketten alınmaz.")}
                  </Text>
                </View>
                {draftNote ? hint(draftNote) : null}
                {draftError ? dangerBanner(draftError) : null}
                <Button kind="danger" label={tr('Taslağı sil')} loading={draftDismissing} onPress={handleDismissDraft} />
              </View>
            </Card>
          ) : null}

          {savedWarnings ? (
            <View
              accessibilityRole="alert"
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: t.space[2],
                padding: t.space[3],
                borderRadius: t.radius.md,
                backgroundColor: t.colors.warningSoft,
              }}
            >
              <Icon name="warning" size={t.size.iconSm} color="warning" />
              <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
                <Text style={[t.type.label14, { color: t.colors.warning }]}>{tr('Kaydedildi. Dikkat:')}</Text>
                {savedWarnings.map((note) => (
                  <Text key={note} style={[t.type.body14, { color: t.colors.ink }]}>
                    {note}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {section(
            tr('Fotoğraflar ({n}/{max})', { n: photos.length, max: MAX_PRODUCT_IMAGES }),
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {photos.map((photo, index) => (
                  <View key={photo.key} style={{ width: t.size.thumb, height: t.size.thumb }}>
                    <Pressable
                      onPress={() => index > 0 && makeCover(photo.key)}
                      disabled={index === 0}
                      // Yanındaki kaldır düğmesiyle kardeş (iç içe değil): web'de
                      // iç içe <button> oluşmasın.
                      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                      accessibilityLabel={
                        index === 0 ? tr('Fotoğraf {n}, kapak', { n: index + 1 }) : tr('Fotoğraf {n}, kapak yap', { n: index + 1 })
                      }
                      style={({ pressed }) => ({
                        width: t.size.thumb,
                        height: t.size.thumb,
                        borderRadius: t.radius.sm,
                        borderWidth: 1,
                        borderColor: t.colors.line,
                        backgroundColor: t.colors.surface2,
                        overflow: 'hidden',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      {photo.uri ? (
                        <Image source={{ uri: photo.uri }} style={{ width: t.size.thumb, height: t.size.thumb }} />
                      ) : (
                        <ActivityIndicator color={t.colors.ink3} />
                      )}
                    </Pressable>
                    {index === 0 ? (
                      <Badge
                        kind="info"
                        label={tr('Kapak')}
                        style={{ position: 'absolute', left: t.space[1], bottom: t.space[1] }}
                      />
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
                      <Icon name="x" size={t.size.iconXs} colorValue={t.colors.onBrand} />
                    </Pressable>
                  </View>
                ))}
                {photos.length < MAX_PRODUCT_IMAGES ? (
                  <Pressable
                    onPress={addPhoto}
                    disabled={pickingImage}
                    accessibilityRole="button"
                    accessibilityLabel={tr('Fotoğraf ekle')}
                    style={({ pressed }) => ({
                      width: t.size.thumb,
                      height: t.size.thumb,
                      borderRadius: t.radius.sm,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: t.colors.lineStrong,
                      backgroundColor: pressed ? t.colors.surface2 : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: t.space[1] / 2,
                    })}
                  >
                    {pickingImage ? (
                      <ActivityIndicator color={t.colors.brand} />
                    ) : (
                      <>
                        <Icon name="plus" color="brand" />
                        <Text style={[t.type.caption12, { color: t.colors.brand }]}>{tr('Fotoğraf')}</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
              {hint(tr('İlk fotoğraf kapak olur. Başka bir fotoğrafı kapak yapmak için üstüne dokunun.'))}
            </>
          )}

          {section(
            tr('Etiketten doldur'),
            <>
              {hint(
                tr('Etiket, kartela ya da test raporundan bilgileri okuyup forma dolduralım. Aktarmadan önce siz onaylarsınız.')
              )}
              <Button
                kind="secondary"
                fullWidth
                label={tr('Etiketten doldur')}
                icon="scan-outline"
                loading={extracting}
                onPress={() => {
                  haptics.selection();
                  setExtractError(null);
                  setSourceOpen((v) => !v);
                }}
              />

              {sourceOpen && !extracting ? (
                <View>
                  {/* Kamera yalnızca telefonda; web'de tarayıcı kamerası yok. */}
                  {Platform.OS !== 'web' ? (
                    <ListRow title={tr('Fotoğraf çek')} left={iconSquare('camera')} onPress={extractFromCamera} />
                  ) : null}
                  <ListRow
                    title={tr('Galeriden seç')}
                    subtitle={tr('En fazla {n} fotoğraf', { n: MAX_EXTRACT_IMAGES })}
                    left={iconSquare('images-outline')}
                    onPress={extractFromGallery}
                  />
                  <ListRow
                    title={tr('PDF seç')}
                    subtitle={tr('Test raporu ya da kartela belgesi')}
                    left={iconSquare('quote')}
                    onPress={extractFromPdf}
                  />
                  <ListRow
                    title={tr('Metin yapıştır')}
                    subtitle={tr('WhatsApp\'tan gelen etiket bilgisi')}
                    left={iconSquare('clipboard-outline')}
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
                <View style={{ gap: t.space[3] }}>
                  <Input
                    label={tr('Etiket metni')}
                    value={pasteText}
                    onChangeText={setPasteText}
                    placeholder={tr('Örn. 95% CO 5% EA, 220 gsm, 180 cm tubular')}
                    multiline
                    maxLength={MAX_EXTRACT_TEXT}
                  />
                  <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                    <Button
                      kind="secondary"
                      label={tr('Oku')}
                      disabled={!pasteText.trim() || extracting}
                      onPress={extractFromText}
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

              {extractError ? dangerBanner(extractError) : null}
            </>
          )}

          {section(
            tr('Kumaş'),
            <>
              {singleChips(tr('Çeşit'), TYPE_OPTIONS, type, changeType)}
              {SUBTYPES[type].length > 0 ? singleChips(tr('Alt çeşit'), subtypeOptions, subtype, changeSubtype) : null}
              {singleChips(tr('En tipi'), widthTypeOptions(), widthType, changeWidthType)}
              {widthType === 'tup' ? (
                <>
                  {hint(tr('Tüp en genellikle ham kumaşta olur; boyalı kumaş çoğunlukla açık endir.'))}
                  {singleChips(tr('Girdiğiniz en neyi gösteriyor?'), WIDTH_MEANING_OPTIONS, widthMeaning, setWidthMeaning)}
                  {effectiveWidthText ? (
                    <Text style={[t.type.mono14, { color: t.colors.ink2 }]}>{effectiveWidthText}</Text>
                  ) : null}
                </>
              ) : null}
              {multiChips(
                tr('Kullanım amaçları'),
                USAGES,
                usages,
                changeUsages,
                tr('Birden fazla seçebilirsiniz; alıcılar bu başlıklarla arıyor.')
              )}
              {multiChips(tr('Apre / boya'), FINISH_TAGS, finishTags, changeFinishTags, tr('Kumaşa uygulanan işlemler.'))}
            </>
          )}

          {section(
            tr('Bilgiler'),
            <>
              <Input label={tr('Ürün kodu')} value={code} onChangeText={changeCode} placeholder={tr('Örn. ORM-1042')} autoCapitalize="characters" />

              <View style={{ gap: t.space[2] }}>
                {fieldLabel(tr('Kompozisyon'))}
                {compositionRowMode ? (
                  <>
                    <CompositionEditor
                      rows={compositionRows}
                      onChange={changeCompositionRows}
                      hint={tr('Her satırda bir lif ve oranı. Toplam genelde 100 olur.')}
                      percentPlaceholder={tr('Örn. 95')}
                      totalWarning={compositionTotal !== 100}
                      totalSuffix={compositionTotal !== 100 ? tr(' (genelde 100 olur, yine de kaydedebilirsiniz)') : ''}
                    />
                    {/* Listede olmayan bir lif ya da serbest bir açıklama gerekiyorsa metne dönüş. */}
                    <Button
                      kind="quiet"
                      label={tr('Metin olarak yazmak istiyorum')}
                      accessibilityLabel={tr('İçeriği metin olarak yaz')}
                      onPress={() => {
                        haptics.selection();
                        setCompositionRowMode(false);
                        forgetExtracted('composition');
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Input label={tr('İçerik')} value={content} onChangeText={setContent} placeholder={tr('Örn. %95 Pamuk %5 Elastan')} />
                    <Button
                      kind="secondary"
                      label={tr('Satırlara böl')}
                      icon="yarn"
                      accessibilityLabel={tr('İçeriği kompozisyon satırlarına böl')}
                      onPress={switchToCompositionRows}
                    />
                    {hint(tr('Satırlara bölerseniz alıcılar lif ve orana göre arayabilir.'))}
                  </>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                <Input
                  containerStyle={{ flex: 1 }}
                  label={tr('Gramaj')}
                  unit="gr/m²"
                  value={weightGsm}
                  onChangeText={changeWeightGsm}
                  placeholder={tr('Örn. 220')}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                />
                <Input
                  containerStyle={{ flex: 1 }}
                  label={tr('En')}
                  unit="cm"
                  value={widthCm}
                  onChangeText={changeWidthCm}
                  placeholder={tr('Örn. 150')}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                />
              </View>
              {singleChips(tr('Stok birimi'), unitOptions(), stockUnit, setStockUnit)}
              <Input
                label={tr('Stok')}
                unit={STOCK_UNIT_LABELS[stockUnit].long}
                value={stock}
                onChangeText={setStock}
                placeholder={stockUnit === 'm' ? tr('Örn. 1200') : tr('Örn. 450')}
                inputMode="decimal"
                keyboardType="decimal-pad"
              />
              <Input
                label={tr('Not (isteğe bağlı)')}
                value={useArea}
                onChangeText={setUseArea}
                placeholder={tr('Örn. Şardonlu, yıkamalı')}
              />
              {/* Pasaport alanları diğer ürün bilgileriyle birlikte girilir; ayrı
                  bir "pasaport için yeniden gir" bölümü YOK (Fırat 2026-09-21). */}
              <Input
                label={tr('Menşe ülke (isteğe bağlı)')}
                value={originCountry}
                onChangeText={setOriginCountry}
                placeholder={tr('Örn. Türkiye')}
                maxLength={60}
              />
              <Input
                label={tr('Geri dönüştürülmüş içerik')}
                unit="%"
                value={recycledPercent}
                onChangeText={setRecycledPercent}
                placeholder={tr('Örn. 30')}
                inputMode="decimal"
                keyboardType="decimal-pad"
                helper={tr('Dijital pasaportta görünür.')}
              />
            </>
          )}

          {/* Bakım sembolleri: etiketteki uluslararası işaretler; yazı yerine
              sembol (Fırat 2026-09-21). Sembol listesi ve çizim tarifi tek
              kaynaktan: backend/src/domain/care.ts → features/care/symbols.ts. */}
          {collapsible(
            careSymbols.length ? tr('Bakım sembolleri · {n} seçili', { n: careSymbols.length }) : tr('Bakım sembolleri'),
            careOpen,
            () => setCareOpen((v) => !v),
            <CareSymbolPicker value={careSymbols} onChange={setCareSymbols} />
          )}

          {section(
            tr('Ticari'),
            <>
              <Input
                label={tr('En az sipariş (MOQ)')}
                unit={moqUnit}
                value={moq}
                onChangeText={setMoq}
                placeholder={tr('Örn. 300')}
                inputMode="decimal"
                keyboardType="decimal-pad"
              />
              {singleChips(tr('MOQ birimi'), moqUnitOptions(), moqUnit, setMoqUnit, tr('Stok biriminden farklı olabilir.'))}
              <Input
                label={tr('Termin')}
                unit={tr('gün')}
                value={leadTimeDays}
                onChangeText={setLeadTimeDays}
                placeholder={tr('Örn. 15')}
                inputMode="numeric"
                keyboardType="number-pad"
              />
              <Input
                label={tr('Fiyat')}
                unit={`${priceCurrency}/${priceUnit}`}
                value={priceValue}
                onChangeText={setPriceValue}
                placeholder={tr('Örn. 4,50')}
                inputMode="decimal"
                keyboardType="decimal-pad"
              />
              {singleChips(tr('Para birimi'), CURRENCY_OPTIONS, priceCurrency, setPriceCurrency)}
              {singleChips(tr('Fiyat birimi'), priceUnitOptions(), priceUnit, setPriceUnit)}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space[2],
                  padding: t.space[3],
                  borderRadius: t.radius.md,
                  backgroundColor: t.colors.surface2,
                }}
              >
                <Icon name="info" size={t.size.iconSm} color="ink2" />
                <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>
                  {tr('Fiyat yalnızca size görünür. Diğer firmalar ürün sayfasında fiyatı görmez.')}
                </Text>
              </View>
            </>
          )}

          {collapsible(
            filledYarnRows.length ? tr('İplik ({n})', { n: filledYarnRows.length }) : tr('İplik'),
            yarnOpen,
            () => setYarnOpen((v) => !v),
            <>
              {yarnRows.length === 0
                ? hint(tr('İplik numarası ve tipi girilirse alıcı kumaşın tuşesini tahmin edebilir.'))
                : null}
              {yarnRows.map((row, index) =>
                rowCard(
                  row.key,
                  tr('{n}. iplik', { n: index + 1 }),
                  tr('{n}. iplik satırını kaldır', { n: index + 1 }),
                  () => removeYarnRow(row.key),
                  <>
                    {singleChips(tr('Rol'), YARN_ROLE_OPTIONS, row.role, (role) => updateYarnRow(row.key, { role }))}
                    <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                      <Input
                        containerStyle={{ flex: 1 }}
                        label={tr('Numara')}
                        value={row.count}
                        onChangeText={(count) => updateYarnRow(row.key, { count })}
                        placeholder={tr('Örn. 30')}
                        inputMode="decimal"
                        keyboardType="decimal-pad"
                      />
                      <Input
                        containerStyle={{ flex: 1 }}
                        label={tr('Kat')}
                        value={row.ply}
                        onChangeText={(ply) => updateYarnRow(row.key, { ply })}
                        placeholder="1"
                        inputMode="numeric"
                        keyboardType="number-pad"
                      />
                    </View>
                    {singleChips(tr('Numara sistemi'), YARN_UNIT_OPTIONS, row.unit, (unit) =>
                      updateYarnRow(row.key, { unit })
                    )}
                    {singleChips(tr('İplik tipi'), YARN_TYPE_OPTIONS, row.yarnType, (yarnType) =>
                      updateYarnRow(row.key, { yarnType })
                    )}
                  </>
                )
              )}
              {yarnRows.length < MAX_YARNS ? (
                <Button kind="secondary" label={tr('İplik ekle')} icon="plus" accessibilityLabel={tr('İplik satırı ekle')} onPress={addYarnRow} />
              ) : null}
            </>
          )}

          {collapsible(
            certificateRows.length ? tr('Sertifikalar ({n})', { n: certificateRows.length }) : tr('Sertifikalar'),
            certificateOpen,
            () => setCertificateOpen((v) => !v),
            <CertificatesEditor
              rows={certificateRows}
              onChange={changeCertificateRows}
              hint={tr('Sertifika eklenen ürünler aramalarda öne çıkar.')}
              onError={setError}
              picking={pickingDoc}
              onPickingChange={setPickingDoc}
            />
          )}

          {collapsible(
            filledTestReportRows.length ? tr('Test raporları ({n})', { n: filledTestReportRows.length }) : tr('Test raporları'),
            testReportOpen,
            () => setTestReportOpen((v) => !v),
            <>
              {testReportRows.length === 0
                ? hint(tr('Laboratuvar sonuçları (çekme, haslık, boncuklanma) alıcının güvenini artırır.'))
                : null}
              {testReportRows.map((row, index) =>
                rowCard(
                  row.key,
                  tr('{n}. test', { n: index + 1 }),
                  tr('{n}. test raporu satırını kaldır', { n: index + 1 }),
                  () => removeTestReportRow(row.key),
                  <>
                    <Input
                      label={tr('Test türü')}
                      value={row.kind}
                      onChangeText={(kind) => updateTestReportRow(row.key, { kind })}
                      placeholder={tr('Örn. Renk haslığı')}
                      maxLength={MAX_TEST_KIND_CHARS}
                    />
                    {/* Öneri çipleri serbest metni doldurur, kısıtlamaz. */}
                    <ChipRow>
                      {testKindSuggestions().map((suggestion) => (
                        <Chip
                          key={suggestion}
                          label={suggestion}
                          selected={row.kind === suggestion}
                          onPress={() => {
                            haptics.selection();
                            updateTestReportRow(row.key, { kind: suggestion });
                          }}
                        />
                      ))}
                    </ChipRow>
                    <Input
                      label={tr('Sonuç (isteğe bağlı)')}
                      value={row.result}
                      onChangeText={(result) => updateTestReportRow(row.key, { result })}
                      placeholder={tr('Örn. 4-5 (iyi)')}
                      maxLength={MAX_TEST_RESULT_CHARS}
                    />
                    <Input
                      label={tr('Test tarihi (isteğe bağlı)')}
                      helper={tr('YYYY-AA-GG biçiminde.')}
                      value={row.testedAt}
                      onChangeText={(testedAt) => updateTestReportRow(row.key, { testedAt })}
                      placeholder={tr('Örn. 2026-05-14')}
                      autoCapitalize="none"
                    />
                    <DocField
                      image={row.image}
                      onChange={(image) => updateTestReportRow(row.key, { image })}
                      busy={pickingDoc === row.key}
                      onBusyChange={(active) => setPickingDoc(active ? row.key : null)}
                      onError={setError}
                      disabled={pickingDoc !== null && pickingDoc !== row.key}
                      labelPrefix={tr('{n}. test raporu', { n: index + 1 })}
                    />
                  </>
                )
              )}
              {testReportRows.length < MAX_TEST_REPORTS ? (
                <Button
                  kind="secondary"
                  label={tr('Test raporu ekle')}
                  icon="plus"
                  accessibilityLabel={tr('Test raporu satırı ekle')}
                  onPress={addTestReportRow}
                />
              ) : null}
            </>
          )}

          {formErrors.length || error ? (
            <View style={{ gap: t.space[2] }}>
              {formErrors.map((message) => dangerBanner(message))}
              {error ? dangerBanner(error, 'hata') : null}
            </View>
          ) : null}

          {isEditing ? (
            <Button kind="danger" fullWidth label={tr('Ürünü sil')} loading={deleting} onPress={handleDelete} />
          ) : null}
        </ScrollView>
      </Screen>
    </View>
  );
}
