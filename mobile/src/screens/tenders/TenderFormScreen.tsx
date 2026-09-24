// Açık talep (ihale) formu. Fırat'ın tarifi: "96 filament 7 ton polyester
// iplik lazım; ihale gibi talep yayınlayayım, bütün polyester iplikçiler
// teklif versin; kumaş için de aynısı." Talep yayınlanınca sunucu kategoriye
// uyan satıcı firmalara bildirim gönderir (yanıttaki `notified`).
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, Switch, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  createTender,
  type AccessoryType,
  type GarmentDelivery,
  type GarmentType,
  type TenderCategory,
  type TenderAccessorySpec,
  type TenderFabricSpec,
  type TenderGarmentSpec,
  type TenderMediaInput,
  type TenderUnit,
  type TenderYarnSpec,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { formatMeasure, parseNumber } from '../../features/calculators/parse';
import { optionLabel, useYarnOptions } from '../../features/yarns/catalog';
import { PRODUCT_TYPES, SUBTYPES, TYPE_LABELS, type ProductType } from '../../features/products/catalog';
import {
  ACCESSORY_TYPES,
  FABRIC_SUPPLIERS,
  GARMENT_DELIVERY,
  GARMENT_TYPES,
  MEDIA_CAPTIONS,
  TENDER_CAPTION_MAX,
  TENDER_CATEGORIES,
  TENDER_MAX_IMAGES,
  TENDER_MAX_PDFS,
  TENDER_MAX_VIDEOS,
  TENDER_UNITS,
  dateInputToIso,
  accessoryTypeLabel,
  garmentTypeLabel,
  isValidDateInput,
  tenderUnitShort,
} from '../../features/tenders/format';
import { captureCompressedImage, fitDataUrl, pickCompressedImages } from '../../features/imagePicker';
import { pickDocPdf } from '../../components/passport/rows';
import { formatVideoDuration, useVideoUpload, type VideoUploadState } from '../../features/useVideoUpload';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { AppBar, Button, Card, Chip, ChipRow, Icon, Input, Screen, SectionTitle, SegmentControl } from '../../ui';

type Props = RootStackScreenProps<'TenderForm'>;

type CountUnit = NonNullable<TenderYarnSpec['countUnit']>;
type ColorState = NonNullable<TenderYarnSpec['colorState']>;

// Sunucu açık talepte yalnızca bu üç renk durumunu kabul ediyor.
const colorStates = (): { key: ColorState; label: string }[] => [
  { key: 'ham', label: tr('Ham') },
  { key: 'ekru', label: tr('Ekru') },
  { key: 'boyali', label: tr('Boyalı') },
];

// "Viskon / Rejenere (modal, liyosel)" → "Viskon" (başlık önerisi için kısa ad).
function shortFamily(label: string): string {
  return label.split(/[/(]/)[0].trim();
}

// Sunucu sınırı: fotoğraf data URL'i en çok 700 bin karakter.
const MAX_IMAGE_CHARS = 700_000;

type Attachment = { key: string; kind: 'image' | 'pdf'; dataUrl: string; caption: string };
let attachmentSeq = 0;

function Label({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;
}

export function TenderFormScreen({ navigation }: Props) {
  const t = useTheme();
  const yarnOptions = useYarnOptions();

  const [category, setCategory] = useState<TenderCategory>('iplik');
  // İplik
  const [family, setFamily] = useState('');
  const [filaments, setFilaments] = useState('');
  const [count, setCount] = useState('');
  const [countUnit, setCountUnit] = useState<CountUnit>('denye');
  const [colorState, setColorState] = useState<ColorState | ''>('');
  // Kumaş
  const [fabricType, setFabricType] = useState<ProductType | ''>('');
  const [subtype, setSubtype] = useState('');
  const [weight, setWeight] = useState('');
  const [width, setWidth] = useState('');
  const [content, setContent] = useState('');
  // Ortak
  // Konfeksiyon
  const [garmentType, setGarmentType] = useState<GarmentType | ''>('');
  const [garmentFabric, setGarmentFabric] = useState('');
  const [fabricSupplied, setFabricSupplied] = useState<'alici' | 'uretici'>('uretici');
  const [sizes, setSizes] = useState('');
  const [colors, setColors] = useState('');
  const [delivery, setDelivery] = useState<GarmentDelivery[]>([]);
  // Aksesuar
  const [accessoryType, setAccessoryType] = useState<AccessoryType | ''>('');
  const [material, setMaterial] = useState('');
  const [accSize, setAccSize] = useState('');
  // Ekler (fotoğraf + PDF) ve en çok iki video
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const onVideoError = useCallback((m: string) => setMediaError(m), []);
  const video1 = useVideoUpload({ onError: onVideoError });
  const video2 = useVideoUpload({ onError: onVideoError });
  const videoSlots = [video1, video2];
  const [color, setColor] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<TenderUnit>('kg');
  const [targetDate, setTargetDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');
  const [shareToFeed, setShareToFeed] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Kategori değişince birim ona uygun başlasın (iplik kg, kumaş metre).
  const changeCategory = (next: TenderCategory) => {
    setCategory(next);
    setUnit(next === 'kumas' ? 'm' : next === 'iplik' ? 'kg' : 'adet');
    setError(null);
  };

  // Otomatik başlık önerisi: kullanıcı başlığa dokunana kadar alanlardan üretilir.
  const suggestedTitle = useMemo(() => {
    if (category === 'iplik') {
      const parts = [family ? tr('{family} iplik', { family: shortFamily(optionLabel(yarnOptions.families, family)) }) : tr('İplik')];
      if (parseNumber(filaments) > 0) parts.push(tr('{n} filament', { n: parseNumber(filaments) }));
      if (parseNumber(count) > 0) parts.push(`${count.trim()} ${optionLabel(yarnOptions.countUnits, countUnit)}`);
      return parts.join(' · ');
    }
    if (category === 'kumas') {
      const sub = fabricType ? SUBTYPES[fabricType].find((s) => s.key === subtype)?.label : undefined;
      const parts = [sub ?? (fabricType ? tr('{type} kumaş', { type: TYPE_LABELS[fabricType] }) : tr('Kumaş'))];
      if (parseNumber(weight) > 0) parts.push(`${weight.trim()} gr/m²`);
      if (content.trim()) parts.push(content.trim());
      return parts.join(' · ');
    }
    if (category === 'konfeksiyon') {
      const parts = [tr('{type} fason üretim', { type: garmentType ? garmentTypeLabel(garmentType) : tr('Konfeksiyon') })];
      if (parseNumber(quantity) > 0) parts.push(`${formatMeasure(parseNumber(quantity))} ${tenderUnitShort(unit)}`);
      return parts.join(' · ');
    }
    if (category === 'aksesuar') {
      const parts = [accessoryType ? accessoryTypeLabel(accessoryType) : tr('Aksesuar')];
      if (material.trim()) parts.push(material.trim());
      if (accSize.trim()) parts.push(accSize.trim());
      return parts.join(' · ');
    }
    return '';
  }, [accessoryType, material, accSize, category, family, filaments, count, countUnit, fabricType, subtype, weight, content, yarnOptions, garmentType, quantity, unit]);

  const effectiveTitle = titleEdited ? title : suggestedTitle;

  const quantityValue = parseNumber(quantity);
  const targetInvalid = !isValidDateInput(targetDate);
  const deadlineInvalid = !isValidDateInput(deadline);
  const titleInvalid = effectiveTitle.trim().length < 3;
  const videoUploading = videoSlots.some((v) => v.uploading);
  const uploadedVideoIds = videoSlots.map((v) => v.uploadedRef?.id).filter((id): id is string => !!id);
  const busyMedia = picking || videoUploading;
  const canSubmit =
    quantityValue > 0 && !titleInvalid && !targetInvalid && !deadlineInvalid && !submitting && !busyMedia;

  const imageCount = attachments.filter((a) => a.kind === 'image').length;
  const pdfCount = attachments.filter((a) => a.kind === 'pdf').length;
  const imageRoom = TENDER_MAX_IMAGES - imageCount;

  const addImages = async (dataUrls: string[]) => {
    const added: Attachment[] = [];
    let tooLarge = false;
    for (const url of dataUrls.slice(0, imageRoom)) {
      const fitted = await fitDataUrl(url, MAX_IMAGE_CHARS);
      if (!fitted) {
        tooLarge = true;
        continue;
      }
      added.push({ key: `img-${++attachmentSeq}`, kind: 'image', dataUrl: fitted.dataUrl, caption: '' });
    }
    if (added.length) setAttachments((prev) => [...prev, ...added]);
    if (tooLarge) setMediaError(tr('Bir fotoğraf çok büyük olduğu için eklenemedi.'));
  };

  const pickPhotos = async (camera: boolean) => {
    if (imageRoom <= 0 || picking) return;
    setMediaError(null);
    setPicking(true);
    try {
      // Web'de tarayıcı kamerası yok: galeri açılır (telefon tarayıcısı zaten "kamera" seçeneği sunar).
      if (camera && Platform.OS !== 'web') {
        const shot = await captureCompressedImage();
        if (shot) await addImages([shot.dataUrl]);
      } else {
        const picked = await pickCompressedImages(imageRoom);
        await addImages(picked.map((i) => i.dataUrl));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setMediaError(
        msg === 'camera_permission_denied'
          ? tr('Kameraya erişim izni verilmedi.')
          : msg === 'permission_denied'
            ? tr('Galeriye erişim izni verilmedi.')
            : tr('Fotoğraf eklenemedi, tekrar deneyin.')
      );
    } finally {
      setPicking(false);
    }
  };

  const pickPdf = async () => {
    if (pdfCount >= TENDER_MAX_PDFS || picking) return;
    setMediaError(null);
    setPicking(true);
    try {
      const res = await pickDocPdf();
      if (!res) return;
      if ('error' in res) {
        setMediaError(res.error);
        return;
      }
      const picked = res.image;
      if (picked.kind !== 'new') return;
      setAttachments((prev) => [
        ...prev,
        { key: `pdf-${++attachmentSeq}`, kind: 'pdf', dataUrl: picked.dataUrl, caption: 'Teknik föy' },
      ]);
    } finally {
      setPicking(false);
    }
  };

  const addVideo = () => {
    const slot = videoSlots.find((v) => !v.video);
    if (!slot) return;
    setMediaError(null);
    slot.pickAndUpload();
  };

  const setCaption = (key: string, caption: string) =>
    setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, caption: caption.slice(0, TENDER_CAPTION_MAX) } : a)));
  const removeAttachment = (key: string) => setAttachments((prev) => prev.filter((a) => a.key !== key));

  const toggleDelivery = (d: GarmentDelivery) =>
    setDelivery((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const buildSpec = (): TenderYarnSpec | TenderFabricSpec | TenderGarmentSpec | TenderAccessorySpec | undefined => {
    if (category === 'aksesuar') {
      const spec: TenderAccessorySpec = {};
      if (accessoryType) spec.accessoryType = accessoryType;
      if (material.trim()) spec.material = material.trim();
      if (accSize.trim()) spec.size = accSize.trim();
      if (color.trim()) spec.color = color.trim();
      return spec;
    }
    if (category === 'konfeksiyon') {
      const spec: TenderGarmentSpec = { fabricSupplied };
      if (garmentType) spec.garmentType = garmentType;
      if (garmentFabric.trim()) spec.fabric = garmentFabric.trim();
      if (sizes.trim()) spec.sizes = sizes.trim().slice(0, 200);
      if (colors.trim()) spec.colors = colors.trim();
      if (delivery.length) spec.delivery = GARMENT_DELIVERY.map((d) => d.value).filter((v) => delivery.includes(v));
      return spec;
    }
    if (category === 'iplik') {
      const spec: TenderYarnSpec = {};
      if (family) spec.family = family;
      if (parseNumber(filaments) > 0) spec.filaments = Math.round(parseNumber(filaments));
      if (parseNumber(count) > 0) {
        spec.count = parseNumber(count);
        spec.countUnit = countUnit;
      }
      if (colorState) spec.colorState = colorState;
      if (color.trim()) spec.color = color.trim();
      return spec;
    }
    if (category === 'kumas') {
      const spec: TenderFabricSpec = {};
      if (fabricType) spec.type = fabricType;
      if (subtype) spec.subtype = subtype;
      if (parseNumber(weight) > 0) spec.weightGsm = parseNumber(weight);
      if (parseNumber(width) > 0) spec.widthCm = parseNumber(width);
      if (content.trim()) spec.content = content.trim();
      if (color.trim()) spec.color = color.trim();
      return spec;
    }
    return undefined;
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { tender, notified } = await createTender({
        category,
        title: effectiveTitle.trim(),
        spec: buildSpec(),
        quantity: quantityValue,
        unit,
        targetDate: dateInputToIso(targetDate),
        deadline: dateInputToIso(deadline, true),
        note: note.trim() || undefined,
        shareToFeed,
        media: attachments.length
          ? attachments.map<TenderMediaInput>((a) => ({ dataUrl: a.dataUrl, caption: a.caption.trim() || undefined }))
          : undefined,
        videoIds: uploadedVideoIds.length ? uploadedVideoIds : undefined,
      });
      videoSlots.forEach((v) => v.markAttached());
      haptics.success();
      navigation.replace('TenderDetail', { tenderId: tender.id, notified });
    } catch (err) {
      haptics.error();
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.code === 'daily_limit') {
        setError(tr('Bugün en fazla 10 açık talep yayınlanabilir. Yarın tekrar deneyin.'));
      } else if (apiError?.code === 'too_many_images') {
        setError(tr('En fazla {n} fotoğraf eklenebilir.', { n: TENDER_MAX_IMAGES }));
      } else if (apiError?.code === 'too_many_pdfs') {
        setError(tr('En fazla {n} PDF eklenebilir.', { n: TENDER_MAX_PDFS }));
      } else if (apiError?.code?.startsWith('video_')) {
        setError(tr('Videolardan biri eklenemedi. Videoyu kaldırıp yeniden deneyin.'));
      } else if (apiError?.code === 'invalid_spec' || apiError?.code === 'invalid_body') {
        setError(tr('Bazı bilgiler geçersiz. Sayıları ve tarihleri kontrol edin.'));
      } else {
        setError(friendlyMessage(err, tr('Talep yayınlanamadı')));
      }
      setSubmitting(false);
    }
  };

  const subtypes = fabricType ? SUBTYPES[fabricType] : [];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Açık talep yayınla')} leading="back" onBack={() => navigation.goBack()} />
      <Screen
        sticky={
          <Button
            size="lg"
            label={busyMedia ? tr('Ekler yükleniyor…') : tr('Talebi yayınla')}
            loading={submitting}
            disabled={!canSubmit}
            onPress={submit}
          />
        }
      >
        <Card>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            {tr('Ne aradığınızı yazın; bu işi yapan firmalara haber gider, teklifleri tek yerde karşılaştırırsınız.')}
          </Text>
        </Card>

        <View style={{ gap: t.space[4] }}>
          <SectionTitle title={tr('Ne arıyorsunuz?')} />
          {/* Dört seçenek 375 px'te segmente sığmıyor: çip satırı. */}
          <ChipRow>
            {TENDER_CATEGORIES.map((c) => (
              <Chip key={c.value} label={c.label} selected={category === c.value} onPress={() => changeCategory(c.value)} />
            ))}
          </ChipRow>

          {category === 'iplik' ? (
            <>
              <View style={{ gap: t.space[2] }}>
                <Label text={tr('Lif ailesi')} />
                <ChipRow>
                  {yarnOptions.families.map((f) => (
                    <Chip
                      key={f.key}
                      label={shortFamily(f.label)}
                      selected={family === f.key}
                      onPress={() => setFamily(family === f.key ? '' : f.key)}
                    />
                  ))}
                </ChipRow>
              </View>
              <Input
                label={tr('Filament sayısı (isteğe bağlı)')}
                value={filaments}
                onChangeText={setFilaments}
                inputMode="numeric"
                keyboardType="number-pad"
                placeholder={tr('Örn. 96')}
              />
              <Input
                label={tr('Numara (isteğe bağlı)')}
                value={count}
                onChangeText={setCount}
                inputMode="decimal"
                keyboardType="decimal-pad"
                placeholder={tr('Örn. 150')}
                unit={optionLabel(yarnOptions.countUnits, countUnit)}
              />
              <View style={{ gap: t.space[2] }}>
                <Label text={tr('Numara birimi')} />
                <ChipRow>
                  {yarnOptions.countUnits.map((u) => (
                    <Chip
                      key={u.key}
                      label={u.label}
                      selected={countUnit === u.key}
                      onPress={() => setCountUnit(u.key as CountUnit)}
                    />
                  ))}
                </ChipRow>
              </View>
              <View style={{ gap: t.space[2] }}>
                <Label text={tr('Renk durumu')} />
                <ChipRow>
                  {colorStates().map((c) => (
                    <Chip
                      key={c.key}
                      label={c.label}
                      selected={colorState === c.key}
                      onPress={() => setColorState(colorState === c.key ? '' : c.key)}
                    />
                  ))}
                </ChipRow>
              </View>
            </>
          ) : null}

          {category === 'kumas' ? (
            <>
              <View style={{ gap: t.space[2] }}>
                <Label text={tr('Kumaş çeşidi')} />
                <ChipRow>
                  {PRODUCT_TYPES.map((type) => (
                    <Chip
                      key={type}
                      label={TYPE_LABELS[type]}
                      selected={fabricType === type}
                      onPress={() => {
                        setFabricType(fabricType === type ? '' : type);
                        setSubtype('');
                      }}
                    />
                  ))}
                </ChipRow>
              </View>
              {subtypes.length ? (
                <View style={{ gap: t.space[2] }}>
                  <Label text={tr('Alt çeşit')} />
                  <ChipRow>
                    {subtypes.map((s) => (
                      <Chip
                        key={s.key}
                        label={s.label}
                        selected={subtype === s.key}
                        onPress={() => setSubtype(subtype === s.key ? '' : s.key)}
                      />
                    ))}
                  </ChipRow>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                <Input
                  containerStyle={{ flex: 1, minWidth: 0 }}
                  label={tr('Gramaj')}
                  value={weight}
                  onChangeText={setWeight}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  placeholder="165"
                  unit="gr/m²"
                />
                <Input
                  containerStyle={{ flex: 1, minWidth: 0 }}
                  label={tr('En')}
                  value={width}
                  onChangeText={setWidth}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  placeholder="180"
                  unit="cm"
                />
              </View>
              <Input
                label={tr('İçerik (isteğe bağlı)')}
                value={content}
                onChangeText={setContent}
                placeholder={tr('Örn. %95 pamuk %5 elastan')}
              />
            </>
          ) : null}

          {category === 'konfeksiyon' ? (
            <>
              <View style={{ gap: t.space[2] }}>
                <Label text={tr('Ürün')} />
                <ChipRow>
                  {GARMENT_TYPES.map((g) => (
                    <Chip
                      key={g.value}
                      label={g.label}
                      selected={garmentType === g.value}
                      onPress={() => setGarmentType(garmentType === g.value ? '' : g.value)}
                    />
                  ))}
                </ChipRow>
              </View>
              <Input
                label={tr('Kumaş (isteğe bağlı)')}
                value={garmentFabric}
                onChangeText={setGarmentFabric}
                placeholder={tr('Örn. 30/1 penye süprem, 160 gr')}
              />
              <View style={{ gap: t.space[2] }}>
                <Label text={tr('Kumaşı kim sağlar?')} />
                <SegmentControl<'alici' | 'uretici'>
                  stretch
                  accessibilityLabel={tr('Kumaşı kim sağlar')}
                  value={fabricSupplied}
                  onChange={setFabricSupplied}
                  options={FABRIC_SUPPLIERS}
                />
              </View>
              <Input
                label={tr('Beden dağılımı (isteğe bağlı)')}
                value={sizes}
                onChangeText={setSizes}
                placeholder="S:1000 M:2000 L:1500"
                helper={tr('Örn. S:1000 M:2000 L:1500')}
                autoCapitalize="characters"
              />
              <Input label={tr('Renkler (isteğe bağlı)')} value={colors} onChangeText={setColors} placeholder={tr('Örn. Siyah, beyaz, lacivert')} />
              <View style={{ gap: t.space[2] }}>
                <Label text={tr('Teslim kapsamı')} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                  {GARMENT_DELIVERY.map((d) => (
                    <Chip
                      key={d.value}
                      label={d.label}
                      selected={delivery.includes(d.value)}
                      onPress={() => toggleDelivery(d.value)}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {category === 'aksesuar' ? (
            <>
              <View style={{ gap: t.space[2] }}>
                <Label text={tr('Aksesuar türü')} />
                <ChipRow>
                  {ACCESSORY_TYPES.map((a) => (
                    <Chip
                      key={a.value}
                      label={a.label}
                      selected={accessoryType === a.value}
                      onPress={() => setAccessoryType(accessoryType === a.value ? '' : a.value)}
                    />
                  ))}
                </ChipRow>
              </View>
              <Input label={tr('Malzeme (isteğe bağlı)')} value={material} onChangeText={setMaterial} placeholder={tr('Örn. Polyester, metal, dokuma')} />
              <Input label={tr('Ölçü (isteğe bağlı)')} value={accSize} onChangeText={setAccSize} placeholder={tr('Örn. 18 mm, 20 cm')} />
            </>
          ) : null}

          {category === 'iplik' || category === 'kumas' || category === 'aksesuar' ? (
            <Input label={tr('Renk (isteğe bağlı)')} value={color} onChangeText={setColor} placeholder={tr('Örn. Siyah')} />
          ) : null}
        </View>

        <MediaSection
          category={category}
          attachments={attachments}
          videos={videoSlots.map((v) => v.video)}
          imageRoom={imageRoom}
          pdfRoom={TENDER_MAX_PDFS - pdfCount}
          videoRoom={TENDER_MAX_VIDEOS - videoSlots.filter((v) => v.video).length}
          busy={picking}
          error={mediaError}
          onCamera={() => pickPhotos(true)}
          onGallery={() => pickPhotos(false)}
          onVideo={addVideo}
          onPdf={pickPdf}
          onCaption={setCaption}
          onRemove={removeAttachment}
          onRemoveVideo={(i) => videoSlots[i].remove()}
        />

        <View style={{ gap: t.space[4] }}>
          <SectionTitle title={tr('Talep bilgileri')} />
          <Input
            label={tr('Başlık')}
            value={effectiveTitle}
            onChangeText={(v) => {
              setTitleEdited(true);
              setTitle(v);
            }}
            placeholder={
              category === 'diger'
                ? tr('Örn. Etiket baskısı')
                : category === 'konfeksiyon'
                  ? tr('Örn. Tişört fason üretim · 5000 adet')
                  : tr('Örn. Polyester iplik · 96 filament')
            }
            helper={titleEdited ? undefined : tr('Seçtiklerinize göre önerildi; değiştirebilirsiniz.')}
            error={titleEdited && titleInvalid ? tr('Başlık en az 3 harf olmalı.') : null}
          />
          <Input
            label={tr('Miktar')}
            value={quantity}
            onChangeText={setQuantity}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder={tr('Örn. 7')}
            unit={tenderUnitShort(unit)}
          />
          <View style={{ gap: t.space[2] }}>
            <Label text={tr('Birim')} />
            <SegmentControl<TenderUnit> stretch accessibilityLabel={tr('Birim')} value={unit} onChange={setUnit} options={TENDER_UNITS} />
          </View>
          <Input
            label={tr('İstenen termin (isteğe bağlı)')}
            value={targetDate}
            onChangeText={setTargetDate}
            placeholder="2026-11-15"
            autoCapitalize="none"
            helper={tr('YYYY-AA-GG biçiminde yazın.')}
            error={targetInvalid ? tr('Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).') : null}
          />
          <Input
            label={tr('Son teklif tarihi (isteğe bağlı)')}
            value={deadline}
            onChangeText={setDeadline}
            placeholder="2026-10-01"
            autoCapitalize="none"
            helper={tr('Boş bırakırsanız talebi siz kapatana kadar teklif gelir.')}
            error={deadlineInvalid ? tr('Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-10-01).') : null}
          />
          <Input
            label={tr('Not (isteğe bağlı)')}
            value={note}
            onChangeText={setNote}
            placeholder={tr('Örn. Teslim İstanbul, parçalı sevkiyat olabilir')}
            multiline
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[3],
              minHeight: t.size.touchMin,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{tr('Akışta da paylaş')}</Text>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Talep ana sayfa akışında görünür.')}</Text>
            </View>
            <Switch
              value={shareToFeed}
              onValueChange={(v) => {
                haptics.selection();
                setShareToFeed(v);
              }}
              trackColor={{ true: t.colors.brand, false: t.colors.lineStrong }}
              accessibilityLabel={tr('Akışta da paylaş')}
            />
          </View>
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
      </Screen>
    </View>
  );
}

// --- Fotoğraf, video ve PDF ekleri ------------------------------------------

function MediaSection(props: {
  category: TenderCategory;
  attachments: Attachment[];
  videos: (VideoUploadState | null)[];
  imageRoom: number;
  pdfRoom: number;
  videoRoom: number;
  busy: boolean;
  error: string | null;
  onCamera: () => void;
  onGallery: () => void;
  onVideo: () => void;
  onPdf: () => void;
  onCaption: (key: string, caption: string) => void;
  onRemove: (key: string) => void;
  onRemoveVideo: (index: number) => void;
}) {
  const t = useTheme();
  const { category, attachments, videos, imageRoom, pdfRoom, videoRoom, busy } = props;
  const images = attachments.filter((a) => a.kind === 'image');
  const pdfs = attachments.filter((a) => a.kind === 'pdf');
  const hint =
    category === 'kumas'
      ? tr('Kumaşın yakından (doku), 30 cm\'den ve uzaktan (genel görünüm) fotoğrafını çekin.')
      : category === 'konfeksiyon'
        ? tr('Ön, arka ve detay fotoğrafı; varsa teknik föy PDF\'i ekleyin.')
        : tr('Numune ya da ürün fotoğrafı teklif verenlerin işini kolaylaştırır.');
  const rowStyle = {
    flexDirection: 'row' as const,
    gap: t.space[3],
    paddingTop: t.space[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.line,
  };

  return (
    <View style={{ gap: t.space[4] }}>
      <SectionTitle title={tr('Fotoğraf ve video')} />
      <Card>
        <View style={{ gap: t.space[3] }}>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{hint}</Text>
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Button
              kind="secondary"
              icon="camera"
              label={tr('Fotoğraf çek')}
              disabled={imageRoom <= 0 || busy}
              onPress={props.onCamera}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button
              kind="secondary"
              icon="images-outline"
              label={tr('Galeriden')}
              accessibilityLabel={tr('Galeriden seç')}
              disabled={imageRoom <= 0 || busy}
              onPress={props.onGallery}
              style={{ flex: 1, minWidth: 0 }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Button
              kind="secondary"
              icon="videocam-outline"
              label={tr('Video ekle')}
              disabled={videoRoom <= 0 || busy}
              onPress={props.onVideo}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button
              kind="secondary"
              icon="document-attach-outline"
              label={tr('PDF ekle')}
              accessibilityLabel={tr('Dosya ekle (PDF): teknik föy, ölçü tablosu')}
              disabled={pdfRoom <= 0 || busy}
              onPress={props.onPdf}
              style={{ flex: 1, minWidth: 0 }}
            />
          </View>
          <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>
            {tr('En çok {images} fotoğraf, {videos} video ve {pdfs} PDF (teknik föy, ölçü tablosu).', { images: TENDER_MAX_IMAGES, videos: TENDER_MAX_VIDEOS, pdfs: TENDER_MAX_PDFS })}
          </Text>

          {images.map((a, i) => (
            <View key={a.key} style={rowStyle}>
              <Image
                source={{ uri: a.dataUrl }}
                accessibilityLabel={tr('Fotoğraf {n}', { n: i + 1 })}
                style={{ width: t.size.thumb, height: t.size.thumb, borderRadius: t.radius.md, backgroundColor: t.colors.surface2 }}
              />
              <View style={{ flex: 1, minWidth: 0, gap: t.space[2] }}>
                <ChipRow>
                  {MEDIA_CAPTIONS.map((c) => (
                    <Chip
                      key={c}
                      label={c}
                      selected={a.caption === c}
                      onPress={() => props.onCaption(a.key, a.caption === c ? '' : c)}
                    />
                  ))}
                </ChipRow>
                <Input
                  label={tr('Açıklama')}
                  value={a.caption}
                  onChangeText={(v) => props.onCaption(a.key, v)}
                  placeholder={tr('Örn. Yakın çekim, doku')}
                  maxLength={TENDER_CAPTION_MAX}
                />
              </View>
              <RemoveButton label={tr('Fotoğraf {n} kaldır', { n: i + 1 })} onPress={() => props.onRemove(a.key)} />
            </View>
          ))}

          {pdfs.map((a, i) => (
            <View key={a.key} style={[rowStyle, { alignItems: 'center' }]}>
              <Icon name="document-text-outline" size={t.size.icon} color="ink2" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Input
                  label={tr('PDF açıklaması')}
                  value={a.caption}
                  onChangeText={(v) => props.onCaption(a.key, v)}
                  placeholder={tr('Örn. Teknik föy, ölçü tablosu')}
                  maxLength={TENDER_CAPTION_MAX}
                />
              </View>
              <RemoveButton label={tr('PDF {n} kaldır', { n: i + 1 })} onPress={() => props.onRemove(a.key)} />
            </View>
          ))}

          {videos.map((v, i) =>
            v ? (
              <View key={`video-${i}`} style={[rowStyle, { alignItems: 'center' }]}>
                <Icon name="videocam-outline" size={t.size.icon} color="ink2" />
                <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
                  <Text style={[t.type.body14, { color: t.colors.ink }]}>
                    {v.phase === 'uploading'
                      ? tr('Video yükleniyor · %{n}', { n: Math.round(v.progress * 100) })
                      : `${tr('Video eklendi')}${v.durationSeconds != null ? ` · ${formatVideoDuration(v.durationSeconds)}` : ''}`}
                  </Text>
                  {v.phase === 'uploading' ? (
                    <View style={{ height: t.space[1], borderRadius: t.radius.full, backgroundColor: t.colors.surface2, overflow: 'hidden' }}>
                      <View
                        style={{
                          height: '100%',
                          width: `${Math.max(2, Math.round(v.progress * 100))}%`,
                          backgroundColor: t.colors.brand,
                        }}
                      />
                    </View>
                  ) : null}
                </View>
                <RemoveButton label={tr('Video {n} kaldır', { n: i + 1 })} onPress={() => props.onRemoveVideo(i)} />
              </View>
            ) : null
          )}

          {props.error ? (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
              <Icon name="warning" size={t.size.iconSm} color="danger" />
              <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{props.error}</Text>
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: t.size.touchMin,
        height: t.size.touchMin,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radius.full,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name="x" size={t.size.iconSm} color="ink2" />
    </Pressable>
  );
}
