// Sipariş kaydı detayı (yeni tasarım, 4. adım — DESIGN.md §2/§3).
//
// Faz 3, Adım 4'teki veri katmanı aynen duruyor: sipariş kabul edilen
// tekliften doğar, platform ödeme almaz ve sevkiyat izlemez; burada görünen
// her şey iki tarafın BEYANIDIR. Ödeme konusuna hiçbir metinde girilmez.
//
// Görünüm yeni: AppBar + Screen, bölümler SectionTitle + Card, durum ui/Badge,
// miktar/fiyat mono14, ekranda tek dolu düğme (duruma göre yalnızca biri
// görünür), diğer eylemler kenarlıklı.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
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
  type DealStatus,
  type DealView,
} from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import { ErrorState, friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { dealStatusLabel } from '../../components/DealStatusBadge';
import { DATE_PATTERN, formatQuantity, formatQuoteDate } from '../../features/quotes/format';
import { dealTimeline, reviewCriteria, type DealCriterion, type DealStep } from '../../features/deals/timeline';
import { formatDateTime } from '../../features/time';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
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
  SectionTitle,
  type BadgeKind,
} from '../../ui';

type Props = RootStackScreenProps<'DealDetail'>;

type Busy = null | 'deliver' | 'confirm' | 'dispute' | 'cancel' | 'review';

// Durum → rozet türü; metin `dealStatusLabel` ile aynı kaynaktan.
const DEAL_BADGE: Record<DealStatus, BadgeKind> = {
  acik: 'info',
  teslim_bildirildi: 'pending',
  teslim_edildi: 'delivered',
  itiraz: 'cancelled',
  iptal: 'cancelled',
};

// Zaman çizelgesindeki nokta (DESIGN.md'de adı olmayan ekran-içi ölçü).
const DOT_SIZE = 22;

// Bölüm: başlık + kart (ürün detayındaki kalıp).
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[2] }}>
      {title ? <SectionTitle title={title} /> : null}
      <Card>{children}</Card>
    </View>
  );
}

// Etiket solda, değer sağda; ölçü/sayı mono14.
function SpecRow({ label, value, sans, last }: { label: string; value: string; sans?: boolean; last?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: t.space[4],
        minHeight: t.size.touchMin,
        paddingVertical: t.space[2],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.colors.line,
      }}
    >
      <Text style={[t.type.body16, { color: t.colors.ink2, flexShrink: 1 }]}>{label}</Text>
      <Text style={[sans ? t.type.body16 : t.type.mono14, { color: t.colors.ink, flexShrink: 1, textAlign: 'right' }]}>
        {value}
      </Text>
    </View>
  );
}

// Bilgi / uyarı şeridi (RequestsScreen'deki banner kalıbı).
function Notice({
  tone,
  icon,
  children,
}: {
  tone: 'danger' | 'warning' | 'success' | 'neutral';
  icon: 'warning' | 'check' | 'info' | 'clock' | 'x';
  children: React.ReactNode;
}) {
  const t = useTheme();
  const map = {
    danger: { bg: t.colors.dangerSoft, fg: t.colors.danger, color: 'danger' as const },
    warning: { bg: t.colors.warningSoft, fg: t.colors.warning, color: 'warning' as const },
    success: { bg: t.colors.successSoft, fg: t.colors.success, color: 'success' as const },
    neutral: { bg: t.colors.surface2, fg: t.colors.ink2, color: 'ink2' as const },
  }[tone];
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: map.bg,
      }}
    >
      <Icon name={icon} size={t.size.iconSm} color={map.color} />
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
        {typeof children === 'string' ? (
          <Text style={[t.type.body14, { color: map.fg }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export function DealDetailScreen({ route, navigation }: Props) {
  const { dealId } = route.params;
  const t = useTheme();
  const { data: deal, setData, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchDeal(dealId).then((res) => res.deal)
  );

  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deliveredAt, setDeliveredAt] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const bar = <AppBar title="Sipariş" leading="back" onBack={() => navigation.goBack()} />;

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <SkeletonDetail variant="timeline" />
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Sipariş alınamadı" onRetry={reload} />
        ) : (
          <Screen>
            <EmptyState
              icon="cube-outline"
              title="Sipariş bulunamadı"
              description="Kayıt kaldırılmış ya da size ait olmayabilir."
            />
          </Screen>
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

  // İtiraz formundaki desen: onay penceresi yerine satır içi küçük form.
  // Neden isteğe bağlı; karşı taraf iptalin sebebini görebilsin diye sorulur.
  const cancel = async () => {
    const reason = cancelReason.trim();
    const fresh = await runAction(
      'cancel',
      () => cancelDeal(deal.id, reason || undefined),
      'Sipariş iptal olarak işaretlenemedi'
    );
    if (fresh) {
      setCancelReason('');
      setCancelOpen(false);
    }
  };

  const sendReview = (input: DealReviewInput) =>
    runAction('review', () => reviewDeal(deal.id, input), 'Değerlendirme gönderilemedi');

  const steps = dealTimeline(deal);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}

      <Screen scroll={false} noPadding contentStyle={{ paddingTop: 0, gap: 0 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: t.space[10] }}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl(refreshing, refresh)}
        >
          <View style={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], gap: t.space[6] }}>
            {/* Özet */}
            <View style={{ gap: t.space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                <Text style={[t.type.mono14, { color: t.colors.ink2 }]}>{deal.product.code}</Text>
                <Badge kind={DEAL_BADGE[deal.status]} label={dealStatusLabel(deal.status)} />
              </View>
              <Text accessibilityRole="header" style={[t.type.title22, { color: t.colors.ink }]}>
                {isSeller ? `Alıcı: ${counterparty}` : counterparty}
              </Text>
            </View>

            <Card>
              <SpecRow label="Miktar" value={formatQuantity(deal.quantity, deal.unit)} />
              <SpecRow
                label="Anlaşılan teslim tarihi"
                value={deal.agreedDeliveryDate ? formatQuoteDate(deal.agreedDeliveryDate) : 'Belirtilmedi'}
                sans={!deal.agreedDeliveryDate}
                last
              />
              <Text style={[t.type.body14, { color: t.colors.ink3, paddingTop: t.space[2] }]}>
                Satıcının teklifindeki termine göre
              </Text>
            </Card>

            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button
                kind="secondary"
                label="Ürünü aç"
                icon="fabric"
                accessibilityLabel={`${deal.product.code}, ürün sayfasını aç`}
                onPress={() => navigation.navigate('ProductDetail', { productId: deal.product.id })}
                style={{ flex: 1 }}
              />
              <Button
                kind="secondary"
                label="Teklifi aç"
                icon="quote"
                accessibilityLabel="Bu siparişin teklifini aç"
                onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: deal.quoteRequestId })}
                style={{ flex: 1 }}
              />
            </View>

            {/* Gecikme/zamanında bilgisi yalnızca teslim beyanı ve anlaşılan tarih
                birlikte varsa anlamlı (sunucu lateDays'i o zaman dolduruyor). */}
            {deal.lateDays != null ? (
              deal.lateDays > 0 ? (
                <Notice tone="warning" icon="warning">{`${deal.lateDays} gün geç teslim`}</Notice>
              ) : (
                <Notice tone="success" icon="check">
                  Zamanında teslim
                </Notice>
              )
            ) : null}

            {/* Zaman çizelgesi */}
            <View style={{ gap: t.space[2] }}>
              <SectionTitle title="Durum" />
              <Card>
                {steps.map((step, index) => (
                  <TimelineStep
                    key={step.key}
                    step={step}
                    isLast={index === steps.length - 1}
                    nextDone={!!steps[index + 1]?.done}
                  />
                ))}
              </Card>
            </View>

            {deal.status === 'iptal' ? (
              <Notice tone="neutral" icon="x">
                <>
                  <Text style={[t.type.label14, { color: t.colors.ink2 }]}>
                    {deal.cancelledByRole === 'buyer'
                      ? 'Alıcı siparişi iptal olarak işaretledi.'
                      : deal.cancelledByRole === 'seller'
                        ? 'Satıcı siparişi iptal olarak işaretledi.'
                        : 'Sipariş iptal olarak işaretlendi.'}
                  </Text>
                  {deal.cancelReason ? (
                    <Text style={[t.type.body14, { color: t.colors.ink }]}>{deal.cancelReason}</Text>
                  ) : null}
                </>
              </Notice>
            ) : null}

            {/* --- Satıcı eylemi: teslim beyanı (ekranın tek dolu düğmesi) --- */}
            {isSeller && (deal.status === 'acik' || deal.status === 'itiraz') ? (
              <Section title={deal.status === 'itiraz' ? 'Teslimi yeniden bildirin' : 'Teslim beyanı'}>
                <View style={{ gap: t.space[3] }}>
                  <Input
                    label="Teslim tarihi (YYYY-AA-GG, isteğe bağlı)"
                    value={deliveredAt}
                    onChangeText={setDeliveredAt}
                    placeholder="Boş bırakırsanız bugün yazılır"
                    autoCapitalize="none"
                    inputMode="numeric"
                  />
                  <Button
                    size="lg"
                    label="Teslim ettim"
                    loading={busy === 'deliver'}
                    disabled={!!busy}
                    onPress={() => void deliver()}
                  />
                </View>
              </Section>
            ) : null}

            {/* --- Alıcı eylemi: onay ya da itiraz --- */}
            {!isSeller && deal.status === 'teslim_bildirildi' ? (
              <Section title="Satıcı teslim ettiğini bildirdi">
                <View style={{ gap: t.space[3] }}>
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                    {DEAL_AUTO_CONFIRM_DAYS} gün içinde yanıt vermezseniz teslim onaylanmış sayılır.
                  </Text>
                  <Button
                    size="lg"
                    label="Teslimi onayla"
                    loading={busy === 'confirm'}
                    disabled={!!busy}
                    onPress={() => void confirmDelivery()}
                  />
                  {disputeOpen ? (
                    <View style={{ gap: t.space[3] }}>
                      <Input
                        label="İtiraz notu"
                        value={disputeNote}
                        onChangeText={setDisputeNote}
                        placeholder="Örn. Mal henüz elimize ulaşmadı"
                        multiline
                      />
                      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                        <Button
                          kind="secondary"
                          label="Vazgeç"
                          disabled={!!busy}
                          onPress={() => {
                            setDisputeOpen(false);
                            setDisputeNote('');
                          }}
                          style={{ flex: 1 }}
                        />
                        <Button
                          kind="secondary"
                          label="İtirazı gönder"
                          loading={busy === 'dispute'}
                          disabled={!!busy}
                          onPress={() => void sendDispute()}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </View>
                  ) : (
                    <Button
                      kind="secondary"
                      fullWidth
                      label="İtiraz et"
                      disabled={!!busy}
                      onPress={() => setDisputeOpen(true)}
                    />
                  )}
                </View>
              </Section>
            ) : null}

            {/* --- İki taraf: teslim tamamlanmadan iptal işareti --- */}
            {deal.status !== 'teslim_edildi' && deal.status !== 'iptal' ? (
              cancelOpen ? (
                <Card>
                  <View style={{ gap: t.space[3] }}>
                    <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                      Karşı tarafa bildirilir ve kayıt kapanır. Değerlendirme açılmaz.
                    </Text>
                    <Input
                      label="Neden (isteğe bağlı)"
                      value={cancelReason}
                      onChangeText={(text) => setCancelReason(text.slice(0, 300))}
                      placeholder="Örn. Karşılıklı anlaşarak vazgeçtik"
                      multiline
                    />
                    <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                      <Button
                        kind="secondary"
                        label="Vazgeç"
                        disabled={!!busy}
                        onPress={() => {
                          setCancelOpen(false);
                          setCancelReason('');
                        }}
                        style={{ flex: 1 }}
                      />
                      <Button
                        kind="danger"
                        label="İptal olarak işaretle"
                        loading={busy === 'cancel'}
                        disabled={!!busy}
                        onPress={() => void cancel()}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                </Card>
              ) : (
                <Button
                  kind="secondary"
                  fullWidth
                  label="Siparişi iptal olarak işaretle"
                  disabled={!!busy}
                  onPress={() => setCancelOpen(true)}
                />
              )
            ) : null}

            {/* --- Değerlendirme --- */}
            {deal.status === 'teslim_edildi' ? (
              <ReviewSection deal={deal} busy={busy === 'review'} disabled={!!busy} onSubmit={sendReview} />
            ) : null}

            {bannerMessage ? <Notice tone="danger" icon="warning">{bannerMessage}</Notice> : null}
          </View>
        </ScrollView>
      </Screen>
    </View>
  );
}

// --- Zaman çizelgesi (numune takibindeki adım görünümünün aynısı) -----------

function TimelineStep({ step, isLast, nextDone }: { step: DealStep; isLast: boolean; nextDone: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: t.space[3] }}
      accessible
      accessibilityLabel={`${step.label}, ${step.done ? 'tamamlandı' : 'bekleniyor'}`}
    >
      <View style={{ width: DOT_SIZE, alignItems: 'center' }}>
        <View
          style={{
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: t.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: step.done ? t.colors.brand : t.colors.surface1,
            borderWidth: step.done ? 0 : 2,
            borderColor: t.colors.lineStrong,
          }}
        >
          {step.done ? <Icon name="check" size={t.size.iconXs} colorValue={t.colors.onBrand} /> : null}
        </View>
        {!isLast ? (
          <View
            style={{
              flex: 1,
              width: 2,
              marginVertical: t.space[1] / 2,
              backgroundColor: step.done && nextDone ? t.colors.brand : t.colors.lineStrong,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1], paddingBottom: isLast ? 0 : t.space[5] }}>
        <Text style={[t.type.body16Strong, { color: step.done ? t.colors.ink : t.colors.ink2 }]}>{step.label}</Text>
        {step.occurredAt ? (
          <Text style={[t.type.mono14, { color: t.colors.ink2 }]}>{formatDateTime(step.occurredAt)}</Text>
        ) : !step.done ? (
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Bekleniyor</Text>
        ) : null}
        {step.description ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{step.description}</Text> : null}
        {/* İtiraz: beyan silinmiyor, altına uyarı satırı olarak ekleniyor. */}
        {step.warning ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[1] }} accessibilityRole="alert">
            <Icon name="warning" size={t.size.iconXs} color="warning" />
            <Text style={[t.type.body14, { color: t.colors.warning, flex: 1, minWidth: 0 }]}>{step.warning}</Text>
          </View>
        ) : null}
        {step.hint ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{step.hint}</Text> : null}
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
  const t = useTheme();
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
    <View style={{ gap: t.space[6] }}>
      {deal.canReview ? (
        <Section title="İşi değerlendirin">
          <View style={{ gap: t.space[3] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
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
            <Input
              label="Yorum (isteğe bağlı)"
              value={comment}
              onChangeText={(text) => setComment(text.slice(0, 500))}
              placeholder="Örn. Kumaş numuneyle birebir aynıydı."
              multiline
              error={formError}
            />
            <Button
              size="lg"
              label="Değerlendirmeyi gönder"
              loading={busy}
              disabled={disabled}
              onPress={() => void submit()}
            />
          </View>
        </Section>
      ) : null}

      {deal.myReview ? <ReviewCard title="Sizin değerlendirmeniz" review={deal.myReview} /> : null}
      {deal.theirReview ? <ReviewCard title="Karşı tarafın değerlendirmesi" review={deal.theirReview} /> : null}

      {!deal.theirReview ? (
        <Notice tone="neutral" icon="clock">
          {deal.theirReviewPending
            ? 'Karşı taraf değerlendirmesini yazdı; siz de yazınca ikisi birlikte görünür olur.'
            : deal.myReview
              ? `Karşı taraf da yazınca ikisi birlikte görünür olur; yazmazsa teslim onayından ${DEAL_REVIEW_REVEAL_DAYS} gün sonra görünür olur.`
              : 'Karşı taraf henüz değerlendirmedi.'}
        </Notice>
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
  const t = useTheme();
  return (
    <View style={{ gap: t.space[1] }}>
      <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{criterion.label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] }}>
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
            style={({ pressed }) => [
              {
                minWidth: t.size.touchMin,
                minHeight: t.size.touchMin,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed ? { opacity: 0.6 } : null,
            ]}
          >
            <Icon
              name={n <= value ? 'star' : 'star-outline'}
              size={t.size.icon}
              colorValue={n <= value ? t.colors.accent : t.colors.lineStrong}
            />
          </Pressable>
        ))}
        <Text style={[t.type.mono14, { color: t.colors.ink2, marginLeft: t.space[1] }]}>{value ? `${value}/5` : ''}</Text>
      </View>
    </View>
  );
}

function ReviewCard({ title, review }: { title: string; review: DealReview }) {
  const t = useTheme();
  const rows = reviewCriteria(review.authorRole).map((criterion) => ({
    label: criterion.label,
    value: scoreOf(review, criterion.key),
  }));
  return (
    <Section title={title}>
      {rows.map((row, index) => (
        <SpecRow
          key={row.label}
          label={row.label}
          value={row.value != null ? `${row.value}/5` : ''}
          last={index === rows.length - 1}
        />
      ))}
      {review.comment ? (
        <Text style={[t.type.body14, { color: t.colors.ink, paddingTop: t.space[2] }]}>{review.comment}</Text>
      ) : null}
    </Section>
  );
}

function scoreOf(review: DealReview, key: DealCriterion['key']): number | null {
  if (key === 'quality') return review.quality;
  if (key === 'timing') return review.timing;
  if (key === 'seriousness') return review.seriousness;
  return review.communication;
}
