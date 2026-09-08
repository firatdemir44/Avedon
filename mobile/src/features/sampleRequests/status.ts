import type { SampleRequestStatus } from '../../types';

export const STATUS_ORDER: SampleRequestStatus[] = [
  'talep_edildi',
  'onaylandi',
  'hazirlandi',
  'teslim_edildi',
];

export const STATUS_LABELS: Record<SampleRequestStatus, string> = {
  talep_edildi: 'Talep Edildi',
  onaylandi: 'Onaylandı',
  hazirlandi: 'Hazırlandı',
  teslim_edildi: 'Teslim Edildi',
};

export function nextStatus(status: SampleRequestStatus): SampleRequestStatus | null {
  const index = STATUS_ORDER.indexOf(status);
  return index >= 0 && index < STATUS_ORDER.length - 1 ? STATUS_ORDER[index + 1] : null;
}
