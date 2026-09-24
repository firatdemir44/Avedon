import React from 'react';
import type { QuoteRequestStatus } from '../api/client';
import { Badge, type BadgeKind } from '../ui';
import { tr } from '../i18n';

// Teklif isteğinin durum rozeti (Faz 2, Adım 2). İçi ui/Badge; metin sunucudan
// gelmediği için eşleme burada.
const TONES: Record<QuoteRequestStatus, { label: string; kind: BadgeKind }> = {
  open: { label: 'Teklif bekleniyor', kind: 'pending' },
  quoted: { label: 'Teklif verildi', kind: 'info' },
  accepted: { label: 'Kabul edildi', kind: 'delivered' },
  declined: { label: 'Reddedildi', kind: 'cancelled' },
  cancelled: { label: 'Geri çekildi', kind: 'cancelled' },
};

export function quoteStatusLabel(status: QuoteRequestStatus): string {
  return tr((TONES[status] ?? TONES.open).label);
}

export function QuoteStatusBadge({ status }: { status: QuoteRequestStatus }) {
  const tone = TONES[status] ?? TONES.open;
  return <Badge kind={tone.kind} label={tr(tone.label)} />;
}
