// Numune takibi (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri katmanı değişmedi: GET /sample-requests/:id, PATCH .../status aynı
// gövdeyle; rota adları ve parametreleri aynı. Yalnızca sunum yenilendi.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  fetchSampleRequestTimeline,
  updateSampleRequestStatus,
  type SampleTimelineStep,
} from '../../api/client';
import type { SampleRequestStatus } from '../../types';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatDateTime } from '../../features/time';
import { useTheme } from '../../theme/ThemeContext';
import {
  AppBar,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Screen,
  SkeletonText,
  type BadgeKind,
} from '../../ui';

type Props = RootStackScreenProps<'SampleRequestTracking'>;

// Numune durumu → rozet türü (RequestsScreen ile aynı eşleme).
const SAMPLE_BADGE: Record<SampleRequestStatus, BadgeKind> = {
  talep_edildi: 'pending',
  onaylandi: 'info',
  hazirlandi: 'info',
  teslim_edildi: 'delivered',
};

export function SampleRequestTrackingScreen({ route, navigation }: Props) {
  const { sampleRequestId } = route.params;
  const t = useTheme();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchSampleRequestTimeline(sampleRequestId)
  );
  const [advancing, setAdvancing] = useState(false);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const handleAdvance = async () => {
    if (!data?.nextStep) return;
    setAdvancing(true);
    setActionError(null);
    try {
      await updateSampleRequestStatus(sampleRequestId, data.nextStep.status, note.trim() || undefined);
      setNote('');
      haptics.success();
      await reload();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'Durum güncellenemedi'));
    } finally {
      setAdvancing(false);
    }
  };

  const bar = <AppBar title="Numune takibi" leading="back" onBack={() => navigation.goBack()} />;

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <Card>
            <SkeletonText lines={3} />
          </Card>
          <Card>
            <SkeletonText lines={4} />
          </Card>
        </Screen>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          {error && !isNotFound(error) ? (
            <EmptyState
              icon="warning"
              title="Takip bilgisi alınamadı"
              description={friendlyMessage(error, 'Bağlantıyı kontrol edip yeniden dene.')}
              actionLabel="Yeniden dene"
              onAction={reload}
            />
          ) : (
            <EmptyState
              icon="sample"
              title="Talep bulunamadı"
              description="Talep silinmiş ya da sana ait olmayabilir."
            />
          )}
        </Screen>
      </View>
    );
  }

  const banner = actionError ?? (error ? friendlyMessage(error, 'Takip bilgisi yenilenemedi') : null);

  const { sampleRequest, steps, nextStep } = data;
  const product = sampleRequest.product;
  // Teslim adımında kimin teslim aldığı yazılabiliyor ("Giriş ofisinde teslim
  // alındı"); not alanı yalnızca o adımda, ara adımlarda anlamı yok.
  const asksForNote = nextStep?.status === 'teslim_edildi';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}

      <Screen
        scroll={false}
        sticky={
          nextStep ? (
            <View style={{ gap: t.space[3] }}>
              {asksForNote ? (
                <Input
                  label="Teslim notu (isteğe bağlı)"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Örn. Giriş ofisinde teslim alındı"
                />
              ) : null}
              <Button
                kind="secondary"
                size="lg"
                label={`${nextStep.label} olarak işaretle`}
                loading={advancing}
                onPress={handleAdvance}
              />
            </View>
          ) : null
        }
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: t.space[6], paddingBottom: t.space[10] }}
          refreshControl={refreshControl(refreshing, refresh)}
        >
          {/* Özet: ürün kodu + güncel durum rozeti, firma, teslim şekli, not. */}
          <Card onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
            accessibilityLabel={`${product.code}, ürün sayfasını aç`}>
            <View style={{ gap: t.space[2] }}>
              <Text style={[t.type.mono20, { color: t.colors.ink }]}>{product.code}</Text>
              <Badge kind={SAMPLE_BADGE[sampleRequest.status]} label={sampleRequest.statusLabel} />
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{product.company.name}</Text>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                Teslimat: {sampleRequest.deliveryModeLabel}
              </Text>
              {sampleRequest.note ? (
                <Text style={[t.type.body14, { color: t.colors.ink }]}>“{sampleRequest.note}”</Text>
              ) : null}
            </View>
          </Card>

          <Button
            kind="quiet"
            label="Firma sayfasını aç"
            icon="chevron"
            onPress={() => navigation.navigate('CompanyProfile', { companyId: product.companyId })}
          />

          {/* Adım çizelgesi: durum yalnız renkle değil, ikon + metinle verilir. */}
          <Card>
            <View style={{ gap: t.space[4] }}>
              {steps.map((step) => (
                <TimelineStep key={step.status} step={step} />
              ))}
            </View>
          </Card>

          {banner ? (
            <View
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
              <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{banner}</Text>
            </View>
          ) : null}
        </ScrollView>
      </Screen>
    </View>
  );
}

function TimelineStep({ step }: { step: SampleTimelineStep }) {
  const t = useTheme();
  const done = step.state === 'done';
  const actor = step.actor;
  return (
    <View
      accessible
      accessibilityLabel={`${step.label}, ${done ? 'tamamlandı' : 'bekleniyor'}`}
      style={{ flexDirection: 'row', gap: t.space[3], minWidth: 0 }}
    >
      {/* Tamamlanan adım onay ikonu, bekleyen adım saat ikonu: durum yalnız
          renkle değil ikonla da veriliyor (DESIGN.md §6). */}
      <Icon name={done ? 'check' : 'clock'} size={t.size.iconSm} color={done ? 'success' : 'ink3'} />
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
        <Text style={[t.type.body16Strong, { color: done ? t.colors.ink : t.colors.ink2 }]}>{step.label}</Text>
        {step.occurredAt ? (
          <Text style={[t.type.mono14, { color: t.colors.ink2 }]}>{formatDateTime(step.occurredAt)}</Text>
        ) : !done ? (
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Bekleniyor</Text>
        ) : null}
        {step.description ? (
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{step.description}</Text>
        ) : null}
        {step.note ? <Text style={[t.type.body14, { color: t.colors.ink }]}>{step.note}</Text> : null}
        {actor ? (
          <Text style={[t.type.body14, { color: t.colors.ink }]}>
            {[`${actor.firstName} ${actor.lastName}`, actor.company?.name].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
