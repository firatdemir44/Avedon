import { Router } from 'express';
import { prisma } from '../db';
import { makeHandle } from './handle';
import { requireAuth } from '../middleware/auth';
import { createDirectUpload, isStreamConfigured } from '../stream';
import { VIDEO_SELECT, toVideoRow } from '../videoFields';
import {
  MAX_PENDING_UPLOADS_PER_HOUR,
  MAX_VIDEO_SECONDS,
  createPlaybackUrls,
  deleteVideoCompletely,
  loadViewableVideo,
  refreshVideoStatus,
} from '../videos';

export const videosRouter = Router();
videosRouter.use(requireAuth);

const handle = makeHandle('videos');

// Telefonun videoyu doğrudan Cloudflare'e yükleyeceği tek kullanımlık adres.
videosRouter.post(
  '/upload-url',
  handle(async (req, res) => {
    if (!isStreamConfigured()) {
      return res.status(503).json({ error: 'video_not_configured' });
    }

    const recentPending = await prisma.video.count({
      where: {
        ownerId: req.user!.id,
        status: 'uploading',
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentPending >= MAX_PENDING_UPLOADS_PER_HOUR) {
      return res.status(429).json({ error: 'too_many_pending_uploads' });
    }

    const { uid, uploadURL } = await createDirectUpload({
      maxDurationSeconds: MAX_VIDEO_SECONDS,
      meta: { ownerId: req.user!.id },
    });

    const video = await prisma.video.create({
      data: { ownerId: req.user!.id, streamUid: uid },
      select: VIDEO_SELECT,
    });

    res.status(201).json({ video: toVideoRow(video), uploadURL, maxDurationSeconds: MAX_VIDEO_SECONDS });
  })
);

videosRouter.get(
  '/:id',
  handle(async (req, res) => {
    const video = await loadViewableVideo(req.user!.id, req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'video_not_found' });
    }
    const fresh = isStreamConfigured() ? await refreshVideoStatus(video) : video;
    res.json({ video: toVideoRow(fresh) });
  })
);

// Paylaşmadan vazgeçilen (ya da ekrandan çıkılınca yarım kalan) videoyu sahibi
// siler; yoksa ücretli depoda sahipsiz kalırdı. Bir içeriğe bağlanmış video
// buradan silinmez, içeriğin kendisi silinince gider.
videosRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const video = await prisma.video.findUnique({
      where: { id: req.params.id },
      select: { ownerId: true, post: { select: { id: true } } },
    });
    if (!video || video.ownerId !== req.user!.id) {
      return res.status(404).json({ error: 'video_not_found' });
    }
    if (video.post) {
      return res.status(409).json({ error: 'video_in_use' });
    }
    await deleteVideoCompletely(req.params.id);
    res.status(204).send();
  })
);

videosRouter.get(
  '/:id/playback',
  handle(async (req, res) => {
    if (!isStreamConfigured()) {
      return res.status(503).json({ error: 'video_not_configured' });
    }
    const video = await loadViewableVideo(req.user!.id, req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'video_not_found' });
    }
    const fresh = await refreshVideoStatus(video);
    if (fresh.status !== 'ready') {
      return res.status(409).json({ error: 'video_not_ready', video: toVideoRow(fresh) });
    }
    res.json(await createPlaybackUrls(fresh));
  })
);
