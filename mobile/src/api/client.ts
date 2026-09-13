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

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Oturum token'ı SessionContext tarafından login/restore anında ayarlanır.
// Her istekte SecureStore'dan okumak yerine bellekte tutuyoruz — RootNavigator
// zaten SessionContext'in restore işlemi bitene kadar hiçbir ekranı render
// etmiyor, o yüzden bu değişken set edilmeden bir istek atılma riski yok.
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      signal: controller.signal,
      ...options,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('İstek zaman aşımına uğradı, lütfen tekrar deneyin.', 0);
    }
    throw new ApiError(err instanceof Error ? err.message : 'Ağ hatası', 0);
  } finally {
    clearTimeout(timeout);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body?.error ?? `İstek başarısız (${res.status})`, res.status, body?.error, body?.details);
  }
  return body as T;
}

export function fetchProducts(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return request<{ products: Product[] }>(`/products${query}`);
}

export function requestOtp(phone: string) {
  return request<{ ok: true }>('/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export type VerifyOtpResult =
  | { purpose: 'login'; token: string; user: User }
  | { purpose: 'register'; verificationToken: string };

export function verifyOtp(phone: string, code: string) {
  return request<VerifyOtpResult>('/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

export function fetchMe() {
  return request<{ user: User }>('/me');
}

export function registerUser(draft: RegistrationDraft) {
  return request<{ token: string; user: User }>('/register', {
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

export type UpdateProductInput = Partial<NewProductInput>;

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

export function createSampleRequest(payload: { productId: string; deliveryPreference: string }) {
  return request<{ sampleRequest: SampleRequestWithDetails }>('/sample-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchMySampleRequests() {
  return request<{ sampleRequests: SampleRequestWithDetails[] }>('/sample-requests?as=requester');
}

export function fetchIncomingSampleRequests() {
  return request<{ sampleRequests: SampleRequestWithDetails[] }>('/sample-requests?as=company');
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

export type CompanyWithCounts = Company & { _count: { users: number; products: number } };

export function fetchAdminCompanies() {
  return request<{ companies: CompanyWithCounts[] }>('/admin/companies');
}

export function updateCompanyVerification(companyId: string, verification: Company['verification']) {
  return request<{ company: Company }>(`/admin/companies/${companyId}/verification`, {
    method: 'PATCH',
    body: JSON.stringify({ verification }),
  });
}
