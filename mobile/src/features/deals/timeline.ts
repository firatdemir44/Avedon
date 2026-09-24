// Sipariş kaydının (Faz 3, Adım 4) ortak okumaları: durum zaman çizelgesi ve
// değerlendirme ölçütleri. Detay ekranı ve liste aynı metinleri üretsin diye
// tek yerde. Ödeme ve sevkiyat izleme YOK: her adım bir tarafın beyanıdır.
import type { DealView } from '../../api/client';
import { tr } from '../../i18n';

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
      label: tr('Sipariş oluştu'),
      description: tr('Teklif kabul edildi'),
      occurredAt: deal.createdAt,
      done: true,
    },
    {
      key: 'delivered',
      label: tr('Satıcı teslim ettiğini bildirdi'),
      // İtirazda beyan SİLİNMEZ: adım tarihiyle durur, itiraz altına uyarı
      // satırı olarak eklenir (adımın "yeniden bekliyor" görünmesi, satıcının
      // hiç beyanda bulunmadığı izlenimini veriyordu).
      warning: disputed ? deal.disputeNote ? tr('Alıcı itiraz etti: {note}', { note: deal.disputeNote }) : tr('Alıcı itiraz etti') : undefined,
      hint: disputed && deal.role === 'seller' ? tr('Yeniden teslim bildirebilirsiniz.') : undefined,
      occurredAt: deal.sellerDeliveredAt,
      done: !!deal.sellerDeliveredAt && !cancelled,
    },
    {
      key: 'confirmed',
      label: tr('Alıcı onayladı'),
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
      { key: 'quality', label: tr('Kalite numuneye uygun muydu?') },
      { key: 'timing', label: tr('Termin tuttu mu?') },
      { key: 'communication', label: tr('İletişim') },
    ];
  }
  return [
    { key: 'communication', label: tr('İletişim') },
    { key: 'seriousness', label: tr('İşin ciddiyeti') },
  ];
}
