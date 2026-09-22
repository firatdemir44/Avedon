import React from 'react';
import type { SampleRequestStatus } from '../types';
import { Badge, type BadgeKind } from '../ui';

// Numune talebinin durum rozeti; takip ekranı, Taleplerim ve Gelen Talepler
// ortak kullanır. İçi ui/Badge (DESIGN.md §3): ikon + BÜYÜK HARF metin.
//   talep edildi → new · onaylandı / hazırlandı → pending (süreç sürüyor)
//   teslim edildi → delivered
// Metin sunucudan gelir: son adımın adı teslimat moduna göre değişiyor
// ("Teslim Edildi" / "Kurye Teslim Aldı"), istemcide ikinci eşleme tutulmuyor.
const KINDS: Record<SampleRequestStatus, BadgeKind> = {
  talep_edildi: 'new',
  onaylandi: 'pending',
  hazirlandi: 'pending',
  teslim_edildi: 'delivered',
};

export function SampleStatusBadge({ status, label }: { status: SampleRequestStatus; label: string }) {
  return <Badge kind={KINDS[status] ?? 'new'} label={label} />;
}
