// Teklif isteği formu (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri/işlev katmanı Faz 2, Adım 2'deki gibi: gövde ve hata kodları aynı.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, createQuoteRequest } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { STOCK_UNITS, STOCK_UNIT_LABELS, type StockUnit } from '../../features/products/catalog';
import { parseNumber } from '../../features/calculators/parse';
import { DATE_PATTERN } from '../../features/quotes/format';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Button, Card, Icon, Input, Screen, SectionTitle, SegmentControl } from '../../ui';
import { tr } from '../../i18n';

type Props = RootStackScreenProps<'QuoteRequestForm'>;

const UNIT_OPTIONS = STOCK_UNITS.map((unit) => ({ value: unit, label: STOCK_UNIT_LABELS[unit].long }));

// Faz 2, Adım 2: eski "Teklif iste" sohbet açıyordu; artık gerçek bir istek
// formu. Bağlantı şartı YOK (Fırat'ın kararı 2026-09-17), istek doğrudan
// satıcı firmaya düşer.
export function QuoteRequestFormScreen({ route, navigation }: Props) {
  const t = useTheme();
  const { productId, productCode, stockUnit } = route.params;
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<StockUnit>(stockUnit === 'kg' ? 'kg' : 'm');
  const [targetDate, setTargetDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 409 already_open: aynı ürüne açık isteği var, ikincisi açılmaz.
  const [existingId, setExistingId] = useState<string | null>(null);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const quantityValue = parseNumber(quantity);
  const dateInvalid = !!targetDate.trim() && !DATE_PATTERN.test(targetDate.trim());
  const canSubmit = quantityValue > 0 && !dateInvalid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setExistingId(null);
    try {
      const { request } = await createQuoteRequest({
        productId,
        quantity: quantityValue,
        unit,
        targetDate: targetDate.trim() ? targetDate.trim() : null,
        note: note.trim() || undefined,
      });
      haptics.success();
      // replace: geri tuşu doldurulmuş forma dönmesin.
      navigation.replace('QuoteRequestDetail', { requestId: request.id });
    } catch (err) {
      haptics.error();
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.code === 'already_open') {
        const requestId = typeof apiError.body?.requestId === 'string' ? apiError.body.requestId : null;
        setExistingId(requestId);
        setError(tr('Bu ürün için zaten açık bir teklif isteğiniz var.'));
      } else if (apiError?.code === 'own_product') {
        setError(tr('Kendi firmanızın ürününe teklif isteyemezsiniz.'));
      } else if (apiError?.code === 'daily_limit') {
        // Faz 3, Adım 1: günlük toplam teklif isteği sınırı tekil istekte de var.
        const remaining = typeof apiError.body?.remaining === 'number' ? apiError.body.remaining : 0;
        setError(
          remaining > 0
            ? tr('Günlük teklif isteği sınırına yaklaştınız; bugün {n} istek hakkınız kaldı.', { n: remaining })
            : tr('Günlük teklif isteği sınırına ulaştınız. Yarın tekrar deneyin.')
        );
      } else if (apiError?.code === 'product_not_found') {
        setError(tr('Ürün bulunamadı, kaldırılmış olabilir.'));
      } else {
        setError(friendlyMessage(err, tr('Teklif isteği gönderilemedi')));
      }
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Teklif iste')} leading="back" onBack={() => navigation.goBack()} />
      <Screen
        sticky={
          <Button
            size="lg"
            label={tr('Teklif iste')}
            loading={submitting}
            disabled={!canSubmit}
            onPress={submit}
          />
        }
      >
        <Card>
          <View style={{ gap: t.space[1] }}>
            <Text style={[t.type.mono20, { color: t.colors.ink }]}>{productCode}</Text>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              {tr('Ne kadar ve ne zaman istediğinizi yazın; satıcı firma teklifini hazırlayıp gönderir.')}
            </Text>
          </View>
        </Card>

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
        </View>

        {error ? (
          <View style={{ gap: t.space[3] }}>
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
            {existingId ? (
              <Button
                kind="secondary"
                label={tr('Mevcut isteğe git')}
                onPress={() => navigation.replace('QuoteRequestDetail', { requestId: existingId })}
              />
            ) : null}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
