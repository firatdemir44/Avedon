import { Platform } from 'react-native';
import type {
  Company,
  DeliveryMode,
  Product,
  ProductType,
  SampleRequestStatus,
  User,
  VerificationStatus,
} from '../types';
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

export type CompanyEmployee = Pick<User, 'id' | 'firstName' | 'lastName' | 'position'>;

export function fetchCompany(id: string) {
  return request<{ company: Company & { products: Product[]; users: CompanyEmployee[] } }>(`/companies/${id}`);
}

export type PublicUserProfile = Pick<User, 'id' | 'firstName' | 'lastName' | 'position' | 'accountType'> & {
  phone?: string;
  company: Pick<Company, 'id' | 'name' | 'verification'> | null;
};

export function fetchUserProfile(id: string) {
  return request<{ user: PublicUserProfile }>(`/users/${id}`);
}

export type ConnectionStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';
export interface ConnectionStatusResult {
  status: ConnectionStatus;
  connectionId?: string;
}

export function fetchConnectionStatus(userId: string) {
  return request<ConnectionStatusResult>(`/connections/status/${userId}`);
}

export function sendConnectionRequest(addresseeId: string) {
  return request<{ connection: { id: string; status: string } }>('/connections', {
    method: 'POST',
    body: JSON.stringify({ addresseeId }),
  });
}

export function respondToConnectionRequest(id: string, status: 'accepted' | 'rejected') {
  return request<{ ok?: true; connection?: unknown }>(`/connections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export type ConnectionSummary = { connectionId: string; user: User };

export function fetchConnections() {
  return request<{ connections: ConnectionSummary[] }>('/connections?status=accepted');
}

export type IncomingConnectionRequest = { id: string; requester: User; createdAt: string };

export function fetchIncomingConnectionRequests() {
  return request<{ requests: IncomingConnectionRequest[] }>('/connections?status=pending');
}

// Mesajlaşma. Tarih alanları ISO string olarak geliyor (Express, Prisma Date'ini
// JSON'a serialize ederken ISO'ya çeviriyor).
export type ConversationParticipant = {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  company: { id: string; name: string } | null;
};

export type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  readAt: string | null;
};

export type ConversationSummary = {
  id: string;
  user: ConversationParticipant;
  lastMessage: { id: string; body: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
  lastMessageAt: string;
};

export function fetchConversations() {
  return request<{ conversations: ConversationSummary[] }>('/conversations');
}

export function fetchUnreadMessageCount() {
  return request<{ count: number }>('/conversations/unread-count');
}

export function startConversation(userId: string) {
  return request<{ conversation: ConversationSummary }>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function fetchMessages(conversationId: string, since?: string) {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request<{ messages: ChatMessage[] }>(`/conversations/${conversationId}/messages${query}`);
}

export function sendMessage(conversationId: string, body: string) {
  return request<{ message: ChatMessage }>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function markConversationRead(conversationId: string) {
  return request<{ ok: true; updated: number }>(`/conversations/${conversationId}/read`, {
    method: 'PATCH',
  });
}

// İçerik akışı. Liste yanıtları fotoğraf İÇERMEZ (hasImage:true der), fotoğraf
// kart görünür olunca fetchPostImage ile tek tek çekilir — bir sayfa onlarca
// base64 fotoğrafla megabaytlara çıkıyordu.
export type PostVisibility = 'public' | 'connections';

export type PostAuthor = {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  company: { id: string; name: string; verification: VerificationStatus } | null;
};

// Video dosyası Cloudflare Stream'de durur; burada yalnızca durumu var. İzleme
// adresi yetki kontrolünden sonra fetchVideoPlayback ile, süreli anahtarla alınır.
export type VideoStatus = 'uploading' | 'processing' | 'ready' | 'error';

export interface VideoRef {
  id: string;
  status: VideoStatus;
  durationSeconds: number | null;
  errorReason: string;
}

export function requestVideoUploadUrl() {
  return request<{ video: VideoRef; uploadURL: string; maxDurationSeconds: number }>('/videos/upload-url', {
    method: 'POST',
  });
}

export function fetchVideo(id: string) {
  return request<{ video: VideoRef }>(`/videos/${id}`);
}

export function fetchVideoPlayback(id: string) {
  return request<{ hlsUrl: string; thumbnailUrl: string }>(`/videos/${id}/playback`);
}

export function deleteVideo(id: string) {
  return request<void>(`/videos/${id}`, { method: 'DELETE' });
}

export type FeedPost = {
  id: string;
  body: string;
  hasImage: boolean;
  imageUrl: string | null;
  video: VideoRef | null;
  visibility: PostVisibility;
  createdAt: string;
  author: PostAuthor;
  product: { id: string; code: string } | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

export type FeedPostComment = {
  id: string;
  body: string;
  createdAt: string;
  author: PostAuthor;
};

export type FeedCursor = { before: string; beforeId: string };

export function fetchFeed(cursor?: FeedCursor | null, limit = 10) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set('before', cursor.before);
    params.set('beforeId', cursor.beforeId);
  }
  return request<{ posts: FeedPost[]; nextCursor: FeedCursor | null }>(`/posts?${params.toString()}`);
}

export interface NewPostInput {
  body?: string;
  imageUrl?: string;
  videoId?: string;
  productId?: string;
  visibility: PostVisibility;
}

export function createPost(input: NewPostInput) {
  return request<{ post: FeedPost }>('/posts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deletePost(id: string) {
  return request<void>(`/posts/${id}`, { method: 'DELETE' });
}

export function fetchPostImage(id: string) {
  return request<{ imageUrl: string }>(`/posts/${id}/image`);
}

export function likePost(id: string) {
  return request<{ liked: boolean; likeCount: number }>(`/posts/${id}/like`, { method: 'POST' });
}

export function unlikePost(id: string) {
  return request<{ liked: boolean; likeCount: number }>(`/posts/${id}/like`, { method: 'DELETE' });
}

export function fetchPostComments(postId: string) {
  return request<{ comments: FeedPostComment[] }>(`/posts/${postId}/comments`);
}

export function createPostComment(postId: string, body: string) {
  return request<{ comment: FeedPostComment }>(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function deletePostComment(postId: string, commentId: string) {
  return request<void>(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
}

export type MyProductOption = { id: string; code: string; type: ProductType };

export function fetchMyProducts() {
  return request<{ products: MyProductOption[] }>('/products/mine');
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

// Detay yanıtı listeye göre bir alan fazla taşıyor: firmanın toplam ürün sayısı
// (tasarımdaki "Toplam N Ürün" rozeti).
export type ProductDetail = Product & { companyProductCount: number };

export function fetchProduct(id: string) {
  return request<{ product: ProductDetail }>(`/products/${id}`);
}

export function fetchProductImage(id: string) {
  return request<{ imageUrl: string }>(`/products/${id}/image`);
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

// Numune talebi yanıtları, User/Product'ın tamamını DEĞİL sunucunun açıkça
// seçtiği alanları taşır (telefon numarası ve base64 ürün fotoğrafı sızmasın
// diye). Bu yüzden ayrı, dar tipler tanımlı.
export interface SampleActor {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  company: { id: string; name: string } | null;
}

export interface SampleProductRef {
  id: string;
  code: string;
  companyId: string;
  company: { id: string; name: string };
}

export interface SampleNextStep {
  status: SampleRequestStatus;
  label: string;
}

export interface SampleRequestRow {
  id: string;
  status: SampleRequestStatus;
  statusLabel: string;
  deliveryMode: DeliveryMode;
  deliveryModeLabel: string;
  note: string;
  createdAt: string;
  product: SampleProductRef;
  requester: SampleActor;
  // Bu kullanıcının bu talebi bir adım ilerletme yetkisi varsa dolu gelir;
  // yetki kararı sunucuda, istemci sadece düğmeyi gösterir/gizler.
  nextStep: SampleNextStep | null;
  canAdvance: boolean;
}

export interface SampleTimelineStep {
  status: SampleRequestStatus;
  label: string;
  state: 'done' | 'pending';
  occurredAt: string | null;
  actor: SampleActor | null;
  note: string;
  description: string;
}

export interface SampleRequestTimeline {
  sampleRequest: Omit<SampleRequestRow, 'nextStep' | 'canAdvance'>;
  steps: SampleTimelineStep[];
  nextStep: SampleNextStep | null;
  canAdvance: boolean;
}

export function createSampleRequest(payload: {
  productId: string;
  deliveryMode: DeliveryMode;
  note?: string;
}) {
  return request<{ sampleRequest: SampleRequestRow }>('/sample-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchMySampleRequests() {
  return request<{ sampleRequests: SampleRequestRow[] }>('/sample-requests?as=requester');
}

export function fetchIncomingSampleRequests() {
  return request<{ sampleRequests: SampleRequestRow[] }>('/sample-requests?as=company');
}

export function fetchSampleRequestTimeline(id: string) {
  return request<SampleRequestTimeline>(`/sample-requests/${id}`);
}

export function updateSampleRequestStatus(id: string, status: SampleRequestStatus, note?: string) {
  return request<{ sampleRequest: SampleRequestRow }>(`/sample-requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(note ? { status, note } : { status }),
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
