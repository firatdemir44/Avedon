import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ApiError,
  decideVerificationRequest,
  fetchAdminVerificationDocument,
  fetchAdminVerificationRequests,
  type AdminVerificationRequest,
  type VerificationRequestStatus,
} from '../../api/client';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { isPdfDataUrl } from '../../components/passport/rows';
import { confirmAction } from '../../features/confirm';
import { openPdfDataUrl } from '../../features/docViewer';
import { haptics } from '../../features/haptics';
import { formatDateTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

// Yönetici tarafı: gelen doğrulama başvuruları ve karar. Karar verilince belge
// sunucuda silinir, firmaya bildirim gider; firmaya yöneticinin kimliği
// GÖSTERİLMEZ (sunucu da döndürmüyor).

const FILTERS: { value: VerificationRequestStatus; label: string }[] = [
  { value: 'pending', label: 'Bekleyen' },
  { value: 'approved', label: 'Onaylanan' },
  { value: 'rejected', label: 'Reddedilen' },
];

const LEVELS: { value: 'belge' | 'ziyaret'; label: string }[] = [
  { value: 'belge', label: 'Belge ile' },
  { value: 'ziyaret', label: 'Yerinde ziyaret' },
];

const NOTE_LIMIT = 300;

export function AdminVerificationRequests({
  onPendingCount,
}: {
  onPendingCount?: (count: number) => void;
}) {
  const [filter, setFilter] = useState<VerificationRequestStatus>('pending');
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchAdminVerificationRequests(filter).then(({ requests }) => requests),
    // Süzgeç değişince fetcher da değişir; useFocusLoad son isteği yazar.
    {}
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [level, setLevel] = useState<'belge' | 'ziyaret'>('belge');
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Süzgeç değişince listeyi tazele (ilk açılışta useFocusLoad zaten çekiyor,
  // aynı isteği iki kez atmayalım).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setOpenId(null);
    reload();
  }, [filter, reload]);

  useEffect(() => {
    if (filter === 'pending' && data) onPendingCount?.(data.length);
  }, [filter, data, onPendingCount]);

  const openRow = (item: AdminVerificationRequest) => {
    setActionError(null);
    if (openId === item.id) {
      setOpenId(null);
      return;
    }
    setOpenId(item.id);
    setLevel('belge');
    setNote('');
  };

  const openDocument = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      const { documentUrl } = await fetchAdminVerificationDocument(id);
      if (!documentUrl) {
        setActionError('Belge artık saklanmıyor (karar verilmiş başvuru).');
        return;
      }
      if (isPdfDataUrl(documentUrl)) await openPdfDataUrl(documentUrl, 'dogrulama-belgesi.pdf');
      else setPhotoUrl(documentUrl);
    } catch (err) {
      setActionError(friendlyMessage(err, 'Belge açılamadı'));
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (item: AdminVerificationRequest, decision: 'approve' | 'reject') => {
    const name = item.company?.name ?? 'Firma';
    const ok = await confirmAction({
      title: decision === 'approve' ? 'Doğrulamayı onayla' : 'Başvuruyu reddet',
      message:
        decision === 'approve'
          ? `${name} doğrulanmış olarak işaretlenecek (${level === 'belge' ? 'Belge ile' : 'Yerinde ziyaret'}).`
          : `${name} başvurusu reddedilecek. Notunuz firmaya gösterilir.`,
      confirmLabel: decision === 'approve' ? 'Onayla' : 'Reddet',
      destructive: decision === 'reject',
    });
    if (!ok) return;
    setBusyId(item.id);
    setActionError(null);
    try {
      await decideVerificationRequest(item.id, {
        decision,
        ...(decision === 'approve' ? { level } : {}),
        ...(note.trim() ? { adminNote: note.trim() } : {}),
      });
      haptics.success();
      setOpenId(null);
      setNote('');
      await reload();
    } catch (err) {
      haptics.error();
      setActionError(
        err instanceof ApiError && err.code === 'already_decided'
          ? 'Bu başvuruya zaten karar verilmiş.'
          : friendlyMessage(err, 'Karar kaydedilemedi')
      );
    } finally {
      setBusyId(null);
    }
  };

  const filterStrip = (
    <View style={styles.filterStrip}>
      {FILTERS.map((option) => {
        const selected = filter === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => setFilter(option.value)}
            style={[styles.chip, selected && styles.chipActive]}
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        {filterStrip}
        <SkeletonList variant="request" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        {filterStrip}
        <ErrorState error={error} fallback="Başvurular alınamadı" onRetry={reload} />
      </View>
    );
  }

  const requests = data ?? [];

  return (
    <View style={styles.screen}>
      <ImageViewerModal imageUrl={photoUrl} visible={!!photoUrl} onClose={() => setPhotoUrl(null)} />
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <>
            {filterStrip}
            {actionError ? <InlineError message={actionError} style={styles.banner} /> : null}
          </>
        }
        ListEmptyComponent={
          <EmptyState
            compact
            icon="shield-checkmark-outline"
            title={filter === 'pending' ? 'Bekleyen başvuru yok' : 'Kayıt yok'}
          />
        }
        renderItem={({ item }) => {
          const expanded = openId === item.id;
          const busy = busyId === item.id;
          const applicant = item.user
            ? `${item.user.firstName} ${item.user.lastName}${item.user.position ? ` · ${item.user.position}` : ''}`
            : 'Başvuran bilinmiyor';
          return (
            <View style={styles.card}>
              <Pressable
                onPress={() => openRow(item)}
                style={({ pressed }) => [styles.cardHead, pressed && styles.cardHeadPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${item.company?.name ?? 'Firma'} doğrulama başvurusu`}
              >
                <View style={styles.cardTexts}>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.company?.name ?? 'Firma bulunamadı'}
                  </Text>
                  <Text style={styles.meta}>Vergi No: {item.company?.taxId ?? '—'}</Text>
                  <Text style={styles.meta}>{applicant}</Text>
                  <Text style={styles.meta}>{formatDateTime(item.createdAt)}</Text>
                  {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
                  {item.status !== 'pending' ? (
                    <Text style={[styles.decision, item.status === 'approved' ? styles.ok : styles.no]}>
                      {item.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                      {item.decidedAt ? ` · ${formatDateTime(item.decidedAt)}` : ''}
                      {item.adminNote ? ` · ${item.adminNote}` : ''}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.chevron}
                />
              </Pressable>

              {expanded ? (
                <View style={styles.detail}>
                  <PrimaryButton
                    label={busy ? 'Açılıyor...' : 'Belgeyi aç'}
                    variant="outline"
                    icon="document-text-outline"
                    onPress={() => openDocument(item.id)}
                    disabled={busy}
                  />
                  {item.status === 'pending' ? (
                    <>
                      <Text style={styles.fieldLabel}>Doğrulama düzeyi</Text>
                      <View style={styles.filterStripInline}>
                        {LEVELS.map((option) => {
                          const selected = level === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              onPress={() => setLevel(option.value)}
                              style={[styles.chip, selected && styles.chipActive]}
                              accessibilityState={{ selected }}
                            >
                              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Text style={styles.fieldLabel}>Not (firmaya gösterilir)</Text>
                      <TextInput
                        style={styles.noteInput}
                        value={note}
                        onChangeText={(t) => setNote(t.slice(0, NOTE_LIMIT))}
                        placeholder="Redde gerekçe ya da kısa açıklama"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        maxLength={NOTE_LIMIT}
                        editable={!busy}
                        accessibilityLabel="Karar notu"
                      />
                      <View style={styles.actionRow}>
                        <PrimaryButton
                          label="Reddet"
                          variant="outline"
                          size="sm"
                          onPress={() => decide(item, 'reject')}
                          disabled={busy}
                          style={styles.actionButton}
                        />
                        <PrimaryButton
                          label="Onayla"
                          size="sm"
                          onPress={() => decide(item, 'approve')}
                          disabled={busy}
                          style={styles.actionButton}
                        />
                      </View>
                    </>
                  ) : (
                    <Text style={styles.meta}>
                      Karar verildiği için belge silinmiştir; yeniden başvuru gerekir.
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  banner: { marginHorizontal: spacing.gutter, marginBottom: spacing.sm },
  filterStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  filterStripInline: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTonal,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.label, color: colors.text },
  chipTextActive: { color: colors.primaryText },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.gutter,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    minHeight: MIN_TOUCH,
  },
  cardHeadPressed: { backgroundColor: colors.pressed },
  cardTexts: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.subtitle, fontFamily: fonts.semibold, color: colors.text },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  note: { ...typography.label, fontFamily: fonts.regular, color: colors.text, marginTop: 2 },
  decision: { ...typography.caption, marginTop: spacing.xs },
  ok: { color: colors.success },
  no: { color: colors.danger },
  detail: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    padding: spacing.md,
    gap: spacing.xs,
  },
  fieldLabel: { ...typography.label, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs },
  noteInput: {
    fontFamily: fonts.regular,
    fontSize: 16,
    minWidth: 0,
    minHeight: MIN_TOUCH + 16,
    color: colors.text,
    backgroundColor: colors.surfaceTonal,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    textAlignVertical: 'top',
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1, minWidth: 0 },
});
