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
import { usersRouter } from './routes/users';
import { adminRouter } from './routes/admin';
import { whatsappWebhookRouter } from './routes/whatsappWebhook';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' })); // fotoğraf yükleme (base64) için

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/register', registerRouter);
app.use('/api/products', productsRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/advisor', advisorRouter);
app.use('/api/sample-requests', sampleRequestsRouter);
app.use('/api/garment-analysis', garmentAnalysisRouter);
app.use('/api/otp', otpRouter);
app.use('/api/me', meRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/whatsapp/webhook', whatsappWebhookRouter);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Avedon API listening on http://localhost:${port}`);
});
