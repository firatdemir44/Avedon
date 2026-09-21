// Sipariş kaydının (Faz 3, Adım 4) ortak okumaları: durum zaman çizelgesi ve
// değerlendirme ölçütleri. Detay ekranı ve liste aynı metinleri üretsin diye
// tek yerde. Ödeme ve sevkiyat izleme YOK: her adım bir tarafın beyanıdır.
import type { DealView } from '../../api/client';

export interface DealStep {
  key: 'created' | 'delivered' | 'confirmed';
  label: string;
  description?: string;
  occurredAt: string | null;
  done: boolean;
}

export function dealTimeline(deal: DealView): DealStep[] {
  const cancelled = deal.status === 'iptal';
  return [
    {
      key: 'created',
      label: 'Sipariş oluştu',
      description: 'Teklif kabul edildi',
      occurredAt: deal.createdAt,
      done: true,
    },
    {
      key: 'delivered',
      label: 'Satıcı teslim ettiğini bildirdi',
      // İtirazdan sonra beyan geçersiz sayılır: adım yine bekliyor görünür.
      description: deal.status === 'itiraz' ? 'Alıcı itiraz etti, beyan bekleniyor' : undefined,
      occurredAt: deal.status === 'itiraz' ? null : deal.sellerDeliveredAt,
      done: deal.status !== 'itiraz' && !!deal.sellerDeliveredAt && !cancelled,
    },
    {
      key: 'confirmed',
      label: 'Alıcı onayladı',
      occurredAt: deal.buyerConfirmedAt,
      done: !!deal.buyerConfirmedAt && !cancelled,
    },
  ];
}

export interface DealCriterion {
  key: 'quality' | 'timing' | 'communication' | 'seriousness';
  label: string;
}

// Alıcı satıcıyı üç ölçütle, satıcı alıcıyı iki ölçütle değerlendirir
// (sunucudaki buyerReviewSchema / sellerReviewSchema ile aynı alanlar).
export function reviewCriteria(role: 'buyer' | 'seller'): DealCriterion[] {
  if (role === 'buyer') {
    return [
      { key: 'quality', label: 'Kalite numuneye uygun muydu?' },
      { key: 'timing', label: 'Termin tuttu mu?' },
      { key: 'communication', label: 'İletişim' },
    ];
  }
  return [
    { key: 'communication', label: 'İletişim' },
    { key: 'seriousness', label: 'İşin ciddiyeti' },
  ];
}
