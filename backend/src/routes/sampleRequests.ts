import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { makeHandle } from './handle';
import { requireAuth } from '../middleware/auth';
import { sendWhatsAppTemplate } from '../whatsapp';
import {
  DELIVERY_MODES,
  SAMPLE_ACTOR_SELECT,
  SAMPLE_LIST_INCLUDE,
  STATUS_ORDER,
  canPerform,
  chipLabelFor,
  deliveryModeLabel,
  nextStatusFor,
  stepIndex,
  stepLabelFor,
  toListRow,
  toTimelineSteps,
  type ViewerRole,
} from '../sampleRequests';

export const sampleRequestsRouter = Router();
sampleRequestsRouter.use(requireAuth);

const handle = makeHandle('sample-requests');

function roleFor(request: { requesterId: string; product: { companyId: string } }, user: Request['user']): ViewerRole {
  return {
    isRequester: request.requesterId === user!.id,
    // companyId null ise asla eşleşmemeli.
    isSeller: !!user!.companyId && request.product.companyId === user!.companyId,
  };
}

async function loadForViewer(id: string, user: Request['user']) {
  const request = await prisma.sampleRequest.findUnique({
    where: { id },
    include: SAMPLE_LIST_INCLUDE,
  });
  if (!request) return null;

  const role = roleFor(request, user);
  if (!role.isRequester && !role.isSeller) return null;
  return { request, role };
}

const createSchema = z
  .object({
    productId: z.string().min(1),
    deliveryMode: z.enum(DELIVERY_MODES),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

sampleRequestsRouter.post(
  '/',
  handle(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      include: { company: { include: { users: true } } },
    });
    if (!product) {
      return res.status(404).json({ error: 'product_not_found' });
    }

    const created = await prisma.sampleRequest.create({
      data: {
        productId: parsed.data.productId,
        requesterId: req.user!.id,
        deliveryMode: parsed.data.deliveryMode,
        note: parsed.data.note ?? '',
        // İlk adım talebin kendisi — zaman çizelgesi hiç boş kalmasın.
        events: {
          create: { status: 'talep_edildi', actorId: req.user!.id, note: parsed.data.note ?? '' },
        },
      },
      include: SAMPLE_LIST_INCLUDE,
    });

    // Bildirim, kayıt kesinleştikten sonra (geri alınan bir işlem için müşteriye
    // mesaj gitmesin).
    for (const employee of product.company.users) {
      sendWhatsAppTemplate(employee.phone, [
        `${req.user!.firstName} ${req.user!.lastName}`,
        product.code,
      ]).catch(() => {});
    }

    res.status(201).json({ sampleRequest: toListRow(created, roleFor(created, req.user)) });
  })
);

sampleRequestsRouter.get(
  '/',
  handle(async (req, res) => {
    const as = req.query.as === 'company' ? 'company' : 'requester';

    if (as === 'company' && !req.user!.companyId) {
      return res.json({ sampleRequests: [] });
    }

    const sampleRequests = await prisma.sampleRequest.findMany({
      where:
        as === 'company'
          ? { product: { companyId: req.user!.companyId! } }
          : { requesterId: req.user!.id },
      include: SAMPLE_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      sampleRequests: sampleRequests.map((r) => toListRow(r, roleFor(r, req.user))),
    });
  })
);

sampleRequestsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const loaded = await loadForViewer(req.params.id, req.user);
    // Yetkisiz erişimde de 404: 403 dönmek id'nin var olduğunu doğrular ve
    // talep id'lerinin denenerek bulunmasına imkân verirdi.
    if (!loaded) {
      return res.status(404).json({ error: 'sample_request_not_found' });
    }
    const { request, role } = loaded;

    const events = await prisma.sampleRequestEvent.findMany({
      where: { sampleRequestId: request.id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: SAMPLE_ACTOR_SELECT } },
    });

    const next = nextStatusFor(request.status);
    const canAdvance = !!next && canPerform(next, role);

    res.json({
      sampleRequest: {
        id: request.id,
        status: request.status,
        statusLabel: chipLabelFor(request.status, request.deliveryMode),
        deliveryMode: request.deliveryMode,
        deliveryModeLabel: deliveryModeLabel(request.deliveryMode),
        note: request.note,
        createdAt: request.createdAt,
        product: request.product,
        requester: request.requester,
      },
      steps: toTimelineSteps(request, events),
      nextStep: canAdvance && next ? { status: next, label: stepLabelFor(next, request.deliveryMode) } : null,
      canAdvance,
    });
  })
);

const updateStatusSchema = z
  .object({
    status: z.enum(STATUS_ORDER),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

sampleRequestsRouter.patch(
  '/:id/status',
  handle(async (req, res) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const loaded = await loadForViewer(req.params.id, req.user);
    if (!loaded) {
      return res.status(404).json({ error: 'sample_request_not_found' });
    }
    const { request, role } = loaded;

    if (stepIndex(request.status) < 0) {
      return res.status(500).json({ error: 'invalid_stored_status' });
    }
    // Tam bir adım ileri: geri gitmek de, adım atlamak da, aynı adımı tekrar
    // işaretlemek de (mükerrer bildirim + mükerrer olay kaydı) engelleniyor.
    if (parsed.data.status !== nextStatusFor(request.status)) {
      return res.status(400).json({ error: 'invalid_status_transition' });
    }
    if (!canPerform(parsed.data.status, role)) {
      return res.status(403).json({ error: 'not_allowed_for_this_step' });
    }

    const [updated] = await prisma.$transaction([
      prisma.sampleRequest.update({
        where: { id: request.id },
        data: { status: parsed.data.status },
        include: SAMPLE_LIST_INCLUDE,
      }),
      prisma.sampleRequestEvent.create({
        data: {
          sampleRequestId: request.id,
          status: parsed.data.status,
          actorId: req.user!.id,
          note: parsed.data.note ?? '',
        },
      }),
    ]);

    // Kendi yaptığı işlem için kullanıcıya bildirim gitmesin.
    if (!role.isRequester) {
      const requester = await prisma.user.findUnique({
        where: { id: request.requesterId },
        select: { phone: true },
      });
      if (requester) {
        sendWhatsAppTemplate(requester.phone, [
          request.product.code,
          chipLabelFor(parsed.data.status, request.deliveryMode),
        ]).catch(() => {});
      }
    }

    res.json({ sampleRequest: toListRow(updated, roleFor(updated, req.user)) });
  })
);
