import { Platform } from 'react-native';
import type { Company, Product, SampleRequest, User } from '../types';
import type { RegistrationDraft } from '../context/RegistrationContext';

// Production build'de gerçek backend adresini EXPO_PUBLIC_API_URL ortam
// değişkeniyle verin (örn. "https://api.avedon.com/api") — aksi halde web'de
// ziyaretçinin kendi localhost'una istek atmaya çalışır ve çalışmaz.
// Android emülatöründe localhost host makineyi göstermez, 10.0.2.2 kullanılır.
// Web ve iOS simülatöründe geliştirme sırasında localhost doğrudan çalışır.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  Platform.select({
    android: 'http://10.0.2.2:4000/api',
    default: 'http://localhost:4000/api',
  });

const REQUEST_TIMEOUT_MS = 30000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('İstek zaman aşımına uğradı, lütfen tekrar deneyin.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `İstek başarısız (${res.status})`);
  }
  return body as T;
}

export function fetchProducts(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return request<{ products: Product[] }>(`/products${query}`);
}

export function registerUser(draft: RegistrationDraft) {
  return request<{ user: User }>('/register', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export function fetchCompany(id: string) {
  return request<{ company: Company & { products: Product[] } }>(`/companies/${id}`);
}

export function searchCompanies(search: string) {
  return request<{ companies: Company[] }>(`/companies?search=${encodeURIComponent(search)}`);
}

export interface NewProductInput {
  companyId: string;
  code: string;
  type: Product['type'];
  stock: number;
  weightGsm: number;
  widthCm: number;
  content: string;
  useArea: string;
  imageUrl?: string;
}

export function createProduct(payload: NewProductInput) {
  return request<{ product: Product }>('/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchProduct(id: string) {
  return request<{ product: Product }>(`/products/${id}`);
}

export type UpdateProductInput = Partial<Omit<NewProductInput, 'companyId'>>;

export function updateProduct(id: string, payload: UpdateProductInput) {
  return request<{ product: Product }>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(id: string) {
  return request<void>(`/products/${id}`, { method: 'DELETE' });
}

export interface AdvisorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function askAdvisor(question: string, history: AdvisorMessage[]) {
  return request<{ answer: string }>('/advisor/ask', {
    method: 'POST',
    body: JSON.stringify({ question, history }),
  });
}

export type SampleRequestWithDetails = SampleRequest & {
  product: Product;
  requester: User;
};

export function createSampleRequest(payload: {
  productId: string;
  requesterId: string;
  deliveryPreference: string;
}) {
  return request<{ sampleRequest: SampleRequestWithDetails }>('/sample-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchMySampleRequests(requesterId: string) {
  return request<{ sampleRequests: SampleRequestWithDetails[] }>(
    `/sample-requests?requesterId=${encodeURIComponent(requesterId)}`
  );
}

export function fetchIncomingSampleRequests(companyId: string) {
  return request<{ sampleRequests: SampleRequestWithDetails[] }>(
    `/sample-requests?companyId=${encodeURIComponent(companyId)}`
  );
}

export function updateSampleRequestStatus(id: string, status: SampleRequest['status']) {
  return request<{ sampleRequest: SampleRequestWithDetails }>(`/sample-requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export interface DetectedComponent {
  component: string;
  detail: string;
}

export interface GarmentImageInput {
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export function detectGarmentComponents(images: GarmentImageInput[]) {
  return request<{ components: DetectedComponent[] }>('/garment-analysis/detect', {
    method: 'POST',
    body: JSON.stringify({ images }),
  });
}

export function loginUser(phone: string) {
  return request<{ user: User }>('/login', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export type CompanyWithCounts = Company & { _count: { users: number; products: number } };

export function fetchAdminCompanies(adminUserId: string) {
  return request<{ companies: CompanyWithCounts[] }>(
    `/admin/companies?adminUserId=${encodeURIComponent(adminUserId)}`
  );
}

export function updateCompanyVerification(
  adminUserId: string,
  companyId: string,
  verification: Company['verification']
) {
  return request<{ company: Company }>(`/admin/companies/${companyId}/verification`, {
    method: 'PATCH',
    body: JSON.stringify({ adminUserId, verification }),
  });
}
