import { prisma } from './db';
import { buyersHealth } from './export/buyers/sync';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { registerRouter } from './routes/register';
import { productsRouter } from './routes/products';
import { catalogImportRouter } from './routes/catalogImport';
import { productVideosRouter } from './routes/productVideos';
import { companiesRouter } from './routes/companies';
import { productionRouter } from './routes/production';
import { advisorRouter } from './routes/advisor';
import { sampleRequestsRouter } from './routes/sampleRequests';
import { garmentAnalysisRouter } from './routes/garmentAnalysis';
import { otpRouter } from './routes/otp';
import { meRouter } from './routes/me';
import { connectionsRouter } from './routes/connections';
import { conversationsRouter } from './routes/conversations';
import { postsRouter } from './routes/posts';
import { usersRouter } from './routes/users';
import { adminRouter } from './routes/admin';
import { whatsappWebhookRouter } from './routes/whatsappWebhook';
import { videosRouter } from './routes/videos';
import { passportRouter } from './routes/passport';
import { skillsRouter } from './routes/skills';
import { assistantRouter } from './routes/assistant';
import { speechStatus } from './speechToText';
import { relevanceStatus } from './feedRules';
import { startDigestScheduler } from './assistantReport';
import { seedDirectoryFromFiles } from './directorySeed';
import { langMiddleware } from './i18n';
import { notificationsRouter, watchRulesRouter } from './routes/notifications';
import { quotesRouter } from './routes/quotes';
import { machinesRouter } from './routes/machines';
import { referencesRouter } from './routes/references';
import { yarnsRouter } from './routes/yarns';
import { rfqsRouter } from './routes/rfqs';
import { tendersRouter } from './routes/tenders';
import { exportRadarRouter } from './routes/exportRadar';
import { publicSampleSetsRouter, sampleSetsRouter } from './routes/sampleSets';
import { adminDirectoryRouter, directoryRouter } from './routes/directory';
import { backfillNormalizedNames } from './directory';
import { looksRouter } from './routes/looks';
import { dppRouter } from './routes/dpp';
import { dealsRouter } from './routes/deals';
import { trustRouter } from './routes/trust';
import { priceIndexRouter } from './routes/priceIndex';
import { searchRouter } from './routes/search';
import { productDraftsRouter } from './routes/productDrafts';
import { invitesRouter } from './routes/invites';
import { newsRouter } from './routes/news';
import { fxRouter } from './routes/fx';
import { fxHealth, startFxScheduler } from './fx';
import { newsHealth, startNewsScheduler } from './news/fetch';
import { isLlmConfigured } from './llm';
import { ensureWabaSubscription, getWhatsAppStatus } from './whatsapp';
import { loadActivePhoneNumber } from './whatsappNumbers';
import { countDuplicatePhoneGroups, normalizeStoredPhones } from './phoneNormalize';
import { smsStatus } from './sms';
import { pushStatus } from './push';
import { pushRouter } from './routes/push';
import { adminVerificationRouter, verificationRouter } from './routes/verification';
import { backfillLooksInBackground } from './looks';
import { getAnthropic, isLlmMock } from './llm';
import { getStorageInfo } from './storageCheck';
import { ttsStatus } from './textToSpeech';
import { texartRouter } from './routes/texart';
import { startTexartWorker, texartHealth } from './texart/queue';
import { storeStatus as texartStoreStatus } from './texart/store';
import { checkStreamAccess, isStreamConfigured } from './stream';

const app = express();
app.use(cors());
// Dil: X-Lang başlığı → req.lang (hata açıklamaları ve asistan bu dilde).
app.use(langMiddleware);
// limit: fotoğraf yükleme (base64). verify: WhatsApp webhook imzası ham gövde
// üzerinden doğrulanır (routes/whatsappWebhook.ts), o yüzden gövde saklanır.
app.use(
  express.json({
    limit: '15mb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// `storage`: canlıda verinin kalıcı diske gidip gitmediği (bkz. storageCheck.ts).
// `commit`: canlıda hangi sürümün çalıştığı — Render başarısız yayında eski
// sürümü açık tutuyor, "status: ok" tek başına yeni kodu kanıtlamıyor.
// `video`: Cloudflare anahtarları girilmiş mi ve gerçekten çalışıyor mu (bkz.
// stream.ts checkStreamAccess). Gizli bilgi dönmez, yalnızca durum.
app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
    storage: getStorageInfo(),
    video: { configured: isStreamConfigured(), ...(await checkStreamAccess()) },
    // Asistan / etiket okuma / danışman: Anthropic anahtarı var mı (Faz 1, Adım 5).
    assistant: { configured: isLlmConfigured() },
    // WhatsApp → asistan (Adım 7): anahtarlar girilmiş mi, webhook doğrulandı mı, son gelen mesaj.
    whatsapp: getWhatsAppStatus(),
    // SMS ile doğrulama kodu (Adım 8): anahtarlar, başlık, hesap erişimi ve kalan kredi, son gönderim.
    sms: await smsStatus(),
    push: await pushStatus(),
    // Asistana sesli soru: Workers AI (Whisper) anahtarı girilmiş mi, token geçerli mi.
    speech: await speechStatus(),
    // Asistanın doğal sesi (Google Chirp 3 HD): anahtar okunuyor mu, ses üretebiliyor mu (değer dönmez).
    tts: await ttsStatus().catch(() => null),
    // Firma rehberi: toplam ve sahipsiz (birlik listelerinden) firma sayısı.
    directory: { companies: await prisma.company.count(), unclaimed: await prisma.company.count({ where: { claimed: false } }) },
    // Akış içerik denetimi (tekstille ilgisiz genel paylaşımı engeller).
    feedModeration: await relevanceStatus(),
    // Dünyayı Keşfet B: aday alıcı kayıt sayıları, son eşitleme, BK anahtarı var mı (değeri dönmez).
    buyers: await buyersHealth().catch(() => null),
    // Sektör gündemi: kayıtlı haber sayısı, son çekim, kaynak başına durum.
    news: await newsHealth().catch(() => null),
    fx: await fxHealth().catch(() => null),
    // Çift hesap: aynı telefonun farklı yazımıyla açılmış hesap grupları (Yönetim > Çift hesaplar).
    // Takyon Texart: iş sayıları ve saklama klasörü yazılabilir mi.
    texart: { ...(await texartHealth().catch(() => null)), store: await texartStoreStatus() },
    users: { phoneDuplicateGroups: await countDuplicatePhoneGroups().catch(() => null) },
  });
});
app.use('/api/register', registerRouter);
app.use('/api/products/import', catalogImportRouter);
app.use('/api/products', productVideosRouter);
app.use('/api/products', productsRouter);
app.use('/api/companies', productionRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/advisor', advisorRouter);
app.use('/api/sample-requests', sampleRequestsRouter);
app.use('/api/garment-analysis', garmentAnalysisRouter);
app.use('/api/otp', otpRouter);
app.use('/api/me', meRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/videos', videosRouter);
app.use('/api/push', pushRouter);
app.use('/api/verification', verificationRouter);
app.use('/api/admin/verification-requests', adminVerificationRouter);
app.use('/api/passport', passportRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/watch-rules', watchRulesRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/machines', machinesRouter);
app.use('/api/references', referencesRouter);
app.use('/api/yarns', yarnsRouter);
app.use('/api/rfqs', rfqsRouter);
app.use('/api/tenders', tendersRouter);
app.use('/api/directory', directoryRouter);
app.use('/api/export', sampleSetsRouter);
app.use('/api/export', exportRadarRouter);
app.use('/api/public/sample-sets', publicSampleSetsRouter);
app.use('/api/admin/directory', adminDirectoryRouter);
app.use('/api/looks', looksRouter);
app.use('/api/dpp', dppRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/trust', trustRouter);
app.use('/api/price-index', priceIndexRouter);
app.use('/api/search', searchRouter);
app.use('/api/product-drafts', productDraftsRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/news', newsRouter);
app.use('/api/fx', fxRouter);
app.use('/api/texart', texartRouter);
app.use('/api/whatsapp/webhook', whatsappWebhookRouter);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Takyon API listening on http://localhost:${port}`);
  // Aktif WhatsApp numarası (yönetici ayarı) önce yüklenir; teşhis doğru numarayı yoklasın.
  // Telefon numaraları kanonik biçime (phone.ts); çakışanlara dokunulmaz, yönetici birleştirir.
  void normalizeStoredPhones()
    .then((r) => console.log('[phone] normalizasyon', r))
    .catch((err) => console.error('[phone] normalizasyon hatası', err));
  void loadActivePhoneNumber().then(() => ensureWabaSubscription());
  // Faz 3 Adım 3: fotoğrafı olup görünüm kartı olmayan ürünler (gerçek model varsa) doldurulur.
  if (!isLlmMock() && getAnthropic()) backfillLooksInBackground();
  // Haftalık asistan raporu bildirimi (pazartesi 09:00 sonrası, firma başına bir kez).
  startDigestScheduler();
  // Sektör gündemi: RSS kaynakları 2 saatte bir (ilk çekim açılıştan 2 dk sonra).
  startNewsScheduler();
  startFxScheduler();
  void startTexartWorker()
    .then((n) => n && console.log('[texart] kuyruğa geri alınan iş', n))
    .catch((err) => console.error('[texart] başlatma', err));
  backfillNormalizedNames()
    .then(() => seedDirectoryFromFiles())
    .catch((err) => console.error('[directory] backfill/seed', err));
});
