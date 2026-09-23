// Akış şikâyetleri (yönetici, 2026-09-23). "Admin" ekranının "Şikâyetler"
// sekmesi. Şikâyet alan gönderiler (firma, metin, sayı, nedenler, notlar,
// gizli mi) + herkese açık paylaşımı kısıtlanmış firmalar.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import {
  adminHidePost,
  adminRestorePost,
  adminUnblockCompanyPublic,
  fetchAdminFeedReports,
  POST_REPORT_REASONS,
  type AdminBlockedCompany,
  type AdminReportedPost,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import { Badge, Button, Card, EmptyState, Icon, SectionTitle, SkeletonRow } from '../../ui';

const EXCERPT_MAX = 240;

function reasonLabel(key: string) {
  return POST_REPORT_REASONS.find((r) => r.key === key)?.label ?? key;
}

function formatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

type Row = { type: 'post'; post: AdminReportedPost } | { type: 'company'; company: AdminBlockedCompany } | { type: 'title'; title: string; key: string };

export function AdminFeedReports() {
  const t = useTheme();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() => fetchAdminFeedReports());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, fallback: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setActionError(friendlyMessage(err, fallback));
    } finally {
      setBusyId(null);
    }
  };

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, paddingHorizontal: t.space[4], gap: t.space[4] }}>
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }
  if (status === 'error') {
    return (
      <EmptyState
        icon="warning"
        title="Şikâyetler alınamadı"
        description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
        actionLabel="Tekrar dene"
        onAction={reload}
      />
    );
  }

  const posts = data?.posts ?? [];
  const blocked = data?.blockedCompanies ?? [];
  const rows: Row[] = [];
  if (blocked.length) {
    rows.push({ type: 'title', title: 'Kısıtlı firmalar', key: 't-blocked' });
    blocked.forEach((company) => rows.push({ type: 'company', company }));
  }
  if (posts.length) {
    rows.push({ type: 'title', title: 'Şikâyet edilen gönderiler', key: 't-posts' });
    posts.forEach((post) => rows.push({ type: 'post', post }));
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => (r.type === 'title' ? r.key : r.type === 'post' ? `p-${r.post.id}` : `c-${r.company.id}`)}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: t.space[10], gap: t.space[4] }}
      refreshControl={refreshControl(refreshing, refresh)}
      ListHeaderComponent={
        actionError ? (
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
            <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{actionError}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState icon="checkmark-circle-outline" title="Şikâyet yok" description="Akışta incelenecek bir şikâyet bulunmuyor." />
      }
      renderItem={({ item }) => {
        if (item.type === 'title') return <SectionTitle title={item.title} />;
        if (item.type === 'company') {
          const c = item.company;
          return (
            <Card>
              <View style={{ gap: t.space[3] }}>
                <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{c.name}</Text>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                  Herkese açık paylaşım kapalı{c.publicPostBlockedUntil ? ` · ${formatDate(c.publicPostBlockedUntil)} tarihine kadar` : ''}
                </Text>
                <Button
                  kind="secondary"
                  label="Kısıtı kaldır"
                  loading={busyId === c.id}
                  disabled={!!busyId}
                  onPress={async () => {
                    const ok = await confirmAction({
                      title: 'Kısıtı kaldır',
                      message: `${c.name} yeniden herkese açık paylaşım yapabilecek.`,
                      confirmLabel: 'Kaldır',
                    });
                    if (ok) run(c.id, () => adminUnblockCompanyPublic(c.id), 'Kısıt kaldırılamadı');
                  }}
                />
              </View>
            </Card>
          );
        }
        const p = item.post;
        const companyName = p.author?.company?.name ?? (p.author ? `${p.author.firstName} ${p.author.lastName}` : 'Bilinmeyen');
        const excerpt = p.body.length > EXCERPT_MAX ? `${p.body.slice(0, EXCERPT_MAX)}…` : p.body;
        const hidden = !!p.hiddenAt;
        return (
          <Card>
            <View style={{ gap: t.space[3], minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
                <Text numberOfLines={1} style={[t.type.body16Strong, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
                  {companyName}
                </Text>
                {hidden ? <Badge kind="cancelled" label="Gizli" /> : <Badge kind="verified" label="Yayında" />}
              </View>
              {p.author ? (
                <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
                  {p.author.firstName} {p.author.lastName} · {formatRelativeTime(p.createdAt)}
                  {p.visibility === 'connections' ? ' · Bağlantılarım' : ' · Herkese açık'}
                </Text>
              ) : null}
              {excerpt ? <Text style={[t.type.body14, { color: t.colors.ink }]}>{excerpt}</Text> : null}
              <View style={{ gap: t.space[1] }}>
                <Text style={[t.type.label14, { color: t.colors.danger }]}>
                  {p.reportCount} şikâyet{p.lastReportAt ? ` · son: ${formatRelativeTime(p.lastReportAt)}` : ''}
                </Text>
                {p.reasons.length ? (
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Nedenler: {p.reasons.map(reasonLabel).join(', ')}</Text>
                ) : null}
                {p.notes.map((n, i) => (
                  <Text key={i} style={[t.type.body14, { color: t.colors.ink2 }]}>“{n}”</Text>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Button
                  style={{ flex: 1 }}
                  kind="secondary"
                  label="Yayında kalsın"
                  disabled={!!busyId}
                  loading={busyId === p.id + ':r'}
                  onPress={() => run(p.id + ':r', () => adminRestorePost(p.id), 'Gönderi yayına alınamadı')}
                />
                <Button
                  style={{ flex: 1 }}
                  kind="danger"
                  label="Gizli kalsın"
                  disabled={!!busyId}
                  loading={busyId === p.id + ':h'}
                  onPress={() => run(p.id + ':h', () => adminHidePost(p.id), 'Gönderi gizlenemedi')}
                />
              </View>
            </View>
          </Card>
        );
      }}
    />
  );
}
