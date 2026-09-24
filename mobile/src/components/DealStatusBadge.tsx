import React from 'react';
import { tr } from '../i18n';
import type { DealStatus } from '../api/client';
import { Badge, type BadgeKind } from '../ui';

// Sipariş kaydının durum rozeti (Faz 3, Adım 4). İçi ui/Badge; metin sunucudan
// gelmediği için eşleme burada. Durum yalnız renkle verilmez: ikon + metin.
const TONES: Record<DealStatus, { label: string; kind: BadgeKind }> = {
  acik: { label: 'Açık', kind: 'new' },
  teslim_bildirildi: { label: 'Teslim bildirildi', kind: 'pending' },
  teslim_edildi: { label: 'Teslim edildi', kind: 'delivered' },
  itiraz: { label: 'İtiraz var', kind: 'cancelled' },
  iptal: { label: 'İptal', kind: 'cancelled' },
};

export function dealStatusLabel(status: DealStatus): string {
  return tr((TONES[status] ?? TONES.acik).label);
}

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const tone = TONES[status] ?? TONES.acik;
  return <Badge kind={tone.kind} label={tr(tone.label)} />;
}
