import { Platform } from 'react-native';
import type {
  Company,
  CompositionItem,
  DeliveryMode,
  Product,
  ProductType,
  SampleRequestStatus,
  User,
  VerificationStatus,
} from '../types';
import type { RegistrationDraft } from '../context/RegistrationContext';
import { productQueryString, type ProductFilters, type WatchQuery } from '../features/products/filters';
import type { StockUnit } from '../features/products/catalog';

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
// Model çağrısı içeren uçlar (etiket okuma): fotoğraf + PDF ile 30 sn yetmiyor.
const LLM_REQUEST_TIMEOUT_MS = 120000;

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  // Sunucunun hata gövdesinin tamamı. Bazı uçlar hata kodunun yanında ek alan
  // döndürüyor (örn. teklif isteğinde 403 + `suggestedUserId`); `code` ve
  // `details` bunları taşımıyor, çağıran buradan okur.
  body?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: unknown, body?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
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

async function request<T>(path: string, options?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
    throw new ApiError(
      body?.error ?? `İstek başarısız (${res.status})`,
      res.status,
      body?.error,
      body?.details,
      body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined
    );
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

export function fetchCompanyLogo(id: string) {
  return request<{ imageUrl: string }>(`/companies/${id}/logo`);
}

// logo: yeni logo için data URL, kaldırmak için null, dokunmamak için alan yok.
// Vergi numarası ve şirket kodu düzenlenemez.
// Firma galerisi: yeni fotoğraf (data URL) ya da mevcut fotoğrafın eski sırası.
export type CompanyPhotoInput = string | { existing: number };

export type CompanyPhotoKind = 'office' | 'certificate';

export function fetchCompanyPhoto(companyId: string, kind: CompanyPhotoKind, position: number) {
  return request<{ imageUrl: string }>(`/companies/${companyId}/photos/${kind}/${position}`);
}

export interface UpdateCompanyInput {
  name?: string;
  about?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyType?: string;
  // null: kuruluş yılını temizle
  foundedYear?: number | null;
  website?: string;
  city?: string;
  district?: string;
  address?: string;
  mainMarkets?: string;
  // Verilirse o galerinin tamamı bu liste olur; verilmezse dokunulmaz.
  officePhotos?: CompanyPhotoInput[];
  certificatePhotos?: CompanyPhotoInput[];
  logo?: string | null;
}

export function updateCompany(id: string, input: UpdateCompanyInput) {
  return request<{ company: Company; verificationReset: boolean }>(`/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type PublicUserProfile = Pick<User, 'id' | 'firstName' | 'lastName' | 'position' | 'accountType'> & {
  phone?: string;
  company: Pick<Company, 'id' | 'name' | 'verification' | 'logoUpdatedAt'> | null;
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
  company: { id: string; name: string; logoUpdatedAt: string | null } | null;
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
  company: { id: string; name: string; verification: VerificationStatus; logoUpdatedAt: string | null } | null;
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

// Akış kartındaki pasaport verisi (Faz 1, Adım 6).
export type FeedProduct = {
  id: string;
  code: string;
  companyId: string;
  type: string;
  subtype: string;
  weightGsm: number;
  widthCm: number;
  widthType: '' | 'acik' | 'tup';
  // Girilen enin anlamı; hesap eni için (bkz. glossaryLabels.effectiveWidthCm).
  widthMeaning?: string;
  stock: number;
  stockUnit: StockUnit;
  moq: number | null;
  moqUnit: string;
  leadTimeDays: number | null;
  composition: CompositionItem[];
  certificateNames: string[];
  hasImage: boolean;
  // Görüntüleyen kullanıcı takibe almış mı (ProductFavorite kaydı).
  isFavorite: boolean;
};

export type FeedPost = {
  id: string;
  body: string;
  hasImage: boolean;
  imageUrl: string | null;
  video: VideoRef | null;
  visibility: PostVisibility;
  createdAt: string;
  // Yazar metni, görünürlüğü ya da ürünü değiştirdiyse dolu.
  editedAt: string | null;
  author: PostAuthor;
  // Akış kartındaki kumaş pasaportu (backend POST_PRODUCT_SELECT). Fiyat YOK:
  // akış herkese açık, fiyat yalnızca ürün sayfasında sahibine geliyor.
  product: FeedProduct | null;
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

// scope 'connections': yalnızca bağlantılı kullanıcıların ve onların
// firmalarındaki kişilerin gönderileri (bağlantı yoksa boş liste).
export type FeedScope = 'all' | 'connections';

export function fetchFeed(cursor?: FeedCursor | null, limit = 10, scope: FeedScope = 'all') {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set('before', cursor.before);
    params.set('beforeId', cursor.beforeId);
  }
  if (scope !== 'all') params.set('scope', scope);
  return request<{ posts: FeedPost[]; nextCursor: FeedCursor | null }>(`/posts?${params.toString()}`);
}

// Firma sayfasındaki "Firma Akışı" sekmesi: o firmanın çalışanlarının
// gönderileri. Görünürlük kuralları akışla aynı (bağlantıya özel gönderiler
// yalnızca bağlantılara görünür).
export function fetchCompanyFeed(companyId: string, limit = 10) {
  const params = new URLSearchParams({ limit: String(limit), companyId });
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

export function fetchPost(id: string) {
  return request<{ post: FeedPost }>(`/posts/${id}`);
}

// Fotoğraf ve video düzenlenemez; productId: null ürünü gönderiden kaldırır.
export interface UpdatePostInput {
  body?: string;
  productId?: string | null;
  visibility?: PostVisibility;
}

export function updatePost(id: string, input: UpdatePostInput) {
  return request<{ post: FeedPost }>(`/posts/${id}`, {
    method: 'PATCH',
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

export type MyProductOption = { id: string; code: string; type: ProductType; subtype: string; hasImage: boolean };

// Gönderi ekranındaki ürün seçici: arama sunucuda yapılır, tek seferde en
// fazla `limit` ürün gelir (varsayılan 30). `total` firmanın eşleşen toplam
// ürün sayısı.
export function fetchMyProducts(search?: string, limit?: number) {
  const params: string[] = [];
  if (search?.trim()) params.push(`search=${encodeURIComponent(search.trim())}`);
  if (limit) params.push(`limit=${limit}`);
  const query = params.length ? `?${params.join("&")}` : "";
  return request<{ products: MyProductOption[]; total: number }>(`/products/mine${query}`);
}

export function searchCompanies(search: string) {
  return request<{ companies: Company[] }>(`/companies?search=${encodeURIComponent(search)}`);
}

// Arama + filtreler (features/products/filters.ts). Giriş yapılmışsa her ürün
// isFavorite taşır.
export function fetchProductList(search: string, filters: ProductFilters) {
  return request<{ products: Product[] }>(`/products${productQueryString(search, filters)}`);
}

// --- Kumaş pasaportu (Faz 1) ---
// Sunucu sözleşmesi: backend/src/passport.ts passportFieldsSchema.

// Belge fotoğrafı: yeni data URL · mevcut belgenin eski sırası · null (yok).
export type DocImageInput = string | { existing: number } | null;

export interface YarnInput {
  role?: string; // catalog.ts YARN_ROLES, boş olabilir
  count: number;
  unit: string; // catalog.ts YARN_UNITS
  ply?: number;
  yarnType?: string; // catalog.ts YARN_TYPES, boş olabilir
}

export interface CertificateInput {
  name: string; // glossaryLabels.ts CERTIFICATES
  number?: string;
  // ISO tarih ("2027-03-01") ya da null (geçerlilik yok).
  validUntil?: string | null;
  image?: DocImageInput;
}

export interface TestReportInput {
  kind: string;
  result?: string;
  testedAt?: string | null;
  image?: DocImageInput;
}

// Alanın nereden geldiğini kayıt isteğiyle birlikte bildirir (Adım 3):
// çıkarımdan gelip onay ekranında aktarılan alanlar için bir satır. Elle
// girilen (ya da aktarıldıktan sonra elle değiştirilen) alan için satır yok.
export interface FieldMetaInput {
  field: string;
  confidence: number;
  source: 'manual' | 'parsed_content' | 'extracted' | 'whatsapp';
  confirmed: boolean;
}

// Hepsi isteğe bağlı: gönderilmeyen alana sunucu dokunmaz.
export interface PassportInput {
  fieldMeta?: FieldMetaInput[];
  composition?: CompositionItem[];
  yarns?: YarnInput[];
  certificates?: CertificateInput[];
  testReports?: TestReportInput[];
  widthType?: string;
  // '' | 'acik' | 'tup_tek_yuz'; boş gönderilirse hesap eni girilen en olur.
  widthMeaning?: string;
  // null: temizle
  moq?: number | null;
  moqUnit?: string;
  leadTimeDays?: number | null;
  priceValue?: number | null;
  priceCurrency?: string;
  priceUnit?: string;
  finishTags?: string[];
}

// Makullük uyarıları: kaydı ENGELLEMEZ, ekranda gösterilir. notes Türkçe.
export interface ProductWarnings {
  codes: string[];
  notes: string[];
}

export interface NewProductInput extends PassportInput {
  code: string;
  type: Product['type'];
  subtype: string;
  usages: string[];
  stock: number;
  stockUnit: StockUnit;
  weightGsm: number;
  widthCm: number;
  // Kompozisyon satırları gönderilirse metne gerek yok (sunucu üretir);
  // kompozisyon boşsa metin zorunlu (ikisi de yoksa 400).
  content?: string;
  useArea: string;
  // data URL'ler; ilki kapak.
  images: string[];
}

export function createProduct(payload: NewProductInput) {
  return request<{ product: Product; warnings?: ProductWarnings }>('/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Detay yanıtındaki pasaport ilişkileri (liste yanıtında gelmez).
export interface ProductYarn {
  position: number;
  role: string;
  count: number;
  unit: string;
  ply: number;
  yarnType: string;
}

export interface ProductCertificate {
  position: number;
  name: string;
  number: string;
  validUntil: string | null;
  // Belgenin kendisi yanıtta gelmez; fetchCertificateImage ile çekilir.
  hasImage: boolean;
}

export interface ProductTestReport {
  position: number;
  kind: string;
  result: string;
  testedAt: string | null;
  hasImage: boolean;
}

// Alanın nereden geldiği ve onaylanıp onaylanmadığı; YALNIZCA sahibine gelir.
export interface ProductFieldMeta {
  field: string;
  confidence: number;
  source: string;
  confirmedAt: string | null;
}

// Detay yanıtı listeye göre bir alan fazla taşıyor: firmanın toplam ürün sayısı
// (tasarımdaki "Toplam N Ürün" rozeti) + pasaportun tamamı.
export type ProductDetail = Product & {
  companyProductCount: number;
  yarns?: ProductYarn[];
  certificates?: ProductCertificate[];
  testReports?: ProductTestReport[];
  fieldMeta?: ProductFieldMeta[];
};

export function fetchProduct(id: string) {
  return request<{ product: ProductDetail }>(`/products/${id}`);
}

// Kapak fotoğrafı (sıra 0).
export function fetchProductImage(id: string) {
  return request<{ imageUrl: string }>(`/products/${id}/image`);
}

export function fetchProductImageAt(id: string, position: number) {
  return request<{ imageUrl: string }>(`/products/${id}/images/${position}`);
}

// Güncellemede fotoğraf: yeni data URL ya da mevcut fotoğrafın eski sırası.
export type ProductImageInput = string | { existing: number };

export type UpdateProductInput = Partial<Omit<NewProductInput, 'images'>> & {
  // Verilirse fotoğrafların tamamı bu liste olur; verilmezse dokunulmaz.
  images?: ProductImageInput[];
};

export function updateProduct(id: string, payload: UpdateProductInput) {
  return request<{ product: Product; warnings?: ProductWarnings }>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// Sertifika belgesi ve test raporu fotoğrafı: ürün galerisiyle aynı kural,
// liste/detay yanıtında gelmez, görünür olunca tek tek çekilir.
export function fetchCertificateImage(productId: string, position: number) {
  return request<{ imageUrl: string }>(`/products/${productId}/certificates/${position}/image`);
}

export function fetchTestReportImage(productId: string, position: number) {
  return request<{ imageUrl: string }>(`/products/${productId}/test-reports/${position}/image`);
}

// Metinden otomatik çıkarılan alanları sahibi onaylar.
export function confirmProductFields(productId: string, fields: string[]) {
  return request<{ confirmed: number; pendingFieldCount: number }>(`/products/${productId}/fields/confirm`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
}

export function deleteProduct(id: string) {
  return request<void>(`/products/${id}`, { method: 'DELETE' });
}

// "Takibe Al" (eski adıyla favori): kayıt ProductFavorite tablosunda, uç adı
// değişmedi; yalnızca arayüzdeki etiket değişti (Faz 1, Adım 6).
export function setProductFavorite(id: string, favorite: boolean) {
  return request<{ isFavorite: boolean }>(`/products/${id}/favorite`, { method: favorite ? 'POST' : 'DELETE' });
}

// --- Teklif akışı (Faz 2, Adım 2) --------------------------------------------
// Alıcı istek açar (bağlantı ŞART DEĞİL; eski sohbetli "Teklif iste" kalktı),
// satıcı firma taslak hazırlar ve gönderir, alıcı kabul/ret eder. Fiyat
// yalnızca iki tarafa görünür; alıcı satıcının taslağını hiç görmez.
// Sunucu sözleşmesi: backend/src/routes/quotes.ts.

export type QuoteRequestStatus = 'open' | 'quoted' | 'accepted' | 'declined' | 'cancelled';

// 'expired': sunucu, geçerlilik tarihi geçmiş 'sent' teklifi böyle işaretliyor
// (veritabanında durum yine 'sent').
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'superseded' | 'expired';

export type PriceCurrency = 'TRY' | 'USD' | 'EUR';

export interface Quote {
  id: string;
  status: QuoteStatus;
  // Fiyat girilmemiş taslakta null.
  price: { value: number; currency: string; unit: string } | null;
  moq: number | null;
  moqUnit: string;
  leadTimeDays: number | null;
  validUntil: string | null;
  paymentTerms: string;
  note: string;
  sentAt: string | null;
  createdAt: string;
}

export interface QuoteRequestProductRef {
  id: string;
  code: string;
  type: string;
  subtype: string;
  weightGsm: number;
  widthCm: number;
}

export interface QuoteRequestRow {
  id: string;
  role: 'buyer' | 'seller';
  status: QuoteRequestStatus;
  quantity: number;
  unit: StockUnit;
  targetDate: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  product: QuoteRequestProductRef;
  sellerCompany: { id: string; name: string };
  buyer: { id: string; name: string; company: { id: string; name: string } | null };
  // Alıcıda taslaklar hiç gelmez.
  quotes: Quote[];
  activeQuote: Quote | null;
  // Yalnızca satıcıya gelir.
  draft: Quote | null;
}

// "Ürün kaydından doldur" sonucu: hangi alan eksik kaldı, miktar MOQ'nun
// altında mı, fiyat birimi çevrildi mi.
export interface QuoteDraftInfo {
  missing: string[];
  belowMoq: boolean;
  converted: boolean;
  total: number | null;
}

export function createQuoteRequest(input: {
  productId: string;
  quantity: number;
  unit: StockUnit;
  // 'YYYY-AA-GG' ya da null (istenen termin yok).
  targetDate?: string | null;
  note?: string;
}) {
  return request<{ request: QuoteRequestRow }>('/quotes/requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// role 'buyer': benim açtığım istekler · 'seller': firmama gelen istekler
// (firması olmayan kullanıcıda sunucu boş liste döner).
export function fetchQuoteRequests(role: 'buyer' | 'seller' = 'buyer') {
  const query = role === 'seller' ? '?role=seller' : '';
  return request<{ requests: QuoteRequestRow[] }>(`/quotes/requests${query}`);
}

export function fetchQuoteRequest(id: string) {
  return request<{ request: QuoteRequestRow }>(`/quotes/requests/${id}`);
}

// Satıcı: ürün kaydındaki fiyat/MOQ/terminden taslak üretir (fiyat UYDURULMAZ,
// üründe yoksa boş gelir ve draftInfo.missing içinde 'fiyat' olur).
export function draftQuote(id: string) {
  return request<{ request: QuoteRequestRow; draftInfo: QuoteDraftInfo }>(`/quotes/requests/${id}/draft`, {
    method: 'POST',
  });
}

// Gönderilmeyen alana sunucu dokunmaz; null "temizle" demektir.
export interface QuoteFieldsInput {
  priceValue?: number | null;
  priceCurrency?: PriceCurrency;
  priceUnit?: StockUnit;
  moq?: number | null;
  moqUnit?: '' | StockUnit;
  leadTimeDays?: number | null;
  validUntil?: string | null;
  paymentTerms?: string;
  note?: string;
}

export function saveQuote(id: string, fields: QuoteFieldsInput) {
  return request<{ request: QuoteRequestRow }>(`/quotes/requests/${id}/quote`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

// 400 price_required: fiyat, para birimi ve birim olmadan gönderilemez.
export function sendQuote(id: string) {
  return request<{ request: QuoteRequestRow }>(`/quotes/requests/${id}/quote/send`, { method: 'POST' });
}

export function respondQuote(id: string, action: 'accept' | 'decline') {
  return request<{ request: QuoteRequestRow }>(`/quotes/requests/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export function cancelQuoteRequest(id: string) {
  return request<{ request: QuoteRequestRow }>(`/quotes/requests/${id}/cancel`, { method: 'POST' });
}

export type FavoriteProduct = Product & { favoritedAt: string };

export function fetchFavoriteProducts() {
  return request<{ products: FavoriteProduct[] }>('/me/favorites');
}

export type RecentlyViewedProduct = Product & { viewedAt: string };

export function fetchRecentlyViewedProducts() {
  return request<{ products: RecentlyViewedProduct[] }>('/me/recently-viewed');
}

export function clearRecentlyViewedProducts() {
  return request<void>('/me/recently-viewed', { method: 'DELETE' });
}

// --- Bildirimler ve izleme (Faz 2, Adım 1) -----------------------------------
// Uygulama içi bildirimler; push bildirimi bu adımda YOK.

export type NotificationKind =
  | 'watch_match'
  | 'sample_request_new'
  | 'sample_request_status'
  | 'connection_request'
  | 'connection_accepted'
  // Faz 2, Adım 2 (teklif akışı); hepsinde data.quoteRequestId dolu.
  | 'quote_request_new'
  | 'quote_received'
  | 'quote_accepted'
  | 'quote_declined'
  // Faz 2, Adım 3 (satıcı asistanı): asistan alıcının sorusunu firmaya iletti
  // (satıcıya, data.questionId) ve firma cevapladı (alıcıya, data.threadId +
  // data.companyId).
  | 'company_question_new'
  | 'company_question_answered';

export interface NotificationData {
  productId?: string;
  sampleRequestId?: string;
  quoteRequestId?: string;
  userId?: string;
  ruleId?: string;
  postId?: string;
  // Satıcı asistanı (Faz 2, Adım 3).
  questionId?: string;
  threadId?: string;
  companyId?: string;
}

export interface AppNotification {
  id: string;
  // Sunucu ileride yeni tür ekleyebilir: bilinmeyen tür ekranda genel ikonla çizilir.
  kind: NotificationKind | (string & {});
  title: string;
  body: string;
  data: NotificationData;
  read: boolean;
  createdAt: string;
}

export function fetchNotifications(limit = 30) {
  return request<{ notifications: AppNotification[]; unreadCount: number }>(`/notifications?limit=${limit}`);
}

export function fetchUnreadNotificationCount() {
  return request<{ unreadCount: number }>('/notifications/unread-count');
}

// Ya belirli bildirimler ya da hepsi okundu işaretlenir.
export function markNotificationsRead(payload: { ids: string[] } | { all: true }) {
  return request<{ unreadCount: number }>('/notifications/read', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// İzleme kuralının süzgeci ürün süzgecinin alt kümesi; çeviri tek yerde
// (features/products/filters.ts watchQueryFromFilters).
export type { WatchQuery };

export interface WatchRule {
  id: string;
  name: string;
  query: WatchQuery;
  active: boolean;
  lastMatchedAt: string | null;
  matchCount: number;
  createdAt: string;
}

export function fetchWatchRules() {
  return request<{ rules: WatchRule[]; max: number }>('/watch-rules');
}

// name verilmezse sunucu süzgeçten okunur bir ad üretir.
export function createWatchRule(input: { name?: string; query: WatchQuery }) {
  return request<{ rule: WatchRule }>('/watch-rules', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateWatchRule(id: string, patch: { name?: string; active?: boolean }) {
  return request<{ rule: WatchRule }>(`/watch-rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteWatchRule(id: string) {
  return request<void>(`/watch-rules/${id}`, { method: 'DELETE' });
}

// --- Firma asistanı (Faz 1, Adım 5) -----------------------------------------
// Sohbet kaydı sunucuda tutulur; istemci yalnızca son kullanılan threadId'yi
// cihazda saklar (src/features/assistant/threadStore.ts).

export interface AssistantThread {
  id: string;
  title: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
}

// Asistanın çağırdığı beceri/araç: ekranda sonuç kartı olarak çizilir.
// `output` beceriye göre değişir; ekran bilinen becerileri satırlara çevirir,
// tanımadığını `summary` metniyle gösterir (rakamlar hep araç çıktısından).
export interface AssistantToolCall {
  name: string;
  title: string;
  input: Record<string, unknown>;
  output: unknown;
  summary: string;
  formula?: string;
}

// "Bunu hafızaya kaydedelim mi?" kartı; yazma yalnızca kullanıcı onayıyla.
export interface AssistantMemorySuggestion {
  key: string;
  label: string;
  value: number | string;
  reason: string;
}

// "Bu aramayı izleyelim mi?" kartı (Faz 2, Adım 1): hafıza önerisiyle aynı
// desen — asistan kuralı kendisi KURMAZ, kullanıcı ekranda onaylar.
export interface AssistantWatchSuggestion {
  name: string;
  query: WatchQuery;
  reason: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls: AssistantToolCall[];
  memorySuggestions: AssistantMemorySuggestion[];
  // Eski sunucuda bu alan yok: ekranlar `?? []` ile okumalı.
  watchSuggestions?: AssistantWatchSuggestion[];
  createdAt: string;
}

export interface AssistantTurn {
  userMessage: AssistantMessage;
  message: AssistantMessage;
  usage: { inputTokens: number; outputTokens: number; iterations: number; mock: boolean };
  thread: AssistantThread | null;
}

export function fetchAssistantThreads() {
  return request<{ threads: AssistantThread[] }>('/assistant/threads');
}

export function createAssistantThread() {
  return request<{ thread: AssistantThread }>('/assistant/threads', { method: 'POST' });
}

export function fetchAssistantThread(threadId: string) {
  return request<{ thread: AssistantThread; messages: AssistantMessage[] }>(`/assistant/threads/${threadId}`);
}

export function deleteAssistantThread(threadId: string) {
  return request<void>(`/assistant/threads/${threadId}`, { method: 'DELETE' });
}

// Araçlı tur 5-30 sn sürebiliyor: varsayılan 30 sn yetmez.
export function sendAssistantMessage(threadId: string, text: string) {
  return request<AssistantTurn>(
    `/assistant/threads/${threadId}/messages`,
    { method: 'POST', body: JSON.stringify({ text }) },
    LLM_REQUEST_TIMEOUT_MS
  );
}

export type MemoryKind = 'number' | 'text' | 'list';

export interface MemoryKeyDef {
  key: string;
  label: string;
  hint: string;
  kind: MemoryKind;
}

export interface MemoryEntry extends MemoryKeyDef {
  value: number | string;
  updatedAt: string;
}

export function fetchCompanyMemory() {
  return request<{ memory: MemoryEntry[]; keys: MemoryKeyDef[] }>('/assistant/memory');
}

export function setCompanyMemory(key: string, value: number | string) {
  return request<{ entry: MemoryEntry }>(`/assistant/memory/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export function deleteCompanyMemory(key: string) {
  return request<void>(`/assistant/memory/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

// --- Asistan kişiliği (Faz 1, Adım 9) ---------------------------------------
// İki karakter: İpek ve Mert. Kullanıcı ilk açılışta seçer (persona null),
// sonra "Firma hafızası" ekranından değiştirir; uygulama cinsiyet sormaz.

export type AssistantPersonaKey = 'ipek' | 'mert';

export interface AssistantPersonaOption {
  key: AssistantPersonaKey;
  name: string;
  tagline: string;
}

export interface AssistantPersonaState {
  // null: kullanıcı henüz seçmedi (seçim ekranı gösterilir).
  persona: AssistantPersonaKey | null;
  // Seçilmediyse sunucunun kullandığı varsayılan.
  effective: AssistantPersonaKey;
  options: AssistantPersonaOption[];
}

export function fetchAssistantPersona() {
  return request<AssistantPersonaState>('/assistant/persona');
}

export function setAssistantPersona(persona: AssistantPersonaKey) {
  return request<{ persona: AssistantPersonaKey; name: string }>('/assistant/persona', {
    method: 'PUT',
    body: JSON.stringify({ persona }),
  });
}

// Karşılama metni modelsiz üretilir (anında, maliyetsiz); saat cihazdan gider.
export interface AssistantGreeting {
  persona: AssistantPersonaKey | null;
  name: string;
  text: string;
  pendingIncoming: number;
  unreadMessages: number;
  memoryEmpty: boolean;
}

export function fetchAssistantGreeting(hour: number) {
  return request<AssistantGreeting>(`/assistant/greeting?hour=${hour}`);
}

export interface SkillSummary {
  name: string;
  title: string;
  description: string;
  formula: string;
  inputSchema: unknown;
}

export function fetchSkills() {
  return request<{ skills: SkillSummary[] }>('/skills');
}

// --- Satıcı asistanı (Faz 2, Adım 3) -----------------------------------------
// Alıcı, başka bir firmanın asistanıyla konuşur: iplik "buyer" kanalındadır,
// mesajlar yukarıdaki /assistant/threads uçlarıyla gider. Bu kipte asistan
// FİYAT VERMEZ (fiyat yalnızca teklifle) ve hafıza/izleme önerisi üretmez.

export interface SellerAssistantThread {
  thread: AssistantThread;
  company: { id: string; name: string };
}

// Aynı firma için hep aynı iplik döner (200 mevcut, 201 yeni).
export function openSellerAssistantThread(companyId: string) {
  return request<SellerAssistantThread>(`/assistant/seller/${companyId}/thread`, { method: 'POST' });
}

export interface CompanyQuestion {
  id: string;
  question: string;
  answer: string | null;
  status: 'open' | 'answered';
  createdAt: string;
  answeredAt: string | null;
  product: { id: string; code: string } | null;
  asker: { id: string; name: string; company: { id: string; name: string } | null };
}

// Firması olmayan kullanıcıda 403 no_company.
export function fetchCompanyQuestions() {
  return request<{ questions: CompanyQuestion[]; openCount: number }>('/assistant/questions');
}

export function answerCompanyQuestion(id: string, input: { answer: string; addToFaq?: boolean }) {
  return request<{ ok: true }>(`/assistant/questions/${id}/answer`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface CompanyFaq {
  id: string;
  question: string;
  answer: string;
  updatedAt: string;
}

export function fetchCompanyFaqs() {
  return request<{ faqs: CompanyFaq[] }>('/assistant/faq');
}

// 409 too_many_faqs: firma başına sınır doldu.
export function createCompanyFaq(input: { question: string; answer: string }) {
  return request<{ faq: CompanyFaq }>('/assistant/faq', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCompanyFaq(id: string, input: { question: string; answer: string }) {
  return request<{ faq: CompanyFaq }>(`/assistant/faq/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteCompanyFaq(id: string) {
  return request<void>(`/assistant/faq/${id}`, { method: 'DELETE' });
}

// Numune talebi yanıtları, User/Product'ın tamamını DEĞİL sunucunun açıkça
// seçtiği alanları taşır (telefon numarası ve base64 ürün fotoğrafı sızmasın
// diye). Bu yüzden ayrı, dar tipler tanımlı.
export interface SampleActor {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  company: { id: string; name: string; logoUpdatedAt: string | null } | null;
}

export interface SampleProductRef {
  id: string;
  code: string;
  companyId: string;
  company: { id: string; name: string; logoUpdatedAt: string | null };
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

// --- Etiketten pasaport çıkarımı (Faz 1, Adım 3) ---
// Sunucu sözleşmesi: backend/src/skills/passportExtract/schema.ts.
// Uç kaydetmez, yalnızca öneri döner; kullanıcı onay ekranında seçtiği alanları
// forma aktarır, kayıt normal createProduct/updateProduct ile olur.

// value null ise "etikette bulunamadı". confidence 0-1, evidence etikette
// birebir okunan parça (yoksa null).
export interface ExtractedField<T> {
  value: T | null;
  confidence: number;
  evidence: string | null;
}

export interface ExtractedYarn {
  role: '';
  count: number;
  unit: string; // catalog.ts YARN_UNITS
  ply: number;
  yarnType: string; // catalog.ts YARN_TYPES, boş olabilir
}

export interface ExtractedCertificate {
  name: string; // glossaryLabels.ts CERTIFICATES
  number: string;
  validUntil: string | null;
}

export interface PassportExtraction {
  type: ExtractedField<ProductType>;
  subtype: ExtractedField<string>;
  code: ExtractedField<string>;
  composition: ExtractedField<CompositionItem[]>;
  weightGsm: ExtractedField<number>;
  widthCm: ExtractedField<number>;
  widthType: ExtractedField<'acik' | 'tup'>;
  yarns: ExtractedField<ExtractedYarn[]>;
  certificates: ExtractedField<ExtractedCertificate[]>;
  finishTags: ExtractedField<string[]>;
  usages: ExtractedField<string[]>;
  // Modelin serbest gözlemleri (renk, desen, okunamayan yerler); boş olabilir.
  notes: string;
}

// Çıkarımdaki alan adları; forma aktarım ve fieldMeta bunlarla çalışır.
export type ExtractionFieldName = Exclude<keyof PassportExtraction, 'notes'>;

// Okundu ama aktarılmadı: sözlükte karşılığı yok ya da güven eşiğin altında.
export interface ExtractRejected {
  field: string;
  reason:
    | 'unknown_fiber'
    | 'unknown_subtype'
    | 'subtype_not_in_type'
    | 'unknown_certificate'
    | 'unknown_yarn_unit'
    | 'invalid_value'
    | 'low_confidence';
  raw: string;
}

export interface ExtractOutcome {
  extraction: PassportExtraction;
  // Makullük uyarıları: kaydı engellemez, ekranda gösterilir.
  warnings: ProductWarnings;
  rejected: ExtractRejected[];
  meta: {
    model: string;
    // true: gerçek model çağrılmadı (sunucu test kipinde).
    mock: boolean;
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
  };
}

export interface ExtractImageInput {
  // data URL ("data:image/jpeg;base64,...") ya da çıplak base64.
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface ExtractDocumentInput {
  dataBase64: string;
  mediaType: 'application/pdf';
}

// images / document / text'ten en az biri gerekli (yoksa 400).
export interface PassportExtractInput {
  images?: ExtractImageInput[];
  document?: ExtractDocumentInput | null;
  text?: string;
  hints?: { type?: ProductType };
}

export function extractPassport(input: PassportExtractInput) {
  return request<ExtractOutcome>(
    '/passport/extract',
    { method: 'POST', body: JSON.stringify(input) },
    // Model çağrısı: fotoğraf + PDF ile varsayılan 30 sn yetmiyor.
    LLM_REQUEST_TIMEOUT_MS
  );
}

// --- Makine parkı ve fason kapasite (Faz 2, Adım 5) --------------------------
// Sunucu: backend/src/routes/machines.ts. Makine türü SERBEST METİN; /kinds
// yalnızca öneri döner (başlangıç listesi + platformda girilenler).

export type MachineGroup = 'orme' | 'dokuma' | 'boya_terbiye' | 'baski' | 'konfeksiyon' | 'iplik' | 'diger';

export interface Machine {
  id: string;
  group: MachineGroup;
  kind: string;
  brand: string;
  model: string;
  year: number | null;
  /** Pus (çap, inç) */
  diameterInch: number | null;
  /** Fayn (incelik) */
  gauge: number | null;
  /** Sistem sayısı */
  feeders: number | null;
  /** İğne sayısı */
  needles: number | null;
  workingWidthCm: number | null;
  feature: string;
  count: number;
  note: string;
}

export interface CompanyCapacity {
  monthlyCapacityTons: number | null;
  note: string;
  contractOpen: boolean;
  updatedAt: string | null;
}

export interface MachineKinds {
  groups: { key: MachineGroup; label: string }[];
  kinds: Record<string, string[]>;
}

export function fetchMachineKinds() {
  return request<MachineKinds>('/machines/kinds');
}

// Oturumsuz da çalışır: başka firmanın sayfasındaki "Makine parkı" sekmesi.
export function fetchCompanyMachines(companyId: string) {
  return request<{ machines: Machine[]; capacity: CompanyCapacity; totalCount: number }>(
    `/machines/company/${companyId}`
  );
}

// Boş bırakılan sayı alanları null olarak gider (sunucu şeması nullable).
export interface MachineInput {
  group: MachineGroup;
  kind: string;
  brand?: string;
  model?: string;
  year?: number | null;
  diameterInch?: number | null;
  gauge?: number | null;
  feeders?: number | null;
  needles?: number | null;
  workingWidthCm?: number | null;
  feature?: string;
  count?: number;
  note?: string;
}

// 403 no_company · 409 too_many_machines · 400 invalid_body.
export function createMachine(input: MachineInput) {
  return request<{ machine: Machine }>('/machines', { method: 'POST', body: JSON.stringify(input) });
}

export function updateMachine(id: string, input: MachineInput) {
  return request<{ machine: Machine }>(`/machines/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteMachine(id: string) {
  return request<void>(`/machines/${id}`, { method: 'DELETE' });
}

export function saveCapacity(input: { monthlyCapacityTons?: number | null; note?: string; contractOpen?: boolean }) {
  return request<{ capacity: CompanyCapacity }>('/machines/capacity/mine', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export interface CapacitySearchParams {
  group?: MachineGroup | '';
  kind?: string;
  gauge?: number;
  diameterInch?: number;
  widthMin?: number;
  contractOpen?: boolean;
  city?: string;
}

export interface CapacityResult {
  company: {
    id: string;
    name: string;
    city: string;
    verification: VerificationStatus;
    logoUpdatedAt: string | null;
  };
  capacity: CompanyCapacity;
  matchedMachines: Machine[];
  matchedCount: number;
}

// Kendi firmanız sonuçta çıkmaz (sunucu dışlar).
export function searchCapacity(params: CapacitySearchParams) {
  const query = new URLSearchParams();
  if (params.group) query.set('group', params.group);
  if (params.kind?.trim()) query.set('kind', params.kind.trim());
  if (params.gauge !== undefined) query.set('gauge', String(params.gauge));
  if (params.diameterInch !== undefined) query.set('diameterInch', String(params.diameterInch));
  if (params.widthMin !== undefined) query.set('widthMin', String(params.widthMin));
  if (params.contractOpen) query.set('contractOpen', '1');
  if (params.city?.trim()) query.set('city', params.city.trim());
  const suffix = query.toString();
  return request<{ results: CapacityResult[] }>(`/machines/search${suffix ? `?${suffix}` : ''}`);
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
