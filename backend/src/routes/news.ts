import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { buildDigest, listNews } from '../news/query';
import { t } from '../i18n';
import { TOPICS, TOPIC_KEYS, type TopicKey } from '../news/topics';
import { makeHandle } from './handle';

// Sektör gündemi: günlük kişisel özet ve konu/dil süzgeçli liste. Yalnızca başlık, kısa özet, bağlantı.
export const newsRouter = Router();
newsRouter.use(requireAuth);
const handle = makeHandle('news');

newsRouter.get(
  '/digest',
  handle(async (req, res) => {
    const companyType = req.user?.company?.companyType ?? '';
    const items = await buildDigest(companyType);
    res.json({ date: new Date().toISOString().slice(0, 10), items: localizeItems(items, req.lang) });
  })
);

newsRouter.get(
  '/',
  handle(async (req, res) => {
    const topic = typeof req.query.topic === 'string' && TOPIC_KEYS.includes(req.query.topic as TopicKey) ? req.query.topic : undefined;
    const lang = req.query.lang === 'tr' || req.query.lang === 'en' ? req.query.lang : undefined;
    const pageNum = Number(req.query.page);
    const page = Number.isInteger(pageNum) && pageNum > 0 && pageNum < 1000 ? pageNum : 1;
    const result = await listNews({ topic, lang, page });
    res.json({ ...result, items: localizeItems(result.items, req.lang), topics: TOPICS.map((x) => ({ ...x, label: t(req.lang, x.label) })) });
  })
);

// Konu etiketleri arayüz dilinde (haber başlıkları kaynağın dilinde kalır).
function localizeItems<T extends { topics: { key: string; label: string }[] }>(items: T[], lang: string | undefined): T[] {
  return items.map((i) => ({ ...i, topics: i.topics.map((x) => ({ ...x, label: t(lang, x.label) })) }));
}
