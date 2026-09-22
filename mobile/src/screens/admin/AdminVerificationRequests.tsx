// Yönetici tarafı: gelen doğrulama başvuruları ve karar (yeni tasarım, 4. adım).
//
// Veri katmanı DEĞİŞMEDİ: aynı uçlar, aynı süzgeç, aynı onay/ret akışı.
// Karar verilince belge sunucuda silinir, firmaya bildirim gider; firmaya
// yöneticinin kimliği GÖSTERİLMEZ (sunucu da döndürmüyor).
//
// Görünüm yeni: süzgeç `ui/SegmentControl`, başvurular `ui/Card`, karar
// durumu `ui/Badge`, not alanı `ui/Input`, eylemler `ui/Button`.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import {
  ApiError,
  decideVerificationRequest,
  fetchAdminVerificationDocument,
  fetchAdminVerificationRequests,
  type AdminVerificationRequest,
  type VerificationRequestStatus,
} from '../../api/client';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { isPdfDataUrl } from '../../components/passport/rows';
import { confirmAction } from '../../features/confirm';
import { openPdfDataUrl } from '../../features/docViewer';
import { haptics } from '../../features/haptics';
import { formatDateTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  Input,
  SegmentControl,
  SkeletonRow,
} from '../../ui';

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
  const t = useTheme();
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
    <View style={{ paddingHorizontal: t.space[4], paddingBottom: t.space[3] }}>
      <SegmentControl<VerificationRequestStatus>
        stretch
        accessibilityLabel="Başvuru süzgeci"
        value={filter}
        onChange={setFilter}
        options={FILTERS}
      />
    </View>
  );

  if (status === 'loading') {
    return (
      <View style={{ flex: 1 }}>
        {filterStrip}
        <View style={{ paddingHorizontal: t.space[4], gap: t.space[4] }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1 }}>
        {filterStrip}
        <EmptyState
          icon="warning"
          title="Başvurular alınamadı"
          description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
          actionLabel="Tekrar dene"
          onAction={reload}
        />
      </View>
    );
  }

  const requests = data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <ImageViewerModal imageUrl={photoUrl} visible={!!photoUrl} onClose={() => setPhotoUrl(null)} />
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: t.space[10], gap: t.space[4] }}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <>
            {filterStrip}
            {actionError ? (
              <View style={{ paddingHorizontal: t.space[4] }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space[2],
                    padding: t.space[3],
                    borderRadius: t.radius.md,
                    backgroundColor: t.colors.dangerSoft,
                    minWidth: 0,
                  }}
                >
                  <Icon name="warning" size={t.size.iconSm} color="danger" />
                  <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>
                    {actionError}
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="shield-checkmark-outline"
            title={filter === 'pending' ? 'Bekleyen başvuru yok' : 'Kayıt yok'}
            description={
              filter === 'pending'
                ? 'Firmalar doğrulama isteyince başvuruları burada görürsünüz.'
                : 'Bu süzgeçte kayıt yok.'
            }
          />
        }
        renderItem={({ item }) => {
          const expanded = openId === item.id;
          const busy = busyId === item.id;
          const applicant = item.user
            ? `${item.user.firstName} ${item.user.lastName}${item.user.position ? ` · ${item.user.position}` : ''}`
            : 'Başvuran bilinmiyor';
          return (
            <View style={{ paddingHorizontal: t.space[4], minWidth: 0 }}>
              <Card noPadding>
                {/* Kart başlığı: tamamı açılıp kapanan bir düğme. Karar
                    düğmeleri bunun İÇİNDE değil, altındaki bölümde. */}
                <Pressable
                  onPress={() => openRow(item)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${item.company?.name ?? 'Firma'} doğrulama başvurusu`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space[3],
                    padding: t.space[4],
                    minHeight: t.size.touchMin,
                    borderRadius: t.radius.lg,
                    backgroundColor: pressed ? t.colors.surface2 : 'transparent',
                    minWidth: 0,
                  })}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
                      <Text
                        numberOfLines={2}
                        style={[t.type.body16Strong, { color: t.colors.ink, flex: 1, minWidth: 0 }]}
                      >
                        {item.company?.name ?? 'Firma bulunamadı'}
                      </Text>
                      {item.status !== 'pending' ? (
                        <Badge
                          kind={item.status === 'approved' ? 'verified' : 'cancelled'}
                          label={item.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                        />
                      ) : (
                        <Badge kind="pending" label="Bekliyor" />
                      )}
                    </View>
                    <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2 }]}>
                      Vergi No: {item.company?.taxId ?? '—'}
                    </Text>
                    <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2 }]}>
                      {applicant}
                    </Text>
                    <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2 }]}>
                      {formatDateTime(item.createdAt)}
                    </Text>
                    {item.note ? (
                      <Text style={[t.type.body14, { color: t.colors.ink }]}>“{item.note}”</Text>
                    ) : null}
                    {item.status !== 'pending' ? (
                      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                        {item.decidedAt ? formatDateTime(item.decidedAt) : ''}
                        {item.adminNote ? `${item.decidedAt ? ' · ' : ''}${item.adminNote}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Icon name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} color="ink3" />
                </Pressable>

                {expanded ? (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: t.colors.line,
                      padding: t.space[4],
                      gap: t.space[4],
                      minWidth: 0,
                    }}
                  >
                    <Button
                      kind="secondary"
                      fullWidth
                      icon="document-text-outline"
                      label="Belgeyi aç"
                      loading={busy}
                      disabled={busy}
                      onPress={() => openDocument(item.id)}
                    />
                    {item.status === 'pending' ? (
                      <>
                        <View style={{ gap: t.space[2], minWidth: 0 }}>
                          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Doğrulama düzeyi</Text>
                          <ChipRow>
                            {LEVELS.map((option) => (
                              <Chip
                                key={option.value}
                                label={option.label}
                                selected={level === option.value}
                                disabled={busy}
                                onPress={() => setLevel(option.value)}
                              />
                            ))}
                          </ChipRow>
                        </View>

                        <Input
                          label="Not (firmaya gösterilir)"
                          value={note}
                          onChangeText={(value) => setNote(value.slice(0, NOTE_LIMIT))}
                          placeholder="Redde gerekçe ya da kısa açıklama"
                          multiline
                          maxLength={NOTE_LIMIT}
                          editable={!busy}
                          accessibilityLabel="Karar notu"
                        />

                        {/* Onay/ret çifti: onay dolu, ret kenarlıklı tehlikeli. */}
                        <View style={{ gap: t.space[2], minWidth: 0 }}>
                          <Button
                            fullWidth
                            icon="check"
                            label="Onayla"
                            disabled={busy}
                            onPress={() => decide(item, 'approve')}
                          />
                          <Button
                            kind="danger"
                            fullWidth
                            icon="x"
                            label="Reddet"
                            disabled={busy}
                            onPress={() => decide(item, 'reject')}
                          />
                        </View>
                      </>
                    ) : (
                      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                        Karar verildiği için belge silinmiştir; yeniden başvuru gerekir.
                      </Text>
                    )}
                  </View>
                ) : null}
              </Card>
            </View>
          );
        }}
      />
    </View>
  );
}
