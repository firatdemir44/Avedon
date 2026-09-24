// Makine parkı tablosunun fotoğrafından/PDF'inden toplu aktarım.
// 1) Sahibi tablosunun fotoğrafını seçer/çeker ya da PDF seçer.
// 2) "Okunuyor…": sunucu modeli satırları çıkarır (kayıt yok).
// 3) Önizleme tablosu: satıra dokunup düzeltir ya da siler; parkurda aynı
//    Mak No varsa uyarı + "Aynı numaralıları atla". 4) "N makineyi ekle".
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  commitMachineImport,
  extractMachineSheet,
  type MachineImportRow,
  type MachineKindGuess,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { MachineTable, type MachineTableRow } from '../../components/MachineTable';
import { useSession } from '../../context/SessionContext';
import { haptics } from '../../features/haptics';
import { captureCompressedImage, pickCompressedImage } from '../../features/imagePicker';
import { DocumentPickError, pickPdf } from '../../features/documentPicker';
import { parseRange, rangeDisplay } from '../../features/machines/range';
import { toInputNumber } from '../../features/calculators/parse';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { AppBar, BottomSheet, Button, ButtonRow, Card, Chip, ChipRow, EmptyState, Icon, Input, Screen, SkeletonText } from '../../ui';

type Props = RootStackScreenProps<'MachineImport'>;

interface ReviewRow {
  id: string;
  machineNo: string;
  diameterInch: string;
  gaugeText: string;
  brand: string;
  needlesText: string;
  feeders: string;
  fabricType: string;
  kindGuess: MachineKindGuess;
}

// Etiketler çizim anında çevrilir (modül düzeyinde tr() çağrılmaz).
const kindOptions = (): { value: MachineKindGuess; label: string }[] => [
  { value: 'yuvarlak', label: tr('Yuvarlak örme') },
  { value: 'raschel', label: 'Raschel' },
  { value: 'duz_orme', label: tr('Düz örme') },
  { value: 'dokuma', label: tr('Dokuma') },
  { value: 'diger', label: tr('Diğer') },
];

const INT = /^\d+$/;
const DEC = /^\d+([.,]\d+)?$/;

let seq = 0;
function toReview(row: MachineImportRow): ReviewRow {
  seq += 1;
  return {
    id: `r${seq}`,
    machineNo: row.machineNo != null ? String(row.machineNo) : '',
    diameterInch: row.diameterInch != null ? toInputNumber(row.diameterInch) : '',
    gaugeText: row.gaugeText,
    brand: row.brand,
    needlesText: row.needlesText,
    feeders: row.feeders != null ? String(row.feeders) : '',
    fabricType: row.fabricType,
    kindGuess: row.kindGuess,
  };
}

// Satırdaki hatalı alanlar (alan adı → mesaj). Boş alan serbest.
function rowErrors(r: ReviewRow): Partial<Record<keyof ReviewRow, string>> {
  const e: Partial<Record<keyof ReviewRow, string>> = {};
  if (r.machineNo.trim() && !INT.test(r.machineNo.trim())) e.machineNo = tr('Tam sayı');
  if (r.diameterInch.trim() && !DEC.test(r.diameterInch.trim())) e.diameterInch = tr('Sayı');
  if (!parseRange(r.gaugeText)) e.gaugeText = tr('Örn. 28 ya da 28-22');
  if (!parseRange(r.needlesText)) e.needlesText = tr('Örn. 2760 ya da 2808-2210');
  if (r.feeders.trim() && !INT.test(r.feeders.trim())) e.feeders = tr('Tam sayı');
  return e;
}

function toImportRow(r: ReviewRow): MachineImportRow {
  const num = (s: string) => (s.trim() ? Number(s.trim().replace(',', '.')) : null);
  return {
    machineNo: num(r.machineNo),
    diameterInch: num(r.diameterInch),
    gaugeText: parseRange(r.gaugeText)?.text ?? '',
    brand: r.brand.trim(),
    needlesText: parseRange(r.needlesText)?.text ?? '',
    feeders: num(r.feeders),
    fabricType: r.fabricType.trim(),
    kindGuess: r.kindGuess,
  };
}

type Phase = 'pick' | 'reading' | 'review';

export function MachineImportScreen({ navigation }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [existingNos, setExistingNos] = useState<number[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const read = async (getFile: () => Promise<string | null>) => {
    setError(null);
    let file: string | null;
    try {
      file = await getFile();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (err instanceof DocumentPickError) setError(err.code === 'too_large' ? tr('PDF en fazla 10 MB olabilir.') : tr('Dosya okunamadı.'));
      else if (code === 'permission_denied' || code === 'camera_permission_denied') setError(tr('Fotoğraflara erişim izni verilmedi.'));
      else setError(tr('Dosya açılamadı, tekrar deneyin.'));
      return;
    }
    if (!file) return;
    setPhase('reading');
    try {
      const res = await extractMachineSheet(file);
      if (!res.recognized || !res.rows.length) {
        setPhase('pick');
        setError(tr('Görselde makine tablosu bulunamadı. Tablonun tamamı görünecek, düz ve net bir fotoğraf deneyin.'));
        haptics.error();
        return;
      }
      setRows(res.rows.map(toReview));
      setExistingNos(res.existingMachineNos);
      setPhase('review');
      haptics.success();
    } catch (err) {
      setPhase('pick');
      haptics.error();
      if (err instanceof ApiError && err.code === 'daily_limit') setError(tr('Bugünkü okuma hakkınız doldu, yarın tekrar deneyin.'));
      else if (err instanceof ApiError && err.code === 'llm_not_configured') setError(tr('Okuma hizmeti şu an kapalı.'));
      else if (err instanceof ApiError && err.code === 'unsupported_file') setError(tr('Bu dosya türü desteklenmiyor. JPEG, PNG ya da PDF seçin.'));
      else setError(friendlyMessage(err, tr('Tablo okunamadı, tekrar deneyin.')));
    }
  };

  const fromGallery = () => read(async () => (await pickCompressedImage(2200, 0.8))?.dataUrl ?? null);
  const fromCamera = () => read(async () => (await captureCompressedImage(2200, 0.8))?.dataUrl ?? null);
  const fromPdf = () =>
    read(async () => {
      const doc = await pickPdf();
      if (!doc) return null;
      return doc.dataBase64.startsWith('data:') ? doc.dataBase64 : `data:application/pdf;base64,${doc.dataBase64}`;
    });

  const existing = useMemo(() => new Set(existingNos), [existingNos]);
  const isDuplicate = (r: ReviewRow) => INT.test(r.machineNo.trim()) && existing.has(Number(r.machineNo.trim()));
  const duplicates = rows.filter(isDuplicate);
  const invalid = rows.filter((r) => Object.keys(rowErrors(r)).length > 0);
  const toAdd = rows.filter((r) => !(skipDuplicates && isDuplicate(r)));

  const tableRows: MachineTableRow[] = rows.map((r) => {
    const bad = Object.keys(rowErrors(r)).length > 0;
    const dup = isDuplicate(r);
    const status = bad
      ? { tone: 'danger' as const, label: tr('Düzelt') }
      : dup
        ? { tone: 'warning' as const, label: skipDuplicates ? tr('Var, atla') : tr('Var') }
        : { tone: null, label: tr('Yeni') };
    return {
      key: r.id,
      no: r.machineNo,
      pus: r.diameterInch,
      fine: rangeDisplay(parseRange(r.gaugeText)?.text ?? r.gaugeText, null),
      brand: r.brand,
      needles: rangeDisplay(parseRange(r.needlesText)?.text ?? r.needlesText, null),
      feeders: r.feeders,
      fabric: r.fabricType,
      status,
      a11y: [r.machineNo && tr('{no} numara', { no: r.machineNo }), r.brand, r.fabricType, status.label].filter(Boolean).join(', '),
    };
  });

  const commit = async () => {
    if (invalid.length) {
      setError(tr('{n} satırda düzeltilmesi gereken alan var ("Düzelt" yazan satırlar).', { n: invalid.length }));
      haptics.error();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await commitMachineImport(rows.map(toImportRow), skipDuplicates);
      haptics.success();
      if (res.created === 0) {
        setError(tr('Eklenecek yeni makine kalmadı.'));
        return;
      }
      navigation.goBack();
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.code === 'too_many_machines') setError(tr('Makine sınırı (200) aşılıyor. Bazı satırları silin.'));
      else if (err instanceof ApiError && err.code === 'invalid_range') setError(tr('Fine ya da iğne alanlarından biri okunamadı; satırları kontrol edin.'));
      else setError(friendlyMessage(err, tr('Makineler eklenemedi, tekrar deneyin.')));
    } finally {
      setSaving(false);
    }
  };

  const bar = <AppBar title={tr('Fotoğraftan aktar')} leading="back" onBack={() => navigation.goBack()} />;

  const banner = (message: string, tone: 'danger' | 'warning') => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: tone === 'danger' ? t.colors.dangerSoft : t.colors.warningSoft,
      }}
    >
      <Icon name="warning" size={t.size.iconSm} color={tone} />
      <Text style={[t.type.body14, { color: tone === 'danger' ? t.colors.danger : t.colors.warning, flex: 1, minWidth: 0 }]}>{message}</Text>
    </View>
  );

  if (!user?.companyId) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState icon="machine" title={tr('Makine parkı firmaya bağlı')} description={tr('Bir firmaya bağlandığında makine parkını girebilirsin.')} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <Screen
        sticky={
          phase === 'review' ? (
            <Button
              size="lg"
              label={toAdd.length ? tr('{n} makineyi ekle', { n: toAdd.length }) : tr('Eklenecek makine yok')}
              loading={saving}
              disabled={saving || !toAdd.length}
              onPress={() => void commit()}
            />
          ) : undefined
        }
      >
        {phase === 'pick' ? (
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Text style={[t.type.title18, { color: t.colors.ink }]}>{tr('Makine listenizi tek seferde ekleyin')}</Text>
              <Text style={[t.type.body16, { color: t.colors.ink2 }]}>
                {tr("Mak No, Pus, Fein, Marka, İğne, Sistem ve Örgü cinsi sütunlu tablonuzun fotoğrafını ya da PDF'ini seçin. Okunan satırları eklemeden önce kontrol edip düzeltebilirsiniz.")}
              </Text>
              <ButtonRow>
                <Button kind="secondary" label={tr('Fotoğraf seç')} icon="image-outline" onPress={() => void fromGallery()} />
                {Platform.OS !== 'web' ? (
                  <Button kind="secondary" label={tr('Fotoğraf çek')} icon="camera" onPress={() => void fromCamera()} />
                ) : null}
                <Button kind="secondary" label={tr('PDF seç')} icon="document-outline" onPress={() => void fromPdf()} />
              </ButtonRow>
            </View>
          </Card>
        ) : null}

        {phase === 'reading' ? (
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Text style={[t.type.body16Strong, { color: t.colors.ink }]} accessibilityLiveRegion="polite">
                {tr('Okunuyor…')}
              </Text>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Uzun tablolarda bir dakika kadar sürebilir.')}</Text>
              <SkeletonText lines={4} />
            </View>
          </Card>
        ) : null}

        {phase === 'review' ? (
          <View style={{ gap: t.space[3] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              <Text style={[t.type.mono14, { color: t.colors.ink }]}>{rows.length}</Text>
              {tr(' satır okundu. Düzeltmek ya da silmek için satıra dokunun.')}
            </Text>
            {duplicates.length ? (
              <View style={{ gap: t.space[2] }}>
                {banner(
                  tr('{n} satırın numarası parkurunuzda zaten var (No {list}).', {
                    n: duplicates.length,
                    list: duplicates
                      .map((r) => r.machineNo)
                      .slice(0, 8)
                      .join(', ') + (duplicates.length > 8 ? '…' : ''),
                  }),
                  'warning'
                )}
                <ChipRow>
                  <Chip
                    label={tr('Aynı numaralıları atla')}
                    icon={skipDuplicates ? 'checkmark' : undefined}
                    selected={skipDuplicates}
                    onPress={() => {
                      haptics.selection();
                      setSkipDuplicates((v) => !v);
                    }}
                  />
                </ChipRow>
              </View>
            ) : null}
            {rows.length ? (
              <MachineTable
                rows={tableRows}
                statusHeader={tr('Kayıt')}
                rowActionLabel={tr('Düzenle')}
                onRowPress={(id) => setEditing(rows.find((r) => r.id === id) ?? null)}
              />
            ) : (
              <Text style={[t.type.body16, { color: t.colors.ink2 }]}>{tr('Tüm satırları sildiniz.')}</Text>
            )}
            <Button
              kind="quiet"
              label={tr('Başka fotoğraf seç')}
              icon="refresh"
              onPress={() => {
                setRows([]);
                setPhase('pick');
                setError(null);
              }}
            />
          </View>
        ) : null}

        {error ? banner(error, 'danger') : null}
      </Screen>

      <RowEditor
        row={editing}
        onClose={() => setEditing(null)}
        onSave={(row) => {
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          setEditing(null);
        }}
        onDelete={(id) => {
          haptics.selection();
          setRows((prev) => prev.filter((r) => r.id !== id));
          setEditing(null);
        }}
      />
    </View>
  );
}

function RowEditor({
  row,
  onClose,
  onSave,
  onDelete,
}: {
  row: ReviewRow | null;
  onClose: () => void;
  onSave: (row: ReviewRow) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState<ReviewRow | null>(row);
  useEffect(() => setDraft(row), [row]);
  if (!draft) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const errors = rowErrors(draft);
  const set = (key: keyof ReviewRow) => (value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const half = { flex: 1 };

  return (
    <BottomSheet visible={row !== null} onClose={onClose} title={draft.machineNo ? tr('No {no}', { no: draft.machineNo }) : tr('Makine satırı')}>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Input containerStyle={half} label={tr('Mak No')} value={draft.machineNo} onChangeText={set('machineNo')} inputMode="numeric" keyboardType="number-pad" error={errors.machineNo ?? null} />
        <Input containerStyle={half} label={tr('Pus')} unit={tr('inç')} value={draft.diameterInch} onChangeText={set('diameterInch')} inputMode="decimal" keyboardType="decimal-pad" error={errors.diameterInch ?? null} />
      </View>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Input containerStyle={half} label={tr('Fine')} value={draft.gaugeText} onChangeText={set('gaugeText')} placeholder="28-22" error={errors.gaugeText ?? null} />
        <Input containerStyle={half} label={tr('Sistem')} value={draft.feeders} onChangeText={set('feeders')} inputMode="numeric" keyboardType="number-pad" error={errors.feeders ?? null} />
      </View>
      <Input label={tr('Marka')} value={draft.brand} onChangeText={set('brand')} maxLength={60} />
      <Input label={tr('İğne')} value={draft.needlesText} onChangeText={set('needlesText')} placeholder="2808-2210" error={errors.needlesText ?? null} />
      <Input label={tr('Örgü cinsi')} value={draft.fabricType} onChangeText={set('fabricType')} maxLength={80} />
      <ChipRow>
        {kindOptions().map((o) => (
          <Chip key={o.value} label={o.label} selected={draft.kindGuess === o.value} onPress={() => setDraft({ ...draft, kindGuess: o.value })} />
        ))}
      </ChipRow>
      <ButtonRow>
        <Button kind="danger" label={tr('Satırı sil')} icon="trash-outline" onPress={() => onDelete(draft.id)} />
        <Button label={tr('Tamam')} disabled={Object.keys(errors).length > 0} onPress={() => onSave(draft)} />
      </ButtonRow>
    </BottomSheet>
  );
}
