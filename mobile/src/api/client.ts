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
import {
  productQueryString,
  type FabricWatchQuery,
  type ProductFilters,
  type WatchQuery,
  type YarnWatchQuery,
} from '../features/products/filters';
import type { AnyProductType, StockUnit } from '../features/products/catalog';

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

export type CompanyEmployee = Pick<User, 'id' | 'firstName' | 'lastName' | 'position' | 'avatarUpdatedAt'>;

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

export type PublicUserProfile = Pick<
  User,
  'id' | 'firstName' | 'lastName' | 'position' | 'accountType' | 'avatarUpdatedAt'
> & {
  phone?: string;
  company: Pick<Company, 'id' | 'name' | 'verification' | 'logoUpdatedAt'> | null;
};

export function fetchUserProfile(id: string) {
  return request<{ user: PublicUserProfile }>(`/users/${id}`);
}

// Kişisel profil fotoğrafı (firma logosuyla aynı desen): fotoğrafın kendisi
// kullanıcı nesnelerinde gelmez, yalnızca `avatarUpdatedAt` gelir; fotoğraf
// gerektiğinde bu uçtan çekilir ve zaman damgası önbellek anahtarı olur.
export function fetchUserAvatar(id: string) {
  return request<{ imageUrl: string }>(`/users/${id}/avatar`);
}

// image: yeni fotoğraf için data URL, kaldırmak için null.
export function uploadMyAvatar(image: string | null) {
  return request<{ avatarUpdatedAt: string | null }>('/users/me/avatar', {
    method: 'PUT',
    body: JSON.stringify({ image }),
  });
}

// Sunucudaki sınır (backend/src/routes/users.ts MAX_AVATAR_CHARS).
export const MAX_AVATAR_CHARS = 400_000;

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
  avatarUpdatedAt: string | null;
  company: { id: string; name: string; logoUpdatedAt: string | null } | null;
};

export type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  readAt: string | null;
  // Teklif akışından düşen mesaj (Faz 2, Adım 2): doluysa sohbette normal
  // balon yerine "Teklif" kartı çizilir. Eski sunucuda bu alan yok.
  quoteRequestId?: string | null;
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
  avatarUpdatedAt: string | null;
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
  // İplik ürünlerinde özet satırı; kumaşta null (eski sunucu hiç göndermez).
  yarnSummary?: string | null;
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

// type 'iplik' de olabilir (Faz 2, Adım 6): firmanın kendi ürünleri arasında
// iplikler de var.
export type MyProductOption = { id: string; code: string; type: AnyProductType; subtype: string; hasImage: boolean };

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

// --- Genel arama (üst başlıktaki "Arama Yap" kutusu, 2026-09-21) ---
// Sunucu: backend/src/routes/search.ts. Tek kutudan firma + kumaş + iplik;
// her gruptan en çok `limit` sonuç, `hasMore` ile "Tümünü gör" gösterilir.
// Oturumsuz da çalışır (optionalAuth).

export interface GlobalSearchCompany {
  id: string;
  name: string;
  city: string;
  companyType: string;
  verification: VerificationStatus;
  logoUpdatedAt: string | null;
  productCount: number;
}

export interface GlobalSearchResult {
  query: string;
  companies: { items: GlobalSearchCompany[]; hasMore: boolean };
  fabrics: { items: Product[]; hasMore: boolean };
  yarns: { items: Product[]; hasMore: boolean };
}

export function globalSearch(q: string, limit = 5) {
  return request<GlobalSearchResult>(`/search?q=${encodeURIComponent(q.trim())}&limit=${limit}`);
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
  // --- AB Dijital Ürün Pasaportu'na hazırlık (Faz 3, Adım 7) ---
  // Menşe ülke (≤60), bakım / yıkama bilgisi (≤500), geri dönüştürülmüş
  // içerik oranı (0-100; null "belirtilmedi", 0 geçerli bir değer).
  originCountry?: string;
  careNotes?: string;
  // Bakım sembolü anahtarları (features/care/symbols.ts). Grup başına en çok
  // bir tane; sunucu `unknown_care_symbol` / `one_symbol_per_group` döndürür.
  // Boş dizi gönderilirse kayıtlı semboller silinir.
  careSymbols?: string[];
  recycledPercent?: number | null;
}

// Makullük uyarıları: kaydı ENGELLEMEZ, ekranda gösterilir. notes Türkçe.
export interface ProductWarnings {
  codes: string[];
  notes: string[];
}

export interface NewProductInput extends PassportInput {
  code: string;
  // Yalnızca kumaş çeşitleri: iplik ayrı uçtan eklenir (POST /api/yarns).
  type: ProductType;
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
  // Faz 3, Adım 1: istek bir çoklu teklif isteğinin (RFQ) parçasıysa dolu.
  // Eski sunucuda bu alan yok.
  rfqId?: string | null;
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

// Kabul edilince sunucu sipariş kaydını (deal) kendiliğinden açar ve kimliğini
// yanıtta döner (Faz 3, Adım 4). Eski sunucuda alan yok: undefined gelebilir.
export function respondQuote(id: string, action: 'accept' | 'decline') {
  return request<{ request: QuoteRequestRow; dealId?: string | null }>(`/quotes/requests/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export function cancelQuoteRequest(id: string) {
  return request<{ request: QuoteRequestRow }>(`/quotes/requests/${id}/cancel`, { method: 'POST' });
}

// --- Sipariş kaydı ve karşılıklı değerlendirme (Faz 3, Adım 4) --------------
// Sunucu: backend/src/routes/deals.ts. Kayıt kabul edilen tekliften doğar.
// Platform ödeme almaz, sevkiyat izlemez: ekranda görünen her şey iki tarafın
// BEYANIDIR. Ödeme konusuna hiçbir metinde girilmez.

export type DealStatus = 'acik' | 'teslim_bildirildi' | 'teslim_edildi' | 'itiraz' | 'iptal';

// Alıcı bu kadar gün yanıt vermezse teslim onaylanmış sayılır (AUTO_CONFIRM_DAYS).
export const DEAL_AUTO_CONFIRM_DAYS = 7;
// Değerlendirmeler iki taraf da yazınca ya da teslim onayından bu kadar gün
// sonra görünür olur (REVIEW_REVEAL_DAYS).
export const DEAL_REVIEW_REVEAL_DAYS = 14;

// Alıcı üç ölçüt (quality/timing/communication), satıcı iki ölçüt
// (communication/seriousness) verir; karşılığı olmayan ölçüt null gelir.
export interface DealReview {
  authorRole: 'buyer' | 'seller';
  quality: number | null;
  timing: number | null;
  communication: number;
  seriousness: number | null;
  comment: string;
  createdAt: string;
}

export interface DealView {
  id: string;
  // Rol sunucudan gelir, istemci karar vermez (teklif detayındaki desen).
  role: 'buyer' | 'seller';
  status: DealStatus;
  quoteRequestId: string;
  product: { id: string; code: string };
  quantity: number;
  unit: StockUnit;
  // Satıcının teklifindeki terminden hesaplanır; teklifte termin yoksa alıcının
  // istediği tarih, o da yoksa null.
  agreedDeliveryDate: string | null;
  sellerDeliveredAt: string | null;
  buyerConfirmedAt: string | null;
  // Anlaşılan tarih ya da teslim beyanı yoksa null; 0 "zamanında" demektir.
  lateDays: number | null;
  disputeNote: string;
  cancelledByRole: 'buyer' | 'seller' | null | '';
  cancelReason: string;
  createdAt: string;
  sellerCompany: { id: string; name: string; verification: VerificationStatus } | null;
  buyer: { id: string; name: string; company: { id: string; name: string } | null } | null;
  canReview: boolean;
  myReview: DealReview | null;
  // Görünürlük kuralı sağlanana kadar karşı tarafın yazdığı gelmez; yalnızca
  // "yazdı" bilgisi (theirReviewPending) gelir.
  theirReview: DealReview | null;
  theirReviewPending: boolean;
}

export function fetchDeals(role: 'buyer' | 'seller' = 'buyer') {
  const query = role === 'seller' ? '?role=seller' : '?role=buyer';
  return request<{ deals: DealView[] }>(`/deals${query}`);
}

export function fetchDeal(id: string) {
  return request<{ deal: DealView }>(`/deals/${id}`);
}

// 404 deal_not_found: bu teklif isteğinden henüz sipariş doğmamış.
export function fetchDealByQuoteRequest(quoteRequestId: string) {
  return request<{ deal: DealView }>(`/deals/by-request/${quoteRequestId}`);
}

// Satıcı beyanı. deliveredAt verilmezse sunucu bugünü yazar.
// 400 future_date / before_deal, 409 invalid_status.
export function markDealDelivered(id: string, deliveredAt?: string) {
  return request<{ deal: DealView }>(`/deals/${id}/deliver`, {
    method: 'POST',
    body: JSON.stringify(deliveredAt ? { deliveredAt } : {}),
  });
}

export function confirmDealDelivery(id: string) {
  return request<{ deal: DealView }>(`/deals/${id}/confirm`, { method: 'POST' });
}

export function disputeDeal(id: string, note: string) {
  return request<{ deal: DealView }>(`/deals/${id}/dispute`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export function cancelDeal(id: string, reason?: string) {
  return request<{ deal: DealView }>(`/deals/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export type DealReviewInput =
  | { quality: number; timing: number; communication: number; comment?: string }
  | { communication: number; seriousness: number; comment?: string };

// 409 not_completed (teslim onaylanmadan değerlendirilemez) / already_reviewed.
export function reviewDeal(id: string, input: DealReviewInput) {
  return request<{ deal: DealView }>(`/deals/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// --- Çoklu teklif isteme ve karşılaştırma (Faz 3, Adım 1) --------------------
// Sunucu: backend/src/routes/rfqs.ts. Alıcı birden çok ürün işaretler, her
// FİRMAYA tek istek gider (aynı firmadan yalnızca ilk seçilen ürün) ve gelen
// teklifler tek tabloda karşılaştırılır. Satıcı kaç firmaya sorulduğunu görmez.

// Sunucudaki sabitlerle aynı (MAX_RFQ_COMPANIES, MAX_QUOTE_REQUESTS_PER_DAY).
export const MAX_RFQ_COMPANIES = 10;
// Bunun üstünde firmaya sorunca ekranda "cevap oranı düşebilir" notu çıkar.
export const MANY_RFQ_COMPANIES = 5;

export type RfqSkipReason = 'not_found' | 'own_product' | 'same_company' | 'already_open';

export interface RfqSkipped {
  productId: string;
  reason: RfqSkipReason | (string & {});
}

export interface RfqSummary {
  id: string;
  title: string;
  quantity: number;
  unit: StockUnit;
  targetDate: string | null;
  createdAt: string;
  requestCount: number;
  quotedCount: number;
  acceptedCount: number;
}

export type RfqQuoteStatus = 'sent' | 'accepted' | 'declined' | 'expired';

export interface RfqQuote {
  id: string;
  status: RfqQuoteStatus | (string & {});
  // Satıcının girdiği asıl fiyat (kendi biriminde).
  price: { value: number; currency: string; unit: string } | null;
  // İsteğin birimine çevrilmiş fiyat; para birimi ÇEVRİLMEZ. Çevrilemiyorsa
  // (gramaj/en yok, iplik) null gelir.
  comparablePrice: { value: number; currency: string; unit: StockUnit; converted: boolean } | null;
  estimatedTotal: { value: number; currency: string } | null;
  moq: number | null;
  moqUnit: string;
  moqAboveQuantity: boolean;
  leadTimeDays: number | null;
  validUntil: string | null;
  paymentTerms: string;
  note: string;
  sentAt: string | null;
}

// 'lowest_price' yalnızca AYNI para birimi içinde verilir.
export type RfqFlag = 'lowest_price' | 'fastest';

export interface RfqRow {
  requestId: string;
  requestStatus: QuoteRequestStatus;
  product: {
    id: string;
    code: string;
    type: string;
    subtype: string;
    weightGsm: number;
    widthCm: number;
    content: string;
  };
  company: {
    id: string;
    name: string;
    city: string;
    verification: VerificationStatus;
    verificationLevel?: string;
    logoUpdatedAt: string | null;
    confirmedReferenceCount: number;
  };
  quote: RfqQuote | null;
  flags: (RfqFlag | (string & {}))[];
}

export interface RfqCompare {
  id: string;
  title: string;
  quantity: number;
  unit: StockUnit;
  targetDate: string | null;
  note: string;
  createdAt: string;
  requestCount: number;
  quotedCount: number;
  // Teklif gelen para birimleri; birden çoksa ekranda uyarı notu çıkar.
  currencies: string[];
  rows: RfqRow[];
}

// 400 need_two_companies (gövdede `skipped`) · 400 too_many_companies
// (`max`, `selected`) · 429 daily_limit (`max`, `remaining`).
export function createRfq(input: {
  productIds: string[];
  title?: string;
  quantity: number;
  unit: StockUnit;
  // 'YYYY-AA-GG' ya da null.
  targetDate?: string | null;
  note?: string;
}) {
  return request<{ rfq: RfqCompare; skipped: RfqSkipped[] }>('/rfqs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchRfqs() {
  return request<{ rfqs: RfqSummary[] }>('/rfqs');
}

export function fetchRfq(id: string) {
  return request<{ rfq: RfqCompare }>(`/rfqs/${id}`);
}

// --- Benzer kumaş arama (Faz 3, Adım 3) --------------------------------------
// Sunucu: backend/src/routes/looks.ts + backend/src/looks.ts. YALNIZCA görünüm
// karşılaştırılır: gramaj, lif ve içerik fotoğraftan okunmaz. Ürünün "görünüm
// kartı" fotoğraf kaydedilince sunucuda arka planda çıkar, istemci bir şey yapmaz.

/** Gövdedeki data URL sunucuda bu karakter sayısıyla sınırlı (400 invalid_body). */
export const MAX_LOOK_IMAGE_CHARS = 900_000;

/** Ekranda yalnızca hazır `summary` kullanılıyor; anahtarlar sunucudaki sözlükten. */
export interface FabricLookView {
  isFabric: boolean;
  pattern: string;
  scale: string;
  colors: string[];
  surface: string;
  texture: string;
  transparency: string;
  confidence: number;
  /** Hazır Türkçe özet: "Çiçekli · Orta desen · Lacivert + Pembe · Mat". */
  summary: string;
}

export interface SimilarProductResult {
  /** Normal ürün satırı verisi (fiyat içermez). */
  product: Product;
  /** 0-100. */
  similarity: number;
  /** Türkçe nedenler: "aynı desen türü", "aynı ana renk", "yakın doku"... */
  reasons: string[];
  look: FabricLookView;
}

export interface LookSearchResult {
  look: FabricLookView;
  /** false: fotoğrafta kumaş seçilemedi (results boş gelir). */
  recognized: boolean;
  results: SimilarProductResult[];
  /** Bugün kalan arama hakkı. */
  remaining: number;
}

/**
 * Fotoğrafla benzer kumaş arama (oturum şart, günde 20). Model çağrısı içerdiği
 * için etiket okuma gibi uzun zaman aşımıyla gidiyor.
 * Hatalar: 429 daily_limit (gövdede `max`) · 503 llm_not_configured ·
 * 502 look_failed · 400 unsupported_image / invalid_body.
 */
export function searchSimilarByPhoto(imageDataUrl: string, limit?: number) {
  return request<LookSearchResult>(
    '/looks/search',
    { method: 'POST', body: JSON.stringify(limit ? { image: imageDataUrl, limit } : { image: imageDataUrl }) },
    LLM_REQUEST_TIMEOUT_MS
  );
}

/**
 * Ürün sayfasındaki "Benzer kumaşlar" (oturumsuz da çalışır, model çağrısı yok).
 * `look === null`: ürünün görünüm kartı yok, bölüm gösterilmez.
 */
export function fetchSimilarProducts(productId: string) {
  return request<{ look: FabricLookView | null; results: SimilarProductResult[] }>(
    `/looks/product/${productId}/similar`
  );
}

// --- Dijital pasaport (Faz 3, Adım 7) ----------------------------------------
// Sunucu: backend/src/routes/dpp.ts. AB Dijital Ürün Pasaportu'na HAZIRLIK:
// AB'nin tekstil için zorunlu alanları henüz yayımlanmadı, bu bir uyum beyanı
// DEĞİLDİR. Ticari alanlar (fiyat, stok, MOQ, termin) pasaporta hiç çıkmaz.

export interface DppPassport {
  schema: string;
  disclaimer: string;
  /** `url`: herkese açık pasaport sayfası (QR'ın içindeki adres). */
  identifier: { productId: string; code: string; url: string };
  issuedAt: string;
  updatedAt: string;
  economicOperator: {
    name: string;
    city: string;
    website: string;
    verified: boolean;
    verificationLevel: string;
  };
  product: {
    category: string;
    type: string;
    subtype: string;
    weightGsm: number | null;
    widthCm: number | null;
    description: string;
    hasPhoto: boolean;
  };
  composition: { fiber: string; fiberLabel: string; percent: number }[];
  recycledContentPercent: number | null;
  originCountry: string;
  yarns: { role: string; count: number; unit: string; ply: number; type: string }[];
  finishes: string[];
  certificates: { name: string; label: string; number: string; validUntil: string | null }[];
  testReports: { kind: string; result: string; testedAt: string | null }[];
  care: string;
}

export interface DppResult {
  passport: DppPassport;
  completenessPercent: number;
  /** YALNIZCA ürünün sahibi firmaya gelir. */
  missing?: { key: string; label: string }[];
}

/** Oturum şart değil; oturum varsa ve ürün sizinse `missing` de gelir. */
export function fetchDpp(productId: string) {
  return request<DppResult>(`/dpp/${productId}`);
}

/**
 * Etikete / kartelaya basılacak QR'ın PNG adresi. Oturum gerekmediği için
 * doğrudan `Image` kaynağı ({ uri }) olarak kullanılabilir.
 */
export function dppQrUrl(productId: string, size = 600) {
  return `${API_BASE_URL}/dpp/${encodeURIComponent(productId)}/qr.png?size=${size}`;
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
  | 'company_question_answered'
  // Faz 2, Adım 7 (karşılıklı referans): data.referenceId + data.companyId
  // (isteği gönderen ya da cevaplayan karşı firma).
  | 'reference_request'
  | 'reference_confirmed'
  | 'reference_rejected'
  // Faz 3, Adım 4 (sipariş kaydı): hepsinde data.dealId dolu. 'quote_accepted'
  // bildiriminde de artık data.dealId var.
  | 'deal_created'
  | 'deal_delivered'
  | 'deal_confirmed'
  | 'deal_disputed'
  | 'deal_cancelled'
  | 'deal_review'
  // WhatsApp'tan gelen etiket fotoğrafından hazırlanan ürün taslağı;
  // data.draftId dolu (bkz. fetchProductDraft).
  | 'product_draft'
  // Faz 2, Adım 4 (davetler): davet ettiğiniz kişi kayıt oldu.
  // data.userId (katılan kişi) + data.inviteId.
  | 'invite_joined';

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
  // Karşılıklı referanslar (Faz 2, Adım 7).
  referenceId?: string;
  // Sipariş kaydı (Faz 3, Adım 4).
  dealId?: string;
  // WhatsApp ürün taslağı.
  draftId?: string;
  // Davetler (Faz 2, Adım 4).
  inviteId?: string;
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

// İzleme kuralının süzgeci ürün (kumaş) ya da iplik süzgecinin alt kümesi;
// çeviri tek yerde (features/products/filters.ts watchQueryFromFilters,
// features/yarns/watch.ts yarnWatchQueryFromParams).
export type { WatchQuery, FabricWatchQuery, YarnWatchQuery };

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

// --- WhatsApp'tan ürün taslakları -------------------------------------------
// Kullanıcı WhatsApp'taki Avedon asistanına etiket FOTOĞRAFI gönderince sunucu
// etiketi okuyup bir taslak kaydeder (ürün OLUŞTURMAZ) ve 'product_draft'
// bildirimi düşer. Uygulama taslağı açar, onay ekranında gösterir, kullanıcı
// normal ürün kaydıyla kaydeder. Sunucu: backend/src/routes/productDrafts.ts.

export interface ProductDraftSummary {
  id: string;
  source: string;
  // WhatsApp mesajının yazılı notu (boş olabilir).
  caption: string;
  createdAt: string;
  // Etiketten okunabildiyse; liste satırında gösterilir.
  code: string | null;
  type: string | null;
  subtype: string | null;
}

export interface ProductDraft {
  id: string;
  source: string;
  caption: string;
  status: string;
  createdAt: string;
  // Etiket fotoğrafı, data URL. Kullanılmış/silinmiş taslakta boş.
  imageUrl: string;
  // POST /api/passport/extract yanıtıyla AYNI biçim: onay ekranına olduğu
  // gibi verilir.
  outcome: ExtractOutcome;
}

// Yalnızca bekleyen (status 'new') taslaklar; fotoğraf dönmez.
export function fetchProductDrafts() {
  return request<{ drafts: ProductDraftSummary[] }>('/product-drafts');
}

// 404 'draft_not_found': taslak kullanılmış ya da silinmiş.
export function fetchProductDraft(draftId: string) {
  return request<{ draft: ProductDraft }>(`/product-drafts/${draftId}`);
}

// Taslaktan ürün kaydedildi: taslak listeden düşer, fotoğrafı sunucudan silinir.
export function markProductDraftUsed(draftId: string) {
  return request<void>(`/product-drafts/${draftId}/used`, { method: 'POST' });
}

export function dismissProductDraft(draftId: string) {
  return request<void>(`/product-drafts/${draftId}/dismiss`, { method: 'POST' });
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
  /** Sayfalama: kaçıncı sonuçtan sonrası istensin (ilk sayfada verilmez). */
  offset?: number;
}

export interface CapacitySearchPage {
  results: CapacityResult[];
  hasMore: boolean;
  nextOffset: number | null;
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
  if (params.offset) query.set('offset', String(params.offset));
  const suffix = query.toString();
  return request<CapacitySearchPage>(`/machines/search${suffix ? `?${suffix}` : ''}`);
}

// --- İplik dizini (Faz 2, Adım 6) --------------------------------------------
// Sunucu: backend/src/routes/yarns.ts. İplik bir Product satırıdır
// (type 'iplik', stockUnit 'kg') + YarnSpec. DETAY, FOTOĞRAF, FAVORİ, SİLME,
// TEKLİF ve NUMUNE uçları /api/products altındakilerle ORTAK; yalnızca liste,
// oluşturma ve güncelleme ayrıdır. `PATCH /api/products/:id` iplik için 400
// `use_yarn_endpoint` döner.

export interface YarnOption {
  key: string;
  label: string;
}

export interface YarnOptions {
  families: readonly YarnOption[];
  countUnits: readonly YarnOption[];
  spinnings: readonly YarnOption[];
  combings: readonly YarnOption[];
  filamentTypes: readonly YarnOption[];
  lusters: readonly YarnOption[];
  endUses: readonly YarnOption[];
  colorStates: readonly YarnOption[];
  sellerRoles: readonly YarnOption[];
}

export function fetchYarnOptions() {
  return request<YarnOptions>('/yarns/options');
}

// Virgülle ayrılan alanlar (family, filamentType, spinning, endUse, colorState)
// dizi olarak verilir. `countUnit` verilirse numara BİRİMDEN BAĞIMSIZ aranır
// (150 denye ≈ 167 dtex) ve tek değerde ±%4 tolerans uygulanır.
export interface YarnSearchParams {
  search?: string;
  family?: string[];
  count?: number;
  countMin?: number;
  countMax?: number;
  countUnit?: string;
  ply?: number;
  filaments?: number;
  filamentType?: string[];
  spinning?: string[];
  combing?: string;
  luster?: string;
  endUse?: string[];
  colorState?: string;
  fiber?: string[];
  certificate?: string[];
  sellerRole?: string;
  inStock?: boolean;
  companyId?: string;
  limit?: number;
  offset?: number;
}

export interface YarnSearchPage {
  yarns: Product[];
  hasMore: boolean;
  nextOffset: number | null;
}

export function yarnQueryString(params: YarnSearchParams) {
  const query = new URLSearchParams();
  const setList = (key: string, values?: string[]) => {
    const list = (values ?? []).filter(Boolean);
    if (list.length) query.set(key, list.join(','));
  };
  const setNumber = (key: string, value?: number) => {
    if (value !== undefined && Number.isFinite(value)) query.set(key, String(value));
  };
  if (params.search?.trim()) query.set('search', params.search.trim());
  setList('family', params.family);
  setNumber('count', params.count);
  setNumber('countMin', params.countMin);
  setNumber('countMax', params.countMax);
  if (params.countUnit) query.set('countUnit', params.countUnit);
  setNumber('ply', params.ply);
  setNumber('filaments', params.filaments);
  setList('filamentType', params.filamentType);
  setList('spinning', params.spinning);
  if (params.combing) query.set('combing', params.combing);
  if (params.luster) query.set('luster', params.luster);
  setList('endUse', params.endUse);
  if (params.colorState) query.set('colorState', params.colorState);
  setList('fiber', params.fiber);
  setList('certificate', params.certificate);
  if (params.sellerRole) query.set('sellerRole', params.sellerRole);
  if (params.inStock) query.set('inStock', '1');
  if (params.companyId) query.set('companyId', params.companyId);
  setNumber('limit', params.limit);
  setNumber('offset', params.offset);
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export function searchYarns(params: YarnSearchParams) {
  return request<YarnSearchPage>(`/yarns${yarnQueryString(params)}`);
}

// Sunucudaki createYarnSchema `.strict()`: bilinmeyen alan 400 döner, bu
// yüzden gövdeye yalnızca buradaki alanlar konur.
export interface NewYarnInput {
  code: string;
  stock?: number;
  family: string;
  count: number;
  countUnit: string;
  ply?: number;
  filaments?: number | null;
  spinning?: string;
  combing?: string;
  filamentType?: string;
  luster?: string;
  twistDirection?: '' | 'S' | 'Z';
  twistTpm?: number | null;
  endUses?: string[];
  colorState?: string;
  color?: string;
  variety?: string;
  origin?: string;
  brand?: string;
  coneWeightKg?: number | null;
  sellerRole?: string;
  composition?: CompositionItem[];
  certificates?: CertificateInput[];
  note?: string;
  moq?: number | null;
  leadTimeDays?: number | null;
  priceValue?: number | null;
  priceCurrency?: string;
  // data URL'ler; ilki kapak.
  images?: string[];
}

// 400 invalid_body (details.fieldErrors) · composition toplamı 100 değilse
// details.fieldErrors.composition = ['composition_total_not_100'].
export function createYarn(payload: NewYarnInput) {
  return request<{ yarn: Product }>('/yarns', { method: 'POST', body: JSON.stringify(payload) });
}

// Kısmi güncelleme: gönderilmeyen alana sunucu dokunmaz. `images` verilirse
// fotoğrafların tamamı bu liste olur (yeni data URL ya da { existing: n }).
export type UpdateYarnInput = Partial<Omit<NewYarnInput, 'images'>> & {
  images?: ProductImageInput[];
};

export function updateYarn(id: string, payload: UpdateYarnInput) {
  return request<{ yarn: Product }>(`/yarns/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

// --- İplik: etiketten doldur -------------------------------------------------
// Sunucu: `POST /api/yarns/extract` (backend/src/skills/yarnExtract). Model
// YALNIZCA okur; emin olmadığı alan boş ('' ya da null) gelir. Fiyat, stok ve
// MOQ şemada HİÇ yoktur (etikette yazsa da alınmaz). Kaydetmez, öneri döner.

export interface YarnLabelSuggestion {
  code: string;
  family: string;
  count: number | null;
  countUnit: string;
  ply: number | null;
  filaments: number | null;
  spinning: string;
  combing: string;
  filamentType: string;
  luster: string;
  twistDirection: '' | 'S' | 'Z';
  twistTpm: number | null;
  colorState: string;
  color: string;
  /** Yalnızca toplamı 100 olan karışım gelir; aksi halde boş dizi + compositionText. */
  composition: CompositionItem[];
  compositionText: string;
  variety: string;
  brand: string;
  origin: string;
  coneWeightKg: number | null;
  /** Sözlükte tanınan sertifika ANAHTARLARI; tanınmayanlar yalnızca metinde. */
  certificates: string[];
  certificatesText: string;
}

/** 'composition_total_not_100' | 'count_unit_missing' */
export type YarnLabelWarning = string;

export interface YarnLabelOutcome {
  recognized: boolean;
  confidence: number;
  suggestion: YarnLabelSuggestion;
  warnings: YarnLabelWarning[];
  notes: string;
  meta: { model: string; mock: boolean };
}

export interface YarnLabelExtractInput {
  /** data URL (image/jpeg|png|webp|gif), en çok 3 */
  images?: string[];
  /** en çok 4000 karakter */
  text?: string;
}

// Hatalar: 503 extract_not_configured · 502 extract_failed · 400
// extract_input_required / unsupported_image / invalid_body.
export function extractYarnLabel(input: YarnLabelExtractInput) {
  return request<YarnLabelOutcome>(
    '/yarns/extract',
    { method: 'POST', body: JSON.stringify(input) },
    // Model çağrısı 3-10 sn sürebiliyor; model uçlarındaki uzun zaman aşımı.
    LLM_REQUEST_TIMEOUT_MS
  );
}

// --- Karşılıklı referanslar (Faz 2, Adım 7) ----------------------------------
// Sunucu: backend/src/routes/references.ts. Bir firma diğerini "müşterimiz" ya
// da "tedarikçimiz" olarak gösterir; karşı taraf onaylayınca iki firmanın
// sayfasında birden görünür. Onaylanmamış referansı yalnızca iki taraf görür.

export type ReferenceRelation = 'musteri' | 'tedarikci';
export type ReferenceStatus = 'pending' | 'confirmed' | 'rejected';

export interface CompanyReference {
  id: string;
  status: ReferenceStatus;
  /** given: sayfası görüntülenen firma bu referansı verdi; received: karşı taraf verdi. */
  direction: 'given' | 'received';
  /** DİKKAT: ilişki sayfası görüntülenen firmaya göredir (karşı tarafın rolü). */
  relation: ReferenceRelation;
  company: {
    id: string;
    name: string;
    city: string;
    verification: VerificationStatus;
    logoUpdatedAt: string | null;
  };
  note: string;
  createdAt: string;
  respondedAt: string | null;
}

export interface CompanyReferences {
  references: CompanyReference[];
  /** Yalnızca kendi firmanızda dolu gelir. */
  pendingIncoming: CompanyReference[];
  pendingOutgoing: CompanyReference[];
  confirmedCount: number;
}

// Oturumsuz da çalışır: başkasının sayfasında yalnızca onaylılar döner.
export function fetchCompanyReferences(companyId: string) {
  return request<CompanyReferences>(`/references/company/${companyId}`);
}

// --- Güven özeti (Faz 3, Adım 5) -------------------------------------------
// TEK PUAN YOK: yalnızca bileşenler döner. Ödeme ile ilgili hiçbir ölçüt yok.
// Verisi az olan firma cezalandırılmaz: eşik altındaki oran/ortalama `null`
// gelir ve ekranda uyarı rengiyle değil nötr "yeterli veri yok" metniyle geçer.
export interface CompanyTrustRatings {
  quality?: number | null;
  timing?: number | null;
  communication?: number | null;
  seriousness?: number | null;
}

export interface CompanyTrust {
  company: { id: string; name: string };
  verification: { status: VerificationStatus; level: '' | 'belge' | 'ziyaret'; verifiedAt: string | null };
  memberSince: string;
  confirmedReferenceCount: number;
  asSeller: {
    completedDeals: number;
    onTimeRate: number | null;
    reviewCount: number;
    ratings: CompanyTrustRatings | null;
  };
  asBuyer: {
    completedDeals: number;
    reviewCount: number;
    ratings: CompanyTrustRatings | null;
  };
  quoteResponse: { requestCount: number; responseRate: number; medianHours: number | null } | null;
  thresholds: { deals: number; reviews: number; requests: number };
  method: string;
}

// Oturumsuz çalışır (firma sayfasındaki "Güven özeti" kartı). 404 company_not_found.
export function fetchCompanyTrust(companyId: string) {
  return request<{ trust: CompanyTrust }>(`/trust/company/${companyId}`);
}

// 400 own_company · 403 no_company · 409 already_exists (gövdede `status`) ·
// 409 too_many_references.
export function createReference(input: { toCompanyId: string; relation: ReferenceRelation; note?: string }) {
  return request<{ reference: CompanyReference }>('/references', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function respondToReference(id: string, action: 'confirm' | 'reject') {
  return request<{ reference: CompanyReference }>(`/references/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

// İki taraf da kaldırabilir (bekleyen isteği geri çekmek de budur).
export function deleteReference(id: string) {
  return request<void>(`/references/${id}`, { method: 'DELETE' });
}

// --- Anonim fiyat / termin endeksi (Faz 3, Adım 6) --------------------------
// Kaynak GÖNDERİLMİŞ tekliflerdir. Anonimlik sıkı: yalnızca çeyrekler döner,
// tek tek teklif / firma / en düşük-en yüksek değer ASLA gelmez. Eşik altında
// `available: false` gelir ve hiçbir sayı taşınmaz. Fiyatlar kg başınadır ve
// para birimi çevrilmez. OTURUM ŞART (oturumsuz 401).
export interface PriceIndexTriple {
  p25: number;
  median: number;
  p75: number;
}

export interface PriceIndexBand {
  currency: string;
  unit: 'kg';
  price: PriceIndexTriple;
  leadTimeDays: PriceIndexTriple | null;
  sampleSize: string;
  // Yalnızca kendi teklifi kümede olan SATICIYA gelir; başkasına null.
  myPosition: 'below' | 'within' | 'above' | null;
}

export interface PriceIndex {
  cluster: { label: string; windowDays: number };
  available: boolean;
  bands: PriceIndexBand[];
  rules: { minSellers: number; minQuotes: number };
  note: string;
}

export function fetchPriceIndex(productId: string) {
  return request<PriceIndex>(`/price-index/product/${productId}`);
}

// --- Davetler (Faz 2, Adım 4) ------------------------------------------------
// "Tedarikçini / müşterini davet et". Platform SMS GÖNDERMEZ: sunucu hazır bir
// paylaşım metni (`shareText`) üretir, kullanıcı onu kendi WhatsApp'ından yollar.
// Davette telefon yazılıysa ve kayıt olan numara aynıysa iki kişi DOĞRUDAN
// bağlantılı olur; aksi halde davet edene bekleyen bağlantı isteği düşer.

export type InviteRelation = '' | 'tedarikci' | 'musteri';

export interface Invite {
  id: string;
  code: string;
  name: string;
  phone: string;
  relation: InviteRelation;
  note: string;
  status: 'pending' | 'joined';
  joinCount: number;
  createdAt: string;
  joinedAt: string | null;
  joinedUser: { id: string; firstName: string; lastName: string } | null;
  url: string;
  // Paylaşılacak HAZIR metin: içinde kayıt bağlantısı ve davet kodu var.
  shareText: string;
}

export interface InvitePreview {
  code: string;
  inviterName: string;
  inviterCompany: string | null;
  relation: InviteRelation;
}

export function fetchInvites() {
  return request<{ invites: Invite[]; joinedCount: number; dailyLimit: number }>('/invites');
}

// Aynı numaraya bekleyen davet varsa sunucu 200 + reused:true ile var olanı döner.
export function createInvite(input: { name?: string; phone?: string; relation?: InviteRelation; note?: string }) {
  return request<{ invite: Invite; reused: boolean }>('/invites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function cancelInvite(id: string) {
  return request<void>(`/invites/${id}`, { method: 'DELETE' });
}

// Oturumsuz: davet bağlantısıyla gelen kişiye "kim davet etti" karşılaması.
export function fetchInviteByCode(code: string) {
  return request<{ invite: InvitePreview }>(`/invites/code/${encodeURIComponent(code)}`);
}

export type CompanyWithCounts = Company & { _count: { users: number; products: number } };

export function fetchAdminCompanies() {
  return request<{ companies: CompanyWithCounts[] }>('/admin/companies');
}

// level yalnızca verification === 'dogrulanmis' iken anlamlı; doğrulama geri
// alınınca sunucu düzeyi kendisi temizler (Faz 2, Adım 7).
export function updateCompanyVerification(
  companyId: string,
  verification: Company['verification'],
  level?: '' | 'belge' | 'ziyaret'
) {
  return request<{ company: Company }>(`/admin/companies/${companyId}/verification`, {
    method: 'PATCH',
    body: JSON.stringify(level !== undefined ? { verification, level } : { verification }),
  });
}
