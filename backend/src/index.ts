import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { registerRouter } from './routes/register';
import { productsRouter } from './routes/products';
import { companiesRouter } from './routes/companies';
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
import { notificationsRouter, watchRulesRouter } from './routes/notifications';
import { quotesRouter } from './routes/quotes';
import { machinesRouter } from './routes/machines';
import { referencesRouter } from './routes/references';
import { isLlmConfigured } from './llm';
import { ensureWabaSubscription, getWhatsAppStatus } from './whatsapp';
import { getStorageInfo } from './storageCheck';
import { checkStreamAccess, isStreamConfigured } from './stream';

const app = express();
app.use(cors());
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
  });
});
app.use('/api/register', registerRouter);
app.use('/api/products', productsRouter);
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
app.use('/api/passport', passportRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/watch-rules', watchRulesRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/machines', machinesRouter);
app.use('/api/references', referencesRouter);
app.use('/api/whatsapp/webhook', whatsappWebhookRouter);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Avedon API listening on http://localhost:${port}`);
  void ensureWabaSubscription();
});
