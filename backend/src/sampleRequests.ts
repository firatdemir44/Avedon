import { Prisma } from '@prisma/client';

export type DeliveryMode = 'seller_ships' | 'customer_courier';
export type SampleStatus = 'talep_edildi' | 'onaylandi' | 'hazirlandi' | 'teslim_edildi';

export const DELIVERY_MODES = ['seller_ships', 'customer_courier'] as const;
export const STATUS_ORDER = ['talep_edildi', 'onaylandi', 'hazirlandi', 'teslim_edildi'] as const;

export function stepIndex(status: string): number {
  return (STATUS_ORDER as readonly string[]).indexOf(status);
}

export function nextStatusFor(status: string): SampleStatus | null {
  const index = stepIndex(status);
  if (index < 0 || index >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[index + 1];
}

// Listedeki kısa rozet etiketi.
export function chipLabelFor(status: string, mode: string): string {
  switch (status) {
    case 'talep_edildi':
      return 'Talep Edildi';
    case 'onaylandi':
      return 'Onaylandı';
    case 'hazirlandi':
      return 'Hazırlandı';
    case 'teslim_edildi':
      return mode === 'customer_courier' ? 'Kurye Teslim Aldı' : 'Teslim Edildi';
    default:
      return status;
  }
}

// Zaman çizelgesindeki uzun adım başlığı.
export function stepLabelFor(status: string, mode: string): string {
  switch (status) {
    case 'talep_edildi':
      return 'Numune Talep Edildi';
    case 'onaylandi':
      return 'Numune Onaylandı';
    case 'hazirlandi':
      return 'Numune Hazırlandı';
    case 'teslim_edildi':
      return mode === 'customer_courier' ? 'Kurye Teslim Aldı' : 'Teslim Edildi';
    default:
      return status;
  }
}

// Tasarımdaki hazır açıklama metinleri — kullanıcıdan girdi beklemeden zaman
// çizelgesi anlamlı görünsün diye.
export function stepDescriptionFor(status: string, mode: string): string {
  const courier = mode === 'customer_courier';
  switch (status) {
    case 'onaylandi':
      return courier ? 'Numuneniz hazırlanıyor...' : 'Kumaşın hazırlıkları başladı.';
    case 'hazirlandi':
      return courier
        ? 'Üretici firma numuneyi hazırladı. Müşteri temsilcisinin numuneyi alması bekleniyor.'
        : 'Numune sevkiyata verildi.';
    default:
      return '';
  }
}

export function deliveryModeLabel(mode: string): string {
  return mode === 'customer_courier'
    ? 'Müşteri firma olarak kurye ile aldırılacak.'
    : 'Satıcı göndersin.';
}

export type ViewerRole = { isRequester: boolean; isSeller: boolean };

// Tasarımda son adımın aktörü müşteri tarafı (her iki teslimat senaryosunda da),
// ara adımlar üretici firmada. Son adımı satıcıya da açık bırakıyoruz, aksi halde
// müşteri hiç onaylamazsa talep sonsuza kadar "hazırlandı"da takılı kalır.
export function canPerform(target: string, role: ViewerRole): boolean {
  switch (target) {
    case 'onaylandi':
    case 'hazirlandi':
      return role.isSeller;
    case 'teslim_edildi':
      return role.isSeller || role.isRequester;
    default:
      return false;
  }
}

// Telefon numarası ve base64 ürün fotoğrafı yanıtlara sızmasın diye alanlar
// açıkça seçiliyor.
export const SAMPLE_ACTOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  company: { select: { id: true, name: true, logoUpdatedAt: true } },
} satisfies Prisma.UserSelect;

export const SAMPLE_PRODUCT_SELECT = {
  id: true,
  code: true,
  companyId: true,
  company: { select: { id: true, name: true, logoUpdatedAt: true } },
} satisfies Prisma.ProductSelect;

export const SAMPLE_LIST_INCLUDE = {
  product: { select: SAMPLE_PRODUCT_SELECT },
  requester: { select: SAMPLE_ACTOR_SELECT },
} satisfies Prisma.SampleRequestInclude;

type ListRowInput = {
  id: string;
  status: string;
  deliveryMode: string;
  note: string;
  createdAt: Date;
  product: unknown;
  requester: unknown;
};

export function toListRow(request: ListRowInput, role: ViewerRole) {
  const next = nextStatusFor(request.status);
  const canAdvance = !!next && canPerform(next, role);
  return {
    id: request.id,
    status: request.status,
    statusLabel: chipLabelFor(request.status, request.deliveryMode),
    deliveryMode: request.deliveryMode,
    deliveryModeLabel: deliveryModeLabel(request.deliveryMode),
    note: request.note,
    createdAt: request.createdAt,
    product: request.product,
    requester: request.requester,
    nextStep: canAdvance && next ? { status: next, label: stepLabelFor(next, request.deliveryMode) } : null,
    canAdvance,
  };
}

type EventInput = { status: string; note: string; createdAt: Date; actor: unknown };

export function toTimelineSteps(
  request: { status: string; deliveryMode: string },
  events: EventInput[]
) {
  const currentIndex = stepIndex(request.status);

  return STATUS_ORDER.map((status, index) => {
    const event = events.find((e) => e.status === status);
    return {
      status,
      label: stepLabelFor(status, request.deliveryMode),
      // Adımın tamamlanmış sayılması statüden türetilir, olay kaydının
      // varlığından değil — geçmişi eksik eski kayıtlarda çelişki olmasın.
      state: index <= currentIndex ? 'done' : 'pending',
      occurredAt: event?.createdAt ?? null,
      actor: event?.actor ?? null,
      note: event?.note ?? '',
      description: event?.note ? '' : stepDescriptionFor(status, request.deliveryMode),
    };
  });
}
