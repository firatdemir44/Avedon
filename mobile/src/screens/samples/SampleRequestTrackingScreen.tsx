import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  fetchSampleRequestTimeline,
  updateSampleRequestStatus,
  type SampleActor,
  type SampleRequestTimeline,
  type SampleTimelineStep,
} from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { formatDateTime } from '../../features/time';
import { MIN_TOUCH, colors, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'SampleRequestTracking'>;

export function SampleRequestTrackingScreen({ route, navigation }: Props) {
  const { sampleRequestId } = route.params;
  const [data, setData] = useState<SampleRequestTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetchSampleRequestTimeline(sampleRequestId)
      .then((timeline) => {
        setData(timeline);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Takip bilgisi alınamadı'))
      .finally(() => setLoading(false));
  }, [sampleRequestId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdvance = async () => {
    if (!data?.nextStep) return;
    setAdvancing(true);
    try {
      await updateSampleRequestStatus(sampleRequestId, data.nextStep.status, note.trim() || undefined);
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Durum güncellenemedi');
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Text style={styles.empty}>{error ?? 'Talep bulunamadı.'}</Text>
      </SafeAreaView>
    );
  }

  const { sampleRequest, steps, nextStep } = data;
  // Teslim adımında tasarım kimin teslim aldığını yazıyor ("... İrfan Bey teslim
  // aldı"); sadece o adımda not alanı gösteriliyor, ara adımlarda anlamı yok.
  const asksForNote = nextStep?.status === 'teslim_edildi';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          style={styles.productPill}
          onPress={() =>
            navigation.navigate('CompanyProfile', { companyId: sampleRequest.product.companyId })
          }
        >
          <Text style={styles.productCode}>{sampleRequest.product.code}</Text>
          <Text style={styles.productCompany}>{sampleRequest.product.company.name}</Text>
        </Pressable>

        <Text style={styles.deliveryMode}>{sampleRequest.deliveryModeLabel}</Text>
        {sampleRequest.note ? (
          <Text style={styles.requestNote}>“{sampleRequest.note}”</Text>
        ) : null}

        <View style={styles.timeline}>
          {steps.map((step, index) => (
            <TimelineStep key={step.status} step={step} isLast={index === steps.length - 1} />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {nextStep ? (
          <View style={styles.actionBox}>
            {asksForNote ? (
              <TextField
                label="Teslim notu (isteğe bağlı)"
                value={note}
                onChangeText={setNote}
                placeholder="Örn. Giriş ofisinde İrfan Bey teslim aldı"
                multiline
              />
            ) : null}
            <PrimaryButton
              label={advancing ? 'Güncelleniyor...' : `${nextStep.label} olarak işaretle`}
              disabled={advancing}
              onPress={handleAdvance}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function TimelineStep({ step, isLast }: { step: SampleTimelineStep; isLast: boolean }) {
  const done = step.state === 'done';
  return (
    <View style={styles.stepRow}>
      {/* Sol sütun: tamamlanan adım dolu daire, bekleyen adım içi boş daire;
          aralarında bağlantı çizgisi (tasarımdaki dikey çizelge). */}
      <View style={styles.rail}>
        <View style={[styles.dot, done ? styles.dotDone : styles.dotPending]}>
          {done ? <Text style={styles.dotCheck}>✓</Text> : null}
        </View>
        {!isLast ? <View style={[styles.line, done && styles.lineDone]} /> : null}
      </View>

      <View style={styles.stepBody}>
        <Text style={[styles.stepLabel, !done && styles.stepLabelPending]}>{step.label}</Text>
        {step.occurredAt ? (
          <Text style={styles.stepTime}>{formatDateTime(step.occurredAt)}</Text>
        ) : null}
        {step.note ? <Text style={styles.stepNote}>{step.note}</Text> : null}
        {step.description ? <Text style={styles.stepDescription}>{step.description}</Text> : null}
        {step.actor ? <StepActor actor={step.actor} /> : null}
      </View>
    </View>
  );
}

function StepActor({ actor }: { actor: SampleActor }) {
  return (
    <View style={styles.actorRow}>
      <CompanyAvatar
        name={actor.company?.name ?? actor.firstName}
        size={32}
        companyId={actor.company?.id}
        logoUpdatedAt={actor.company?.logoUpdatedAt}
      />
      <View style={styles.actorText}>
        <Text style={styles.actorName}>
          {actor.firstName} {actor.lastName}
        </Text>
        <Text style={styles.actorMeta}>
          {[actor.company?.name, actor.position].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

const DOT_SIZE = 22;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  // Tasarımda ürün adı açık mavi bir hapın içinde duruyor.
  productPill: {
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  productCode: { ...typography.subtitle, fontWeight: '700', color: colors.primary },
  productCompany: { ...typography.caption, color: colors.textMuted },
  deliveryMode: { ...typography.body, color: colors.text, marginTop: spacing.md },
  requestNote: { ...typography.label, fontWeight: '400', color: colors.textMuted, marginTop: spacing.xs },
  timeline: { marginTop: spacing.lg },
  stepRow: { flexDirection: 'row' },
  rail: { width: DOT_SIZE + spacing.md, alignItems: 'center' },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotPending: { backgroundColor: colors.surface, borderColor: colors.border },
  dotCheck: { color: colors.primaryText, fontSize: 12, fontWeight: '700' },
  // Çizgi, bir sonraki adımın dairesine kadar uzasın diye esner.
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.accent },
  stepBody: { flex: 1, paddingBottom: spacing.lg },
  stepLabel: { ...typography.subtitle, fontWeight: '700', color: colors.primary },
  stepLabelPending: { color: colors.textMuted },
  stepTime: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  stepNote: { ...typography.body, color: colors.text, marginTop: spacing.xs },
  stepDescription: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  actorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceTonal,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  actorText: { marginLeft: spacing.sm, flex: 1 },
  actorName: { ...typography.label, color: colors.text },
  actorMeta: { ...typography.caption, color: colors.textMuted },
  actionBox: { marginTop: spacing.md },
  error: { ...typography.label, fontWeight: '400', color: colors.danger, marginTop: spacing.md },
  empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
