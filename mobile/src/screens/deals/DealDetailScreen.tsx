import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  cancelDeal,
  confirmDealDelivery,
  disputeDeal,
  fetchDeal,
  markDealDelivered,
  reviewDeal,
  DEAL_AUTO_CONFIRM_DAYS,
  DEAL_REVIEW_REVEAL_DAYS,
  type DealReview,
  type DealReviewInput,
  type DealView,
} from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { DealStatusBadge } from '../../components/DealStatusBadge';
import { DATE_PATTERN, formatQuantity, formatQuoteDate } from '../../features/quotes/format';
import { dealTimeline, reviewCriteria, type DealCriterion } from '../../features/deals/timeline';
import { formatDateTime } from '../../features/time';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'DealDetail'>;

type Busy = null | 'deliver' | 'confirm' | 'dispute' | 'cancel' | 'review';

// Faz 3, Adım 4. Sipariş kaydı kabul edilen tekliften doğuyor. Platform ödeme
// almaz, sevkiyat izlemez: burada görünen her şey iki tarafın BEYANIDIR.
// Ödeme konusuna hiçbir metinde girilmiyor (ürün sahibinin kararı).
export function DealDetailScreen({ route, navigation }: Props) {
  const { dealId } = route.params;
  const insets = useSafeAreaInsets();
  const { data: deal, setData, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchDeal(dealId).then((res) => res.deal)
  );

  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deliveredAt, setDeliveredAt] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonDetail variant="timeline" />
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Sipariş alınamadı" onRetry={reload} />
        ) : (
          <EmptyState
            icon="cube-outline"
            title="Sipariş bulunamadı"
            message="Kayıt kaldırılmış ya da size ait olmayabilir."
          />
        )}
      </View>
    );
  }

  const isSeller = deal.role === 'seller';
  const counterparty = isSeller
    ? [deal.buyer?.name, deal.buyer?.company?.name].filter(Boolean).join(' · ') || 'Alıcı'
    : (deal.sellerCompany?.name ?? 'Satıcı firma');
  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Sipariş yenilenemedi') : null);

  const runAction = async (kind: Exclude<Busy, null>, action: () => Promise<{ deal: DealView }>, fallback: string) => {
    setBusy(kind);
    setActionError(null);
    try {
      const { deal: fresh } = await action();
      setData(fresh);
      haptics.success();
      return fresh;
    } catch (err) {
      haptics.error();
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'future_date') setActionError('Teslim tarihi ileri bir gün olamaz.');
      else if (code === 'before_deal') setActionError('Teslim tarihi siparişin açıldığı günden önce olamaz.');
      else if (code === 'invalid_status') setActionError('Siparişin durumu değişmiş. Sayfayı aşağı çekip yenileyin.');
      else if (code === 'not_completed') setActionError('Değerlendirme, teslim onaylandıktan sonra açılır.');
      else if (code === 'already_reviewed') setActionError('Bu siparişi zaten değerlendirdiniz.');
      else setActionError(friendlyMessage(err, fallback));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const deliver = async () => {
    const value = deliveredAt.trim();
    if (value && !DATE_PATTERN.test(value)) {
      setActionError('Teslim tarihini YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).');
      return;
    }
    const fresh = await runAction('deliver', () => markDealDelivered(deal.id, value || undefined), 'Teslim bildirilemedi');
    if (fresh) setDeliveredAt('');
  };

  const confirmDelivery = async () => {
    const ok = await confirmAction({
      title: 'Teslimi onayla',
      message: 'Malı aldığınızı beyan etmiş olursunuz. Onaydan sonra iki taraf birbirini değerlendirebilir.',
      confirmLabel: 'Onayla',
    });
    if (!ok) return;
    await runAction('confirm', () => confirmDealDelivery(deal.id), 'Teslim onaylanamadı');
  };

  const sendDispute = async () => {
    const note = disputeNote.trim();
    if (note.length < 3) {
      setActionError('İtiraz notunu yazın (en az 3 karakter).');
      return;
    }
    const fresh = await runAction('dispute', () => disputeDeal(deal.id, note), 'İtiraz gönderilemedi');
    if (fresh) {
      setDisputeNote('');
      setDisputeOpen(false);
    }
  };

  const cancel = async () => {
    const ok = await confirmAction({
      title: 'Siparişi iptal olarak işaretle',
      message: 'Karşı tarafa bildirilir ve kayıt kapanır. Değerlendirme açılmaz.',
      confirmLabel: 'İptal olarak işaretle',
      destructive: true,
    });
    if (!ok) return;
    await runAction('cancel', () => cancelDeal(deal.id), 'Sipariş iptal olarak işaretlenemedi');
  };

  const sendReview = (input: DealReviewInput) =>
    runAction('review', () => reviewDeal(deal.id, input), 'Değerlendirme gönderilemedi');

  const steps = dealTimeline(deal);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} refreshControl={refreshControl(refreshing, refresh)}>
        <View style={[styles.block, styles.summary]}>
          <View style={styles.summaryTop}>
            <Pressable
              onPress={() => navigation.navigate('ProductDetail', { productId: deal.product.id })}
              accessibilityRole="button"
              accessibilityLabel={`${deal.product.code}, ürün sayfasını aç`}
              hitSlop={6}
              style={({ pressed }) => pressed && styles.pressedFade}
            >
              <Text style={styles.code}>{deal.product.code}</Text>
            </Pressable>
            <DealStatusBadge status={deal.status} />
          </View>
          <Text style={styles.counterparty}>{isSeller ? `Alıcı: ${counterparty}` : counterparty}</Text>
          <Text style={styles.summaryMeta}>
            Miktar: <Text style={styles.summaryValue}>{formatQuantity(deal.quantity, deal.unit)}</Text>
          </Text>
          <Text style={styles.summaryMeta}>
            Anlaşılan teslim tarihi:{' '}
            <Text style={styles.summaryValue}>
              {deal.agreedDeliveryDate ? formatQuoteDate(deal.agreedDeliveryDate) : 'Belirtilmedi'}
            </Text>
          </Text>
          <Text style={styles.hint}>Satıcının teklifindeki termine göre</Text>

          <Pressable
            onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: deal.quoteRequestId })}
            accessibilityRole="button"
            accessibilityLabel="Bu siparişin teklifini aç"
            hitSlop={6}
            style={({ pressed }) => [styles.link, pressed && styles.pressedFade]}
          >
            <Ionicons name="pricetag-outline" size={16} color={colors.accent} />
            <Text style={styles.linkText}>Teklifi aç</Text>
          </Pressable>
        </View>

        {/* Gecikme/zamanında bilgisi yalnızca teslim beyanı ve anlaşılan tarih
            birlikte varsa anlamlı (sunucu lateDays'i o zaman dolduruyor). */}
        {deal.lateDays != null ? (
          <View style={styles.padded}>
            {deal.lateDays > 0 ? (
              <View style={styles.warnBox} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                <Text style={styles.warnText}>{deal.lateDays} gün geç teslim</Text>
              </View>
            ) : (
              <View style={styles.okBox}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={styles.okText}>Zamanında teslim</Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={[styles.block, styles.timeline]}>
          {steps.map((step, index) => (
            <TimelineStep key={step.key} step={step} isLast={index === steps.length - 1} nextDone={!!steps[index + 1]?.done} />
          ))}
        </View>

        {deal.status === 'itiraz' && deal.disputeNote ? (
          <View style={styles.padded}>
            <View style={styles.dangerBox} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <View style={styles.boxTexts}>
                <Text style={styles.dangerTitle}>Alıcı teslim beyanına itiraz etti</Text>
                <Text style={styles.dangerText}>{deal.disputeNote}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {deal.status === 'iptal' ? (
          <View style={styles.padded}>
            <View style={styles.grayBox}>
              <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
              <View style={styles.boxTexts}>
                <Text style={styles.grayTitle}>
                  {deal.cancelledByRole === 'buyer'
                    ? 'Alıcı siparişi iptal olarak işaretledi.'
                    : deal.cancelledByRole === 'seller'
                      ? 'Satıcı siparişi iptal olarak işaretledi.'
                      : 'Sipariş iptal olarak işaretlendi.'}
                </Text>
                {deal.cancelReason ? <Text style={styles.grayText}>{deal.cancelReason}</Text> : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* --- Satıcı eylemi: teslim beyanı --- */}
        {isSeller && (deal.status === 'acik' || deal.status === 'itiraz') ? (
          <View style={[styles.block, styles.actionBlock]}>
            <Text style={styles.blockTitle}>
              {deal.status === 'itiraz' ? 'Teslimi yeniden bildirin' : 'Teslim beyanı'}
            </Text>
            <TextField
              label="Teslim tarihi (YYYY-AA-GG, isteğe bağlı)"
              value={deliveredAt}
              onChangeText={setDeliveredAt}
              placeholder="Boş bırakırsanız bugün yazılır"
              autoCapitalize="none"
            />
            <PrimaryButton
              label={busy === 'deliver' ? 'Bildiriliyor...' : 'Teslim ettim'}
              size="lg"
              disabled={!!busy}
              onPress={deliver}
            />
          </View>
        ) : null}

        {/* --- Alıcı eylemi: onay ya da itiraz --- */}
        {!isSeller && deal.status === 'teslim_bildirildi' ? (
          <View style={[styles.block, styles.actionBlock]}>
            <Text style={styles.blockTitle}>Satıcı teslim ettiğini bildirdi</Text>
            <Text style={styles.blockNote}>
              {DEAL_AUTO_CONFIRM_DAYS} gün içinde yanıt vermezseniz teslim onaylanmış sayılır.
            </Text>
            <PrimaryButton
              label={busy === 'confirm' ? 'Onaylanıyor...' : 'Teslimi onayla'}
              size="lg"
              disabled={!!busy}
              onPress={confirmDelivery}
            />
            {disputeOpen ? (
              <View style={styles.inlineForm}>
                <TextField
                  label="İtiraz notu"
                  value={disputeNote}
                  onChangeText={setDisputeNote}
                  placeholder="Örn. Mal henüz elimize ulaşmadı"
                  multiline
                />
                <View style={styles.rowButtons}>
                  <PrimaryButton
                    label="Vazgeç"
                    variant="outline"
                    disabled={!!busy}
                    onPress={() => {
                      setDisputeOpen(false);
                      setDisputeNote('');
                    }}
                  />
                  <PrimaryButton
                    label={busy === 'dispute' ? 'Gönderiliyor...' : 'İtirazı gönder'}
                    disabled={!!busy}
                    onPress={sendDispute}
                    style={styles.rowMain}
                  />
                </View>
              </View>
            ) : (
              <PrimaryButton label="İtiraz et" variant="outline" size="lg" disabled={!!busy} onPress={() => setDisputeOpen(true)} />
            )}
          </View>
        ) : null}

        {/* --- İki taraf: teslim tamamlanmadan iptal işareti --- */}
        {deal.status !== 'teslim_edildi' && deal.status !== 'iptal' ? (
          <View style={styles.padded}>
            <PrimaryButton
              label={busy === 'cancel' ? 'İşaretleniyor...' : 'Siparişi iptal olarak işaretle'}
              variant="outline"
              disabled={!!busy}
              onPress={cancel}
            />
          </View>
        ) : null}

        {/* --- Değerlendirme --- */}
        {deal.status === 'teslim_edildi' ? (
          <ReviewSection deal={deal} busy={busy === 'review'} disabled={!!busy} onSubmit={sendReview} />
        ) : null}

        {bannerMessage ? (
          <InlineError message={bannerMessage} onRetry={actionError ? undefined : reload} style={styles.banner} />
        ) : null}
      </ScrollView>
    </View>
  );
}

// --- Zaman çizelgesi (numune takibindeki adım görünümünün aynısı) -----------

function TimelineStep({
  step,
  isLast,
  nextDone,
}: {
  step: { label: string; description?: string; occurredAt: string | null; done: boolean };
  isLast: boolean;
  nextDone: boolean;
}) {
  return (
    <View style={styles.stepRow} accessible accessibilityLabel={`${step.label}, ${step.done ? 'tamamlandı' : 'bekleniyor'}`}>
      <View style={styles.rail}>
        <View style={[styles.dot, step.done ? styles.dotDone : styles.dotPending]}>
          {step.done ? <Ionicons name="checkmark" size={14} color={colors.primaryText} /> : null}
        </View>
        {!isLast ? <View style={[styles.line, step.done && nextDone && styles.lineDone]} /> : null}
      </View>
      <View style={[styles.stepBody, isLast && styles.stepBodyLast]}>
        <Text style={[styles.stepLabel, !step.done && styles.stepLabelPending]}>{step.label}</Text>
        {step.occurredAt ? (
          <Text style={styles.stepTime}>{formatDateTime(step.occurredAt)}</Text>
        ) : !step.done ? (
          <Text style={styles.stepMuted}>Bekleniyor</Text>
        ) : null}
        {step.description ? <Text style={styles.stepMuted}>{step.description}</Text> : null}
      </View>
    </View>
  );
}

// --- Değerlendirme bölümü ---------------------------------------------------

function ReviewSection({
  deal,
  busy,
  disabled,
  onSubmit,
}: {
  deal: DealView;
  busy: boolean;
  disabled: boolean;
  onSubmit: (input: DealReviewInput) => Promise<DealView | null>;
}) {
  const criteria = reviewCriteria(deal.role);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const missing = criteria.find((c) => !scores[c.key]);
    if (missing) {
      setFormError('Puanların hepsini verin.');
      return;
    }
    setFormError(null);
    const trimmed = comment.trim();
    const input = (
      deal.role === 'buyer'
        ? { quality: scores.quality, timing: scores.timing, communication: scores.communication }
        : { communication: scores.communication, seriousness: scores.seriousness }
    ) as DealReviewInput;
    await onSubmit(trimmed ? ({ ...input, comment: trimmed } as DealReviewInput) : input);
  };

  return (
    <View style={styles.reviewWrap}>
      {deal.canReview ? (
        <View style={[styles.block, styles.actionBlock]}>
          <Text style={styles.blockTitle}>İşi değerlendirin</Text>
          <Text style={styles.blockNote}>
            Değerlendirmeniz, karşı taraf da yazınca ya da {DEAL_REVIEW_REVEAL_DAYS} gün sonra görünür olur. Böylece iki
            taraf birbirinden etkilenmeden yazar.
          </Text>
          {criteria.map((criterion) => (
            <ScoreRow
              key={criterion.key}
              criterion={criterion}
              value={scores[criterion.key] ?? 0}
              onChange={(value) => setScores((prev) => ({ ...prev, [criterion.key]: value }))}
            />
          ))}
          <TextField
            label="Yorum (isteğe bağlı)"
            value={comment}
            onChangeText={(text) => setComment(text.slice(0, 500))}
            placeholder="Örn. Kumaş numuneyle birebir aynıydı."
            multiline
          />
          {formError ? <Text style={styles.fieldError}>{formError}</Text> : null}
          <PrimaryButton
            label={busy ? 'Gönderiliyor...' : 'Değerlendirmeyi gönder'}
            size="lg"
            disabled={disabled}
            onPress={submit}
          />
        </View>
      ) : null}

      {deal.myReview ? <ReviewCard title="Sizin değerlendirmeniz" review={deal.myReview} /> : null}
      {deal.theirReview ? <ReviewCard title="Karşı tarafın değerlendirmesi" review={deal.theirReview} /> : null}

      {!deal.theirReview ? (
        <View style={styles.padded}>
          <View style={styles.infoBox}>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>
              {deal.theirReviewPending
                ? 'Karşı taraf değerlendirmesini yazdı; siz de yazınca ikisi birlikte görünür olur.'
                : deal.myReview
                  ? `Karşı taraf da yazınca ikisi birlikte görünür olur; yazmazsa teslim onayından ${DEAL_REVIEW_REVEAL_DAYS} gün sonra görünür olur.`
                  : 'Karşı taraf henüz değerlendirmedi.'}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ScoreRow({
  criterion,
  value,
  onChange,
}: {
  criterion: DealCriterion;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{criterion.label}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              haptics.selection();
              onChange(n);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={`${criterion.label}: ${n} puan`}
            style={({ pressed }) => [styles.star, pressed && styles.pressedFade]}
          >
            <Ionicons name={n <= value ? 'star' : 'star-outline'} size={26} color={n <= value ? colors.warning : colors.borderStrong} />
          </Pressable>
        ))}
        <Text style={styles.scoreValue}>{value ? `${value}/5` : ''}</Text>
      </View>
    </View>
  );
}

function ReviewCard({ title, review }: { title: string; review: DealReview }) {
  const rows = reviewCriteria(review.authorRole).map((criterion) => ({
    label: criterion.label,
    value: scoreOf(review, criterion.key),
  }));
  return (
    <View style={styles.padded}>
      <View style={styles.reviewFrame}>
        <View style={styles.reviewInner}>
          <Text style={styles.reviewKicker}>{title.toLocaleUpperCase('tr-TR')}</Text>
          {rows.map((row, index) => (
            <View key={row.label} style={[styles.reviewRow, index < rows.length - 1 && styles.reviewRowDivider]}>
              <Text style={styles.reviewLabel}>{row.label}</Text>
              <Text style={styles.reviewValue}>{row.value != null ? `${row.value}/5` : ''}</Text>
            </View>
          ))}
          {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function scoreOf(review: DealReview, key: DealCriterion['key']): number | null {
  if (key === 'quality') return review.quality;
  if (key === 'timing') return review.timing;
  if (key === 'seriousness') return review.seriousness;
  return review.communication;
}

const DOT_SIZE = 22;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.blockGap },
  block: { backgroundColor: colors.surface },
  padded: { paddingHorizontal: spacing.gutter },
  pressedFade: { opacity: 0.6 },
  summary: { padding: spacing.gutter, gap: 3 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  code: { fontFamily: fonts.monoSemibold, fontSize: 20, lineHeight: 26, color: colors.primary },
  counterparty: { ...typography.label, color: colors.accent },
  summaryMeta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  summaryValue: { ...typography.mono, fontSize: 15, color: colors.text },
  hint: { ...typography.caption, color: colors.textMuted },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: MIN_TOUCH },
  linkText: { ...typography.label, fontFamily: fonts.semibold, color: colors.accent },

  timeline: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.xs },
  stepRow: { flexDirection: 'row', gap: 12 },
  rail: { width: DOT_SIZE, alignItems: 'center' },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.primary },
  dotPending: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong },
  line: { flex: 1, width: 2, backgroundColor: colors.borderStrong, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, gap: 2, paddingBottom: 18 },
  stepBodyLast: { paddingBottom: spacing.gutter },
  stepLabel: { ...typography.subtitle, color: colors.text },
  stepLabelPending: { color: colors.textMuted },
  stepTime: { ...typography.mono, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  stepMuted: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },

  actionBlock: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.md, gap: spacing.sm },
  blockTitle: { ...typography.subtitle, color: colors.text },
  blockNote: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  inlineForm: { gap: spacing.sm },
  rowButtons: { flexDirection: 'row', gap: spacing.sm },
  rowMain: { flex: 1 },
  fieldError: { ...typography.caption, color: colors.danger },

  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  warnText: { ...typography.label, fontFamily: fonts.semibold, color: colors.warning, flexShrink: 1 },
  okBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  okText: { ...typography.label, fontFamily: fonts.semibold, color: colors.success, flexShrink: 1 },
  dangerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  dangerTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.danger },
  dangerText: { ...typography.label, fontFamily: fonts.regular, color: colors.text },
  grayBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.chip,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  grayTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted },
  grayText: { ...typography.label, fontFamily: fonts.regular, color: colors.text },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.surfaceTonal,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  infoText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  boxTexts: { flex: 1, gap: 2 },

  reviewWrap: { gap: spacing.blockGap },
  scoreRow: { gap: 4 },
  scoreLabel: { ...typography.label, color: colors.text },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { ...typography.mono, fontSize: 14, color: colors.textMuted, marginLeft: spacing.xs },
  // Kesik çizgili kart: teklif kartı ve pasaport kartıyla aynı görsel dil.
  reviewFrame: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: 4 },
  reviewInner: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    gap: 2,
  },
  reviewKicker: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0.5, color: colors.textMuted },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
  reviewRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  reviewLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, flexShrink: 1 },
  reviewValue: { ...typography.mono, fontFamily: fonts.monoMedium, fontSize: 16, color: colors.text },
  reviewComment: { ...typography.label, fontFamily: fonts.regular, color: colors.text, paddingTop: spacing.xs },
  banner: { marginHorizontal: spacing.gutter },
});
