// Üretim bilgilerini düzenleme (docs/konfeksiyon-plani.md Bölüm A): konfeksiyon ve fason
// atölye firmaları ürün grupları, ana uzmanlık, kapasite, MOQ, termin, hizmet/işlem,
// sertifika (Belgeler'e bağlanabilir), ihracat pazarı, çalışan sayısı ve referans işleri girer.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  addProductionReference,
  deleteProductionReference,
  fetchCompany,
  fetchProduction,
  saveProduction,
  type CompanyProduction,
  type ProductionOption,
  type ProductionView,
} from '../../api/client';
import { ReferenceGrid } from '../../components/ProductionView';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { fitDataUrl, pickCompressedImage } from '../../features/imagePicker';
import { dropCachedReferenceImage, setCachedReferenceImage, EMPTY_PRODUCTION } from '../../features/companies/production';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import {
  AppBar,
  Button,
  Card,
  Chip,
  ChipRow,
  Icon,
  Input,
  Screen,
  SearchBox,
  SectionTitle,
  Skeleton,
  SkeletonText,
} from '../../ui';

type Props = RootStackScreenProps<'ProductionEdit'>;

// Sunucudaki sınırla aynı (backend/src/production.ts MAX_REFERENCE_IMAGE_CHARS).
const MAX_REFERENCE_IMAGE_CHARS = 700_000;
const MAX_QUANTITY = 100_000_000;
const MAX_DAYS = 365;

const toText = (n: number | null) => (n == null ? '' : String(n));
const digits = (s: string) => s.replace(/[^0-9]/g, '');

type NumberField = 'monthlyCapacity' | 'moqPerModel' | 'moqPerColor' | 'sampleLeadDays' | 'productionLeadDays';

export function ProductionEditScreen({ route, navigation }: Props) {
  const t = useTheme();
  const { companyId } = route.params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ProductionView | null>(null);
  const [companyType, setCompanyType] = useState('');
  const [docCount, setDocCount] = useState(0);
  const [form, setForm] = useState<CompanyProduction>(EMPTY_PRODUCTION);
  const [numbers, setNumbers] = useState<Record<NumberField, string>>({
    monthlyCapacity: '',
    moqPerModel: '',
    moqPerColor: '',
    sampleLeadDays: '',
    productionLeadDays: '',
  });
  const [byGroup, setByGroup] = useState<Record<string, string>>({});
  const [showByGroup, setShowByGroup] = useState(false);
  const [mainError, setMainError] = useState<string | null>(null);
  const [countryQuery, setCountryQuery] = useState('');

  // Yeni referans
  const [refImage, setRefImage] = useState<string | null>(null);
  const [refCaption, setRefCaption] = useState('');
  const [refClient, setRefClient] = useState('');
  const [refShowClient, setRefShowClient] = useState(false);
  const [refPermission, setRefPermission] = useState(false);
  const [refBusy, setRefBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProduction(companyId), fetchCompany(companyId)])
      .then(([prod, { company }]) => {
        if (cancelled) return;
        setView(prod);
        setCompanyType(company.companyType ?? '');
        setDocCount(company.certificatePhotoCount ?? 0);
        const p = prod.production;
        setForm(p);
        setNumbers({
          monthlyCapacity: toText(p.monthlyCapacity),
          moqPerModel: toText(p.moqPerModel),
          moqPerColor: toText(p.moqPerColor),
          sampleLeadDays: toText(p.sampleLeadDays),
          productionLeadDays: toText(p.productionLeadDays),
        });
        const groups = Object.fromEntries(Object.entries(p.capacityByGroup).map(([k, v]) => [k, String(v)]));
        setByGroup(groups);
        setShowByGroup(Object.keys(groups).length > 0);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : tr('Üretim bilgileri yüklenemedi.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const options = view?.options;
  const atolye = companyType === 'fason_atolye';
  const maxMain = options?.maxMainGroups ?? 3;

  const toggleIn = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const toggleGroup = (key: string) => {
    haptics.selection();
    setForm((f) => {
      const productGroups = toggleIn(f.productGroups, key);
      // Seçimden çıkan grup ana uzmanlıktan da çıkar.
      return { ...f, productGroups, mainGroups: f.mainGroups.filter((k) => productGroups.includes(k)) };
    });
    setMainError(null);
  };

  const toggleMain = (key: string) => {
    haptics.selection();
    if (!form.mainGroups.includes(key) && form.mainGroups.length >= maxMain) {
      setMainError(tr('En çok {n} ana uzmanlık seçebilirsiniz.', { n: maxMain }));
      return;
    }
    setMainError(null);
    setForm((f) => ({ ...f, mainGroups: toggleIn(f.mainGroups, key) }));
  };

  const numberError = (field: NumberField) => {
    const v = numbers[field];
    if (!v) return null;
    const n = Number(v);
    const max = field === 'sampleLeadDays' || field === 'productionLeadDays' ? MAX_DAYS : MAX_QUANTITY;
    return n > max ? tr('En çok {n} olabilir.', { n: max.toLocaleString() }) : null;
  };
  const hasNumberError = (Object.keys(numbers) as NumberField[]).some((f) => numberError(f));

  const toggleCertificate = (key: string) => {
    haptics.selection();
    setForm((f) =>
      f.certificates.some((c) => c.key === key)
        ? { ...f, certificates: f.certificates.filter((c) => c.key !== key) }
        : { ...f, certificates: [...f.certificates, { key, docPosition: null }] }
    );
  };

  const linkDoc = (key: string, docPosition: number | null) => {
    haptics.selection();
    setForm((f) => ({ ...f, certificates: f.certificates.map((c) => (c.key === key ? { ...c, docPosition } : c)) }));
  };

  const countries = useMemo(() => {
    const q = countryQuery.trim().toLocaleLowerCase();
    const all = options?.countries ?? [];
    return q ? all.filter((c) => c.name.toLocaleLowerCase().includes(q) || c.key.toLowerCase() === q) : all;
  }, [options, countryQuery]);

  const handleSave = async () => {
    setError(null);
    const num = (field: NumberField) => (numbers[field] ? Number(numbers[field]) : null);
    const capacityByGroup = showByGroup
      ? Object.fromEntries(
          Object.entries(byGroup)
            .filter(([k, v]) => v && form.productGroups.includes(k))
            .map(([k, v]) => [k, Math.min(Number(v), MAX_QUANTITY)])
        )
      : {};
    const payload: CompanyProduction = {
      ...form,
      groupsOther: form.groupsOther.trim(),
      monthlyCapacity: num('monthlyCapacity'),
      moqPerModel: num('moqPerModel'),
      moqPerColor: num('moqPerColor'),
      sampleLeadDays: num('sampleLeadDays'),
      productionLeadDays: num('productionLeadDays'),
      capacityByGroup,
      // Atölyeye özel alanlar konfeksiyonda saklanmaz.
      operations: atolye ? form.operations : [],
      fabricMode: atolye ? form.fabricMode : '',
    };
    setSaving(true);
    try {
      await saveProduction(companyId, payload);
      haptics.success();
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr('Kaydedilemedi, lütfen tekrar deneyin.'));
    } finally {
      setSaving(false);
    }
  };

  const pickReference = async () => {
    setError(null);
    try {
      const picked = await pickCompressedImage();
      if (!picked) return;
      const fitted = await fitDataUrl(picked.dataUrl, MAX_REFERENCE_IMAGE_CHARS);
      if (!fitted) {
        setError(tr('Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.'));
        return;
      }
      setRefImage(fitted.dataUrl);
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'permission_denied'
          ? tr('Galeriye erişim izni verilmedi.')
          : tr('Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.')
      );
    }
  };

  const submitReference = async () => {
    if (!refImage || !refPermission) return;
    setRefBusy(true);
    setError(null);
    try {
      const result = await addProductionReference(companyId, {
        imageUrl: refImage,
        caption: refCaption.trim(),
        clientName: refClient.trim(),
        showClient: refShowClient && !!refClient.trim(),
        permissionConfirmed: true,
      });
      setCachedReferenceImage(companyId, result.position, refImage);
      setView((v) => (v ? { ...v, references: result.references } : v));
      setRefImage(null);
      setRefCaption('');
      setRefClient('');
      setRefShowClient(false);
      setRefPermission(false);
      haptics.success();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'too_many_references'
          ? tr('En çok {n} referans görseli ekleyebilirsiniz.', { n: options?.maxReferences ?? 12 })
          : err instanceof ApiError
            ? err.message
            : tr('Referans eklenemedi, lütfen tekrar deneyin.')
      );
    } finally {
      setRefBusy(false);
    }
  };

  const removeReference = async (position: number) => {
    const ok = await confirmAction({
      title: tr('Referansı sil'),
      message: tr('Bu referans görseli firma sayfanızdan kaldırılacak.'),
      confirmLabel: tr('Sil'),
      destructive: true,
    });
    if (!ok) return;
    try {
      const result = await deleteProductionReference(companyId, position);
      dropCachedReferenceImage(companyId, position);
      setView((v) => (v ? { ...v, references: result.references } : v));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr('Silinemedi, lütfen tekrar deneyin.'));
    }
  };

  const fieldLabel = (text: string) => <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{text}</Text>;
  const helper = (text: string) => <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{text}</Text>;

  const multiChips = (list: ProductionOption[], selected: string[], onToggle: (key: string) => void) => (
    <ChipRow wrap>
      {list.map((o) => (
        <Chip key={o.key} label={o.label} selected={selected.includes(o.key)} onPress={() => onToggle(o.key)} />
      ))}
    </ChipRow>
  );

  // Tek seçim: dar ekranda (320 px) taşmasın diye segment yerine alt satıra geçen çipler.
  const segment = <T extends string>(list: ProductionOption[], value: T, onChange: (v: T) => void, label: string) => (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      <ChipRow wrap>
        {list.map((o) => (
          <Chip
            key={o.key}
            label={o.label}
            selected={value === o.key}
            onPress={() => {
              haptics.selection();
              // Seçili olana yeniden dokunmak seçimi kaldırır.
              onChange((o.key === value ? '' : o.key) as T);
            }}
          />
        ))}
      </ChipRow>
    </View>
  );

  const numberInput = (field: NumberField, label: string, unit: string) => (
    <Input
      containerStyle={{ flex: 1 }}
      label={label}
      value={numbers[field]}
      onChangeText={(v) => setNumbers((n) => ({ ...n, [field]: digits(v) }))}
      keyboardType="number-pad"
      inputMode="numeric"
      unit={unit}
      error={numberError(field) ?? undefined}
    />
  );

  const checkbox = (checked: boolean, onToggle: () => void, label: string) => (
    <Pressable
      onPress={() => {
        haptics.selection();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        minHeight: t.size.touchMin,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={checked ? 'checkbox-outline' : 'square-outline'} size={t.size.iconSm} color={checked ? 'brand' : 'lineStrong'} />
      <Text style={[t.type.body16, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>{label}</Text>
    </Pressable>
  );

  const toggleRow = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: t.size.touchMin }}>
      <Text style={[t.type.body16, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptics.selection();
          onChange(v);
        }}
        trackColor={{ true: t.colors.brand, false: t.colors.lineStrong }}
        accessibilityLabel={label}
      />
    </View>
  );

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

  const references = view?.references ?? [];
  const maxRefs = options?.maxReferences ?? 12;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Üretimi düzenle')} leading="back" onBack={() => navigation.goBack()} />
      {loading ? (
        <Screen>
          <SkeletonText lines={4} />
          <Skeleton height={t.size.thumb} />
          <SkeletonText lines={3} />
        </Screen>
      ) : !options ? (
        <Screen>{banner}</Screen>
      ) : (
        <Screen
          sticky={<Button size="lg" label={tr('Kaydet')} loading={saving} disabled={hasNumberError} onPress={handleSave} />}
        >
          {banner}

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('Ürün grupları')} />
            {multiChips(options.productGroups, form.productGroups, toggleGroup)}
            <Input
              label={tr('Diğer ürün grupları')}
              value={form.groupsOther}
              onChangeText={(v) => setForm((f) => ({ ...f, groupsOther: v }))}
              placeholder={tr('Listede olmayanlar, ör. iş elbisesi')}
              maxLength={200}
            />
          </View>

          {form.productGroups.length ? (
            <View style={{ gap: t.space[2] }}>
              <SectionTitle title={tr('Ana uzmanlık')} />
              {helper(tr('En çok {n} grup seçin; aramada ve firma kartında öne çıkar.', { n: maxMain }))}
              <ChipRow wrap>
                {form.productGroups.map((key) => (
                  <Chip
                    key={key}
                    icon={form.mainGroups.includes(key) ? 'star' : 'star-outline'}
                    label={options.productGroups.find((o) => o.key === key)?.label ?? key}
                    selected={form.mainGroups.includes(key)}
                    onPress={() => toggleMain(key)}
                  />
                ))}
              </ChipRow>
              {mainError ? (
                <Text accessibilityRole="alert" style={[t.type.body14, { color: t.colors.danger }]}>
                  {mainError}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Çalışma şekli')} />
            {segment(options.workModes, form.workMode, (v) => setForm((f) => ({ ...f, workMode: v })), tr('Çalışma şekli'))}
          </View>

          {atolye ? (
            <>
              <View style={{ gap: t.space[2] }}>
                <SectionTitle title={tr('Yapılan işlemler')} />
                {multiChips(options.operations, form.operations, (k) => {
                  haptics.selection();
                  setForm((f) => ({ ...f, operations: toggleIn(f.operations, k) }));
                })}
              </View>
              <View style={{ gap: t.space[2] }}>
                <SectionTitle title={tr('İş şekli')} />
                {segment(options.fabricModes, form.fabricMode, (v) => setForm((f) => ({ ...f, fabricMode: v })), tr('İş şekli'))}
              </View>
            </>
          ) : null}

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('Kapasite, minimum sipariş ve termin')} />
            {numberInput('monthlyCapacity', tr('Aylık kapasite'), tr('adet/ay'))}
            {form.productGroups.length
              ? toggleRow(showByGroup, setShowByGroup, tr('Ürün grubu bazında kapasite gir'))
              : null}
            {showByGroup
              ? form.productGroups.map((key) => (
                  <Input
                    key={key}
                    label={options.productGroups.find((o) => o.key === key)?.label ?? key}
                    value={byGroup[key] ?? ''}
                    onChangeText={(v) => setByGroup((b) => ({ ...b, [key]: digits(v) }))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    unit={tr('adet/ay')}
                  />
                ))
              : null}
            <View style={{ flexDirection: 'row', gap: t.space[3] }}>
              {numberInput('moqPerModel', tr('Model başı MOQ'), tr('adet'))}
              {numberInput('moqPerColor', tr('Renk başı MOQ'), tr('adet'))}
            </View>
            <View style={{ flexDirection: 'row', gap: t.space[3] }}>
              {numberInput('sampleLeadDays', tr('Numune termini'), tr('gün'))}
              {numberInput('productionLeadDays', tr('Üretim termini'), tr('gün'))}
            </View>
          </View>

          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Hizmetler')} />
            {multiChips(options.services, form.services, (k) => {
              haptics.selection();
              setForm((f) => ({ ...f, services: toggleIn(f.services, k) }));
            })}
          </View>

          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Sertifikalar')} />
            {multiChips(
              options.certificates,
              form.certificates.map((c) => c.key),
              toggleCertificate
            )}
            {form.certificates.length ? (
              <Card>
                <View style={{ gap: t.space[4] }}>
                  {form.certificates.map((c) => (
                    <View key={c.key} style={{ gap: t.space[2] }}>
                      <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>
                        {options.certificates.find((o) => o.key === c.key)?.label ?? c.key}
                      </Text>
                      {docCount ? (
                        <>
                          {fieldLabel(tr('Belge bağla'))}
                          <ChipRow wrap>
                            <Chip label={tr('Belge yok')} selected={c.docPosition == null} onPress={() => linkDoc(c.key, null)} />
                            {Array.from({ length: docCount }, (_, i) => (
                              <Chip
                                key={i}
                                icon="document-text-outline"
                                label={tr('Belge {n}', { n: i + 1 })}
                                selected={c.docPosition === i}
                                onPress={() => linkDoc(c.key, i)}
                              />
                            ))}
                          </ChipRow>
                        </>
                      ) : (
                        helper(tr('Belge bağlamak için önce Firmayı düzenle › Sertifikalar bölümüne belge fotoğrafı ekleyin.'))
                      )}
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}
          </View>

          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('İhracat pazarları')} />
            {form.exportCountries.length ? (
              <ChipRow wrap>
                {form.exportCountries.map((k) => (
                  <Chip
                    key={k}
                    icon="close"
                    selected
                    label={options.countries.find((c) => c.key === k)?.name ?? k}
                    onPress={() => setForm((f) => ({ ...f, exportCountries: f.exportCountries.filter((x) => x !== k) }))}
                  />
                ))}
              </ChipRow>
            ) : null}
            <SearchBox placeholder={tr('Ülke ara')} value={countryQuery} onChangeText={setCountryQuery} accessibilityLabel={tr('Ülke ara')} />
            <ChipRow wrap>
              {countries
                .filter((c) => !form.exportCountries.includes(c.key))
                .map((c) => (
                  <Chip
                    key={c.key}
                    label={c.name}
                    onPress={() => {
                      haptics.selection();
                      setForm((f) => ({ ...f, exportCountries: [...f.exportCountries, c.key] }));
                    }}
                  />
                ))}
            </ChipRow>
          </View>

          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Çalışan sayısı')} />
            <ChipRow wrap>
              {options.employeeRanges.map((o) => (
                <Chip
                  key={o.key}
                  label={o.label}
                  selected={form.employeeRange === o.key}
                  onPress={() => {
                    haptics.selection();
                    setForm((f) => ({ ...f, employeeRange: f.employeeRange === o.key ? '' : o.key }));
                  }}
                />
              ))}
            </ChipRow>
          </View>

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={tr('Referans işler ({n}/{max})', { n: references.length, max: maxRefs })} />
            {helper(tr('Ürettiğiniz işlerin fotoğrafları. Referanslar hemen kaydedilir.'))}
            {references.length ? <ReferenceGrid companyId={companyId} references={references} onRemove={removeReference} /> : null}
            {references.length < maxRefs ? (
              <Card>
                <View style={{ gap: t.space[3] }}>
                  {refImage ? (
                    <View style={{ gap: t.space[2] }}>
                      {helper(tr('Fotoğraf seçildi.'))}
                      <Button kind="quiet" icon="image-outline" label={tr('Başka fotoğraf seç')} onPress={pickReference} />
                    </View>
                  ) : (
                    <Button kind="secondary" icon="image-outline" label={tr('Referans fotoğrafı seç')} onPress={pickReference} />
                  )}
                  <Input label={tr('Açıklama')} value={refCaption} onChangeText={setRefCaption} maxLength={200} placeholder={tr('ör. Dantelli sütyen takımı')} />
                  <Input
                    label={tr('Müşteri adı (isteğe bağlı)')}
                    value={refClient}
                    onChangeText={setRefClient}
                    maxLength={120}
                    helper={tr('Varsayılan olarak gizli kalır.')}
                  />
                  {refClient.trim() ? toggleRow(refShowClient, setRefShowClient, tr('Müşteri adını göster')) : null}
                  {checkbox(refPermission, () => setRefPermission((v) => !v), tr('Bu görseli paylaşma iznim var'))}
                  <Button
                    label={tr('Referansı ekle')}
                    loading={refBusy}
                    disabled={!refImage || !refPermission}
                    onPress={submitReference}
                  />
                </View>
              </Card>
            ) : (
              helper(tr('En çok {n} referans görseli ekleyebilirsiniz.', { n: maxRefs }))
            )}
          </View>
        </Screen>
      )}
    </View>
  );
}
