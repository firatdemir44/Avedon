// Çoklu teklif isteği formu (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri/işlev katmanı Faz 3, Adım 1'deki gibi: gövde, hata kodları ve
// atlanan ürün akışı aynı. Ham hex / ham px yok.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, MAX_RFQ_COMPANIES, createRfq, type RfqSkipped } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { STOCK_UNITS, STOCK_UNIT_LABELS, isYarnType, type StockUnit } from '../../features/products/catalog';
import { parseNumber } from '../../features/calculators/parse';
import { DATE_PATTERN } from '../../features/quotes/format';
import { companyCountOf, type RfqSelectionItem } from '../../features/quotes/rfqSelection';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Avatar, Button, Card, Icon, Input, Screen, SectionTitle, SegmentControl } from '../../ui';
import { tr } from '../../i18n';

type Props = RootStackScreenProps<'RfqForm'>;

const UNIT_OPTIONS = STOCK_UNITS.map((unit) => ({ value: unit, label: STOCK_UNIT_LABELS[unit].long }));

const SKIP_REASONS = (): Record<string, string> => ({
  not_found: tr('ürün bulunamadı'),
  own_product: tr('kendi firmanızın ürünü'),
  same_company: tr('aynı firmadan başka ürün seçilmişti'),
  already_open: tr('bu ürün için zaten açık isteğiniz var'),
});

// Faz 3, Adım 1: tek üründe kalan teklif isteğinin çoklu hali. Aynı ihtiyaç
// birkaç firmaya birden sorulur; istek FİRMA başına tek gider.
export function RfqFormScreen({ route, navigation }: Props) {
  const t = useTheme();
  // Asistanın "teklif_topla" kartından gelindiyse kullanıcının söylediği
  // miktar/birim/termin/not forma ön dolu gelir; hepsi değiştirilebilir.
  const prefill = route.params.prefill;
  const [items, setItems] = useState<RfqSelectionItem[]>(route.params.items);
  // Ön dolgudaki birim varsa o; yoksa hepsi iplikse kg, aksi halde metre.
  const [unit, setUnit] = useState<StockUnit>(
    prefill?.unit ??
      (route.params.items.length > 0 && route.params.items.every((i) => isYarnType(i.type) || i.stockUnit === 'kg')
        ? 'kg'
        : 'm')
  );
  const [quantity, setQuantity] = useState(
    prefill?.quantity != null ? String(prefill.quantity).replace('.', ',') : ''
  );
  const [targetDate, setTargetDate] = useState(prefill?.targetDate ?? '');
  const [note, setNote] = useState(prefill?.note ?? '');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gönderildi ama bir kısmı atlandı: nedenleri gösterip kullanıcıyı
  // karşılaştırmaya kendisi geçirsin (sessizce atlamak yanıltıcı olurdu).
  const [result, setResult] = useState<{ rfqId: string; skipped: RfqSkipped[] } | null>(null);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const companyCount = companyCountOf(items);
  const quantityValue = parseNumber(quantity);
  const dateInvalid = !!targetDate.trim() && !DATE_PATTERN.test(targetDate.trim());
  const canSubmit = quantityValue > 0 && companyCount >= 2 && !dateInvalid && !submitting && !result;

  const codeOf = (productId: string) => items.find((i) => i.id === productId)?.code ?? tr('Ürün');

  const openCompare = (rfqId: string) => {
    // replace: geri tuşu doldurulmuş forma dönmesin.
    navigation.replace('RfqCompare', { rfqId });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { rfq, skipped } = await createRfq({
        productIds: items.map((i) => i.id),
        quantity: quantityValue,
        unit,
        targetDate: targetDate.trim() ? targetDate.trim() : null,
        note: note.trim() || undefined,
        title: title.trim() || undefined,
      });
      haptics.success();
      if (skipped.length === 0) {
        openCompare(rfq.id);
        return;
      }
      setResult({ rfqId: rfq.id, skipped });
      setSubmitting(false);
    } catch (err) {
      haptics.error();
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.code === 'need_two_companies') {
        setError(tr('En az 2 farklı firmadan ürün gerekiyor. Seçtikleriniz aynı firmadan ya da size ait olabilir.'));
      } else if (apiError?.code === 'too_many_companies') {
        setError(tr('En çok {n} firmaya sorabilirsiniz. Birkaç ürünü listeden çıkarın.', { n: MAX_RFQ_COMPANIES }));
      } else if (apiError?.code === 'daily_limit') {
        const remaining = typeof apiError.body?.remaining === 'number' ? apiError.body.remaining : 0;
        setError(
          remaining > 0
            ? tr('Günlük teklif isteği sınırına yaklaştınız; bugün {n} istek hakkınız kaldı.', { n: remaining })
            : tr('Günlük teklif isteği sınırına ulaştınız. Yarın tekrar deneyin.')
        );
      } else {
        setError(friendlyMessage(err, tr('Teklif isteği gönderilemedi')));
      }
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Çoklu teklif iste')} leading="back" onBack={() => navigation.goBack()} />
      <Screen
        sticky={
          result ? (
            <Button size="lg" label={tr('Karşılaştırmayı aç')} onPress={() => openCompare(result.rfqId)} />
          ) : (
            <Button
              size="lg"
              label={tr('Teklif iste ({n} firma)', { n: companyCount })}
              loading={submitting}
              disabled={!canSubmit}
              onPress={submit}
            />
          )
        }
      >
        <Text style={[t.type.body16, { color: t.colors.ink2 }]}>
          {tr('Aynı ihtiyacı {n} firmaya birden soruyorsunuz. Her firmaya tek istek gider; gelen teklifleri tek tabloda karşılaştırırsınız.', { n: companyCount })}
        </Text>

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Seçilen ürünler ({n})', { n: items.length })} />
          <Card>
            {items.map((item, index) => (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space[3],
                  minHeight: t.size.touchMin,
                  paddingVertical: t.space[1],
                  borderBottomWidth: index < items.length - 1 ? 1 : 0,
                  borderBottomColor: t.colors.line,
                }}
              >
                <Avatar name={item.companyName} kind="company" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[t.type.mono14, { color: t.colors.ink }]} numberOfLines={1}>
                    {item.code}
                  </Text>
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]} numberOfLines={1}>
                    {item.companyName}
                  </Text>
                </View>
                {/* İkon-yalnız çıkarma düğmesi: 44px hedef, erişilebilirlik adı var. */}
                <Pressable
                  onPress={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                  accessibilityRole="button"
                  accessibilityLabel={tr('{code} ürününü listeden çıkar', { code: item.code })}
                  style={({ pressed }) => ({
                    width: t.size.touchMin,
                    height: t.size.touchMin,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: t.radius.md,
                    backgroundColor: pressed ? t.colors.surface2 : 'transparent',
                  })}
                >
                  <Icon name="x" size={t.size.iconSm} color="danger" />
                </Pressable>
              </View>
            ))}
            {companyCount < 2 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1], paddingTop: t.space[2] }}>
                <Icon name="warning" size={t.size.iconSm} color="danger" />
                <Text style={[t.type.body14, { color: t.colors.danger, flexShrink: 1 }]}>
                  {tr('En az 2 farklı firmadan ürün gerekiyor.')}
                </Text>
              </View>
            ) : null}
          </Card>
        </View>

        <View style={{ gap: t.space[4] }}>
          <SectionTitle title={tr('İstek bilgileri')} />
          <Input
            label={tr('Miktar')}
            value={quantity}
            onChangeText={setQuantity}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder={tr('Örn. 1500')}
            unit={STOCK_UNIT_LABELS[unit].short}
          />
          <View style={{ gap: t.space[1] }}>
            <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('Birim')}</Text>
            <SegmentControl<StockUnit> stretch accessibilityLabel={tr('Birim')} value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
          </View>

          <Input
            label={tr('İstenen termin tarihi (isteğe bağlı)')}
            value={targetDate}
            onChangeText={setTargetDate}
            placeholder="2026-11-15"
            autoCapitalize="none"
            helper={tr('YYYY-AA-GG biçiminde yazın.')}
            error={dateInvalid ? tr('Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).') : null}
          />

          <Input
            label={tr('Not (isteğe bağlı)')}
            value={note}
            onChangeText={setNote}
            placeholder={tr('Örn. Ekru, ilk parti 500 m olabilir')}
            multiline
          />
          <Input
            label={tr('Başlık (isteğe bağlı)')}
            value={title}
            onChangeText={setTitle}
            placeholder={tr('Örn. Yazlık süprem alımı')}
          />
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            {tr('Satıcılar başka kaç firmaya sorduğunuzu görmez; onlara normal bir teklif isteği olarak düşer.')}
          </Text>
        </View>

        {result ? (
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
              <Text style={[t.type.label14, { color: t.colors.warning }]}>{tr('Bazı ürünler için istek gönderilmedi:')}</Text>
              {result.skipped.map((s) => (
                <Text key={s.productId} style={[t.type.body14, { color: t.colors.warning }]}>
                  {codeOf(s.productId)} — {SKIP_REASONS()[s.reason] ?? tr('gönderilemedi')}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

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
