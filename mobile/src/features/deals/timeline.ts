// Sipariş kaydının (Faz 3, Adım 4) ortak okumaları: durum zaman çizelgesi ve
// değerlendirme ölçütleri. Detay ekranı ve liste aynı metinleri üretsin diye
// tek yerde. Ödeme ve sevkiyat izleme YOK: her adım bir tarafın beyanıdır.
import type { DealView } from '../../api/client';

export interface DealStep {
  key: 'created' | 'delivered' | 'confirmed';
  label: string;
  description?: string;
  /** Uyarı renginde gösterilen satır (itiraz notu). */
  warning?: string;
  /** Uyarının altındaki nötr ipucu (yalnızca ilgili tarafa). */
  hint?: string;
  occurredAt: string | null;
  done: boolean;
}

export function dealTimeline(deal: DealView): DealStep[] {
  const cancelled = deal.status === 'iptal';
  const disputed = deal.status === 'itiraz';
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
      // İtirazda beyan SİLİNMEZ: adım tarihiyle durur, itiraz altına uyarı
      // satırı olarak eklenir (adımın "yeniden bekliyor" görünmesi, satıcının
      // hiç beyanda bulunmadığı izlenimini veriyordu).
      warning: disputed ? `Alıcı itiraz etti${deal.disputeNote ? `: ${deal.disputeNote}` : ''}` : undefined,
      hint: disputed && deal.role === 'seller' ? 'Yeniden teslim bildirebilirsiniz.' : undefined,
      occurredAt: deal.sellerDeliveredAt,
      done: !!deal.sellerDeliveredAt && !cancelled,
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
