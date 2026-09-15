import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  fetchSampleRequestTimeline,
  updateSampleRequestStatus,
  type SampleTimelineStep,
} from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { SkeletonDetail } from '../../components/Skeleton';
import {
  EmptyState,
  ErrorState,
  InlineError,
  friendlyMessage,
  isNotFound,
} from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SampleStatusBadge } from '../../components/SampleStatusBadge';
import { formatDateTime } from '../../features/time';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'SampleRequestTracking'>;

// Taslak: docs/tasarim-yonleri/CTakip.dc.html. Özet bloğu (kod + durum, firma,
// teslimat), adım çizelgesi bloğu; bir sonraki adımı işaretleme alanı ekranın
// altına sabit.
export function SampleRequestTrackingScreen({ route, navigation }: Props) {
  const { sampleRequestId } = route.params;
  const insets = useSafeAreaInsets();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchSampleRequestTimeline(sampleRequestId)
  );
  const [advancing, setAdvancing] = useState(false);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

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

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonDetail variant="timeline" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Takip bilgisi alınamadı" onRetry={reload} />
        ) : (
          <EmptyState icon="flask-outline" title="Talep bulunamadı" message="Talep silinmiş ya da size ait olmayabilir." />
        )}
      </View>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Takip bilgisi yenilenemedi') : null);

  const { sampleRequest, steps, nextStep } = data;
  const product = sampleRequest.product;
  // Teslim adımında kimin teslim aldığı yazılabiliyor ("Giriş ofisinde teslim
  // alındı"); not alanı yalnızca o adımda, ara adımlarda anlamı yok.
  const asksForNote = nextStep?.status === 'teslim_edildi';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl(refreshing, refresh)}>
        <View style={[styles.block, styles.summary]}>
          <View style={styles.summaryTop}>
            <Pressable
              onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
              accessibilityRole="button"
              accessibilityLabel={`${product.code}, ürün sayfasını aç`}
              hitSlop={6}
              style={({ pressed }) => pressed && styles.pressedFade}
            >
              <Text style={styles.code}>{product.code}</Text>
            </Pressable>
            <SampleStatusBadge status={sampleRequest.status} label={sampleRequest.statusLabel} />
          </View>
          <Pressable
            onPress={() => navigation.navigate('CompanyProfile', { companyId: product.companyId })}
            accessibilityRole="button"
            accessibilityLabel={`${product.company.name}, firma sayfasını aç`}
            hitSlop={6}
            style={({ pressed }) => [styles.companyLink, pressed && styles.pressedFade]}
          >
            <Text style={styles.company}>{product.company.name}</Text>
          </Pressable>
          <Text style={styles.summaryMeta}>Teslimat: {sampleRequest.deliveryModeLabel}</Text>
          {sampleRequest.note ? <Text style={styles.requestNote}>“{sampleRequest.note}”</Text> : null}
        </View>

        <View style={[styles.block, styles.timeline]}>
          {steps.map((step, index) => (
            <TimelineStep
              key={step.status}
              step={step}
              isLast={index === steps.length - 1}
              nextDone={steps[index + 1]?.state === 'done'}
            />
          ))}
        </View>

        {bannerMessage ? (
          <InlineError message={bannerMessage} onRetry={actionError ? undefined : reload} style={styles.banner} />
        ) : null}
      </ScrollView>

      {nextStep ? (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
          {asksForNote ? (
            <>
              <Text style={styles.noteLabel}>
                Teslim notu <Text style={styles.noteOptional}>(isteğe bağlı)</Text>
              </Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Örn. Giriş ofisinde teslim alındı"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Teslim notu, isteğe bağlı"
              />
            </>
          ) : null}
          <PrimaryButton
            label={advancing ? 'Güncelleniyor' : `${nextStep.label} olarak işaretle`}
            size="lg"
            disabled={advancing}
            onPress={handleAdvance}
          />
        </View>
      ) : null}
    </View>
  );
}

function TimelineStep({ step, isLast, nextDone }: { step: SampleTimelineStep; isLast: boolean; nextDone: boolean }) {
  const done = step.state === 'done';
  const actor = step.actor;
  return (
    <View style={styles.stepRow} accessible accessibilityLabel={`${step.label}, ${done ? 'tamamlandı' : 'bekleniyor'}`}>
      {/* Sol sütun: tamamlanan adım lacivert dolu daire + onay ikonu, bekleyen
          adım içi boş daire. İki tamamlanmış adım arası çizgi lacivert, bekleyen
          adıma giden çizgi gri. (Eskiden onay işareti ✓ karakteriydi, FINDING-012.) */}
      <View style={styles.rail}>
        <View style={[styles.dot, done ? styles.dotDone : styles.dotPending]}>
          {done ? <Ionicons name="checkmark" size={14} color={colors.primaryText} /> : null}
        </View>
        {!isLast ? <View style={[styles.line, done && nextDone && styles.lineDone]} /> : null}
      </View>

      <View style={[styles.stepBody, isLast && styles.stepBodyLast]}>
        <Text style={[styles.stepLabel, !done && styles.stepLabelPending]}>{step.label}</Text>
        {step.occurredAt ? (
          <Text style={styles.stepTime}>{formatDateTime(step.occurredAt)}</Text>
        ) : !done ? (
          <Text style={styles.stepMuted}>Bekleniyor</Text>
        ) : null}
        {step.description ? <Text style={styles.stepMuted}>{step.description}</Text> : null}
        {step.note ? <Text style={styles.stepText}>{step.note}</Text> : null}
        {actor ? (
          <Text style={styles.stepText}>
            {[`${actor.firstName} ${actor.lastName}`, actor.company?.name].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const DOT_SIZE = 22;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.blockGap, paddingBottom: spacing.md },
  block: { backgroundColor: colors.surface },
  pressedFade: { opacity: 0.6 },
  summary: { padding: spacing.gutter, gap: 3 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  code: { fontFamily: fonts.monoSemibold, fontSize: 20, lineHeight: 26, color: colors.primary },
  companyLink: { alignSelf: 'flex-start' },
  company: { ...typography.label, color: colors.accent },
  summaryMeta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  requestNote: { ...typography.label, fontFamily: fonts.regular, color: colors.text, marginTop: spacing.xs },
  timeline: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.xs },
  stepRow: { flexDirection: 'row', gap: 12 },
  rail: { width: DOT_SIZE, alignItems: 'center' },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary },
  dotPending: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong },
  // Çizgi bir sonraki adımın dairesine kadar uzasın diye esner.
  line: { flex: 1, width: 2, backgroundColor: colors.borderStrong, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, gap: 2, paddingBottom: 18 },
  stepBodyLast: { paddingBottom: spacing.gutter },
  stepLabel: { ...typography.subtitle, color: colors.text },
  stepLabelPending: { color: colors.textMuted },
  stepTime: { ...typography.mono, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  stepMuted: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  stepText: { ...typography.label, fontFamily: fonts.regular, color: colors.text },
  banner: { marginHorizontal: spacing.gutter },
  actionBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
    gap: spacing.sm,
  },
  noteLabel: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  noteOptional: { fontFamily: fonts.regular, color: colors.textMuted },
  noteInput: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    paddingHorizontal: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
});
