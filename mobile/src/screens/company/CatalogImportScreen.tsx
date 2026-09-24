// Toplu ürün aktarımı (web sitesinden ya da hazır dosyadan).
// 1) Kaynak: "Web sitesinden" (adres, firma sitesiyle ön dolu → Tara) ya da
//    "Dosyadan" (Excel/CSV/PDF/fotoğraf). 2) Sunucu arka planda okur; ekran 2 sn'de
//    bir ilerlemeyi sorar ("64 üründen 12'si okundu"). 3) Önizleme: küçük görsel,
//    kod, ad, çeşit/gramaj/en/içerik, kullanım; "ZATEN VAR" olanlar seçili gelmez.
// 4) "N ürünü ekle" → kayıt da arka planda (fotoğraflar indirilir) → özet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  commitCatalogImport,
  fetchCatalogImportJob,
  fetchCompany,
  startCatalogFileImport,
  startCatalogScan,
  type CatalogImportItem,
  type CatalogImportJob,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { useSession } from '../../context/SessionContext';
import { haptics } from '../../features/haptics';
import { DocumentPickError, pickImportFile } from '../../features/documentPicker';
import { categoryLabel, usageLabel } from '../../features/products/catalog';
import { useTheme } from '../../theme/ThemeContext';
import { locale, tr } from '../../i18n';
import { AppBar, Badge, Button, ButtonRow, Card, Chip, ChipRow, EmptyState, Icon, Input, Screen, SegmentControl, SkeletonText } from '../../ui';

type Props = RootStackScreenProps<'CatalogImport'>;
type Source = 'web' | 'file';
type Phase = 'start' | 'reading' | 'review' | 'committing' | 'done';

const POLL_MS = 2000;

const ERRORS: Record<string, string> = {
  invalid_url: 'Adres geçersiz. Örnek: www.firmaniz.com.tr',
  unreachable: 'Siteye ulaşılamadı. Adresi kontrol edip tekrar deneyin.',
  robots_disallow: 'Site, otomatik okumaya izin vermiyor (robots.txt).',
  no_products: 'Bu adreste ürün bulunamadı. Ürünlerin listelendiği sayfanın adresini deneyin.',
  daily_limit: 'Bugünkü aktarma hakkınız doldu, yarın tekrar deneyin.',
  llm_not_configured: 'PDF ve fotoğraf okuma şu an kapalı. Excel ya da CSV deneyin.',
  unsupported_file: 'Bu dosya türü desteklenmiyor. Excel, CSV, PDF ya da fotoğraf seçin.',
  file_too_large: 'Dosya en fazla 10 MB olabilir.',
  unreadable_file: 'Dosya okunamadı. Başka bir dosya deneyin.',
  job_not_found: 'Tarama süresi doldu. Yeniden başlatın.',
};

const num = (n: number) => String(n).replace('.', ',');

function specLine(item: CatalogImportItem) {
  return [
    item.type ? categoryLabel(item.type, item.subtype) : null,
    item.weightGsm != null ? `${num(item.weightGsm)} gr/m²` : null,
    item.widthCm != null ? `${num(item.widthCm)} cm` : null,
    item.compositionText || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function commerceLine(item: CatalogImportItem) {
  const c = item.commerce;
  return [
    c.priceValue != null ? tr('Fiyat') + ` ${num(c.priceValue)}${c.priceCurrency ? ` ${c.priceCurrency}` : ''}${c.priceUnit ? `/${c.priceUnit}` : ''}` : null,
    c.stock != null ? tr('Stok {n} {unit}', { n: num(c.stock), unit: c.stockUnit }) : null,
    c.moq != null ? `MOQ ${num(c.moq)}` : null,
    c.leadTimeDays != null ? tr('Termin {n} gün', { n: c.leadTimeDays }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Varsayılan seçim: eklenebilir, firmada yok, listede tekrar değil.
const selectable = (i: CatalogImportItem) => i.canImport && !i.exists && !i.duplicate;

export function CatalogImportScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const [source, setSource] = useState<Source>(route.params?.source ?? 'web');
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('start');
  const [job, setJob] = useState<CatalogImportJob | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [navigation]);

  // Firmanın web sitesi kayıtlıysa adres alanı onunla dolar.
  useEffect(() => {
    if (!user?.companyId) return;
    fetchCompany(user.companyId)
      .then(({ company }) => {
        if (alive.current && company.website) setUrl((prev) => prev || company.website);
      })
      .catch(() => undefined);
  }, [user?.companyId]);

  const poll = useCallback((jobId: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!alive.current) return;
      try {
        const next = await fetchCatalogImportJob(jobId);
        if (!alive.current) return;
        setJob(next);
        if (next.status === 'scanning' || next.status === 'committing') {
          poll(jobId);
        } else if (next.status === 'ready') {
          setSelected(new Set(next.items.filter(selectable).map((i) => i.key)));
          setPhase('review');
          haptics.success();
        } else if (next.status === 'done') {
          setPhase('done');
          haptics.success();
        } else {
          setPhase('start');
          setError((next.error && ERRORS[next.error] && tr(ERRORS[next.error])) || next.notices[0] || tr('Okuma tamamlanamadı, tekrar deneyin.'));
          haptics.error();
        }
      } catch (err) {
        if (!alive.current) return;
        if (err instanceof ApiError && err.code === 'job_not_found') {
          setPhase('start');
          setError(tr(ERRORS.job_not_found));
          return;
        }
        // Geçici ağ hatası: sormaya devam.
        poll(jobId);
      }
    }, POLL_MS);
  }, []);

  const showStartError = (err: unknown) => {
    haptics.error();
    setPhase('start');
    if (err instanceof ApiError && err.code && ERRORS[err.code]) setError(tr(ERRORS[err.code]));
    else setError(friendlyMessage(err, tr('Başlatılamadı, tekrar deneyin.')));
  };

  const scan = async () => {
    if (!url.trim()) {
      setError(tr('Web sitenizin adresini yazın.'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { jobId } = await startCatalogScan(url.trim());
      setJob(null);
      setPhase('reading');
      poll(jobId);
    } catch (err) {
      showStartError(err);
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async () => {
    setError(null);
    let picked;
    try {
      picked = await pickImportFile();
    } catch (err) {
      setError(err instanceof DocumentPickError && err.code === 'too_large' ? tr(ERRORS.file_too_large) : tr('Dosya okunamadı.'));
      return;
    }
    if (!picked) return;
    setBusy(true);
    setPhase('reading');
    setJob(null);
    try {
      const { jobId } = await startCatalogFileImport(picked.dataUrl, picked.name);
      poll(jobId);
    } catch (err) {
      showStartError(err);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!job || !selected.size) return;
    setError(null);
    setBusy(true);
    try {
      await commitCatalogImport(job.jobId, [...selected]);
      setPhase('committing');
      poll(job.jobId);
    } catch (err) {
      haptics.error();
      setError(err instanceof ApiError && err.code && ERRORS[err.code] ? tr(ERRORS[err.code]) : friendlyMessage(err, tr('Ürünler eklenemedi, tekrar deneyin.')));
    } finally {
      setBusy(false);
    }
  };

  const items = job?.items ?? [];
  const addable = useMemo(() => items.filter((i) => i.canImport && !i.exists), [items]);
  const existing = items.filter((i) => i.exists).length;
  const toggle = (item: CatalogImportItem) => {
    if (!item.canImport) return;
    haptics.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  };

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    setJob(null);
    setSelected(new Set());
    setPhase('start');
    setError(null);
  };

  const banner = (message: string, tone: 'danger' | 'warning') => (
    <View
      key={message}
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

  const bar = <AppBar title={tr('Toplu ürün aktar')} leading="back" onBack={() => navigation.goBack()} />;

  if (!user?.companyId) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState icon="sample" title={tr('Ürünler firmaya bağlı')} description={tr('Bir firmaya bağlandığında ürünlerini toplu aktarabilirsin.')} />
        </Screen>
      </View>
    );
  }

  const progress = job?.status === 'committing' || phase === 'committing' ? job?.commit : job?.progress;
  const readingText =
    source === 'web'
      ? progress && progress.total
        ? progress.done === 1
          ? tr('{total} üründen {done}\'i okundu', { total: progress.total, done: progress.done })
          : tr('{total} üründen {done}\'si okundu', { total: progress.total, done: progress.done })
        : tr('Sitedeki ürün listesi aranıyor…')
      : progress && progress.total
        ? tr('{n} satır okundu', { n: progress.total })
        : tr('Dosya okunuyor…');

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <Screen
        sticky={
          phase === 'review' ? (
            <Button
              size="lg"
              label={selected.size ? tr('{n} ürünü ekle', { n: selected.size }) : tr('Eklenecek ürün seçin')}
              loading={busy}
              disabled={busy || !selected.size}
              onPress={() => void commit()}
            />
          ) : undefined
        }
      >
        {phase === 'start' ? (
          <View style={{ gap: t.space[4] }}>
            <SegmentControl
              accessibilityLabel={tr('Aktarma kaynağı')}
              stretch
              value={source}
              onChange={(v) => {
                setSource(v);
                setError(null);
              }}
              options={[
                { value: 'web', label: tr('Web sitesinden') },
                { value: 'file', label: tr('Dosyadan') },
              ]}
            />
            {source === 'web' ? (
              <Card>
                <View style={{ gap: t.space[3] }}>
                  <Text style={[t.type.title18, { color: t.colors.ink }]}>{tr('Sitenizdeki ürünleri tek seferde ekleyin')}</Text>
                  <Text style={[t.type.body16, { color: t.colors.ink2 }]}>
                    {tr('Ürün sayfalarındaki kod, gramaj, en, içerik ve fotoğraflar okunur. Eklemeden önce listeyi kontrol edip seçersiniz.')}
                  </Text>
                  <Input
                    label={tr('Web sitesi adresi')}
                    value={url}
                    onChangeText={setUrl}
                    placeholder="www.firmaniz.com.tr"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    inputMode="url"
                    returnKeyType="go"
                    onSubmitEditing={() => void scan()}
                  />
                  <Button label={tr('Tara')} icon="search" loading={busy} disabled={busy} onPress={() => void scan()} />
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                    {tr('Yalnızca kendi sitenizi taratın. Okuma yavaş ve sitenin kurallarına uyarak yapılır; 60 ürünlük bir site birkaç dakika sürebilir.')}
                  </Text>
                </View>
              </Card>
            ) : (
              <Card>
                <View style={{ gap: t.space[3] }}>
                  <Text style={[t.type.title18, { color: t.colors.ink }]}>{tr('Ürün listenizi dosyadan ekleyin')}</Text>
                  <Text style={[t.type.body16, { color: t.colors.ink2 }]}>
                    {tr('Excel, CSV, PDF katalog ya da fiyat listesinin fotoğrafı (en fazla 10 MB). Kod, ad, tür, gramaj, en, içerik, kullanım, fiyat ve stok sütunları tanınır.')}
                  </Text>
                  <Button kind="secondary" label={tr('Dosya seç')} icon="document-outline" loading={busy} disabled={busy} onPress={() => void chooseFile()} />
                </View>
              </Card>
            )}
          </View>
        ) : null}

        {phase === 'reading' || phase === 'committing' ? (
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Text style={[t.type.body16Strong, { color: t.colors.ink }]} accessibilityLiveRegion="polite">
                {phase === 'committing'
                  ? job?.commit
                    ? tr('{total} üründen {done} tanesi eklendi', { total: job.commit.total, done: job.commit.done })
                    : tr('Ekleniyor…')
                  : readingText}
              </Text>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                {phase === 'committing' ? tr('Fotoğraflar sitenizden indiriliyor. Bu ekrandan çıkabilirsiniz; işlem sürer.') : tr('Bu ekrandan çıkarsanız okuma sürer ama listeyi göremezsiniz.')}
              </Text>
              <SkeletonText lines={3} />
            </View>
          </Card>
        ) : null}

        {phase === 'review' && job ? (
          <View style={{ gap: t.space[3] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              {existing
                ? tr('{n} ürün okundu, {m} tanesi kataloğunuzda zaten var.', { n: items.length, m: existing })
                : tr('{n} ürün okundu.', { n: items.length })}
            </Text>
            {job.notices.map((n) => banner(n, 'warning'))}
            <ChipRow>
              <Chip
                label={tr('Tümünü seç')}
                icon="checkmark"
                onPress={() => {
                  haptics.selection();
                  setSelected(new Set(addable.filter((i) => !i.duplicate).map((i) => i.key)));
                }}
              />
              <Chip
                label={tr('Hiçbirini seçme')}
                onPress={() => {
                  haptics.selection();
                  setSelected(new Set());
                }}
              />
            </ChipRow>
            <Card noPadding>
              {items.map((item, index) => (
                <ImportRow
                  key={item.key}
                  item={item}
                  checked={selected.has(item.key)}
                  last={index === items.length - 1}
                  onPress={() => toggle(item)}
                />
              ))}
            </Card>
            <Button kind="quiet" label={tr('Baştan başla')} icon="refresh" onPress={reset} />
          </View>
        ) : null}

        {phase === 'done' && job?.commit ? (
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Icon name="checkmark-circle-outline" color="success" />
              <Text style={[t.type.title18, { color: t.colors.ink }]} accessibilityLiveRegion="polite">
                {tr('{n} ürün eklendi', { n: job.commit.created })}
              </Text>
              <Text style={[t.type.body16, { color: t.colors.ink2 }]}>
                {[
                  job.commit.skipped ? tr('{n} ürün atlandı (aynı kod kataloğunuzda var ya da bilgisi eksik)', { n: job.commit.skipped }) : null,
                  job.commit.failed ? tr('{n} ürün eklenemedi', { n: job.commit.failed }) : null,
                  tr('Eklenen ürünlerde okunan alanlar "onay bekliyor" olarak işaretli; ürün sayfasından kontrol edip onaylayın. Stok 0 olarak girildi.'),
                ]
                  .filter(Boolean)
                  .join('. ')}
              </Text>
              <ButtonRow>
                <Button
                  label={tr('Kataloğu gör')}
                  icon="catalog"
                  onPress={() => navigation.navigate('CompanyProfile', { companyId: user.companyId!, initialTab: 'products' })}
                />
                <Button kind="secondary" label={tr('Başka aktarım')} icon="refresh" onPress={reset} />
              </ButtonRow>
            </View>
          </Card>
        ) : null}

        {error ? banner(error, 'danger') : null}
      </Screen>
    </View>
  );
}

function ImportRow({ item, checked, last, onPress }: { item: CatalogImportItem; checked: boolean; last: boolean; onPress: () => void }) {
  const t = useTheme();
  const specs = specLine(item);
  const commerce = commerceLine(item);
  const usages = [...item.usages.map(usageLabel), ...item.unmappedUses.map((u) => u.toLocaleLowerCase(locale()))].join(', ');
  const disabled = !item.canImport;
  const thumb = item.imageUrls[0];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      accessibilityLabel={[item.name || item.code, item.code, specs, item.exists ? tr('kataloğunuzda zaten var') : null, disabled ? tr('eklenemez') : null]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.space[3],
        minHeight: t.size.row,
        paddingHorizontal: t.space[4],
        paddingVertical: t.space[3],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.colors.line,
        backgroundColor: pressed ? t.colors.surface2 : 'transparent',
      })}
    >
      <Icon name={checked ? 'checkbox-outline' : 'square-outline'} color={disabled ? 'ink3' : checked ? 'brand' : 'ink3'} />
      <View
        style={{
          width: t.size.thumb,
          height: t.size.thumb,
          borderRadius: t.radius.sm,
          borderWidth: 1,
          borderColor: t.colors.line,
          backgroundColor: t.colors.surface2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {thumb ? <Image source={{ uri: thumb }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <Icon name="fabric" color="ink3" />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
        <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{item.name || item.code || tr('Adsız ürün')}</Text>
        {item.code ? <Text style={[t.type.mono14, { color: t.colors.ink2 }]}>{item.code}</Text> : null}
        {specs ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{specs}</Text> : null}
        {usages ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Kullanım: {usages}', { usages })}</Text> : null}
        {commerce ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{commerce}</Text> : null}
        {item.exists ? <Badge kind="pending" label={tr('Zaten var')} style={{ alignSelf: 'flex-start' }} /> : null}
        {item.warnings.map((w) => (
          <View key={w} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] }}>
            <Icon name="warning" size={t.size.iconSm} color={w.startsWith('Eksik') ? 'danger' : 'warning'} />
            <Text style={[t.type.body14, { color: w.startsWith('Eksik') ? t.colors.danger : t.colors.warning, flex: 1, minWidth: 0 }]}>{w}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
