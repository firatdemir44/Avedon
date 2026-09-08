import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { sendWhatsAppTemplate } from '../whatsapp';

export const sampleRequestsRouter = Router();

const STATUS_ORDER = ['talep_edildi', 'onaylandi', 'hazirlandi', 'teslim_edildi'] as const;
const statusSchema = z.enum(STATUS_ORDER);
const STATUS_LABELS: Record<(typeof STATUS_ORDER)[number], string> = {
  talep_edildi: 'Talep Edildi',
  onaylandi: 'Onaylandı',
  hazirlandi: 'Hazırlandı',
  teslim_edildi: 'Teslim Edildi',
};

const createSchema = z.object({
  productId: z.string().min(1),
  requesterId: z.string().min(1),
  deliveryPreference: z.string().min(1),
});

sampleRequestsRouter.post('/', async (req, res) => {
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

  const sampleRequest = await prisma.sampleRequest.create({
    data: parsed.data,
    include: { product: true, requester: true },
  });

  for (const employee of product.company.users) {
    sendWhatsAppTemplate(employee.phone, [
      `${sampleRequest.requester.firstName} ${sampleRequest.requester.lastName}`,
      product.code,
    ]).catch(() => {});
  }

  res.status(201).json({ sampleRequest });
});

// requesterId: talep eden kullanıcının kendi talepleri ("Taleplerim")
// companyId: bir firmanın ürünlerine gelen talepler ("Gelen Talepler")
sampleRequestsRouter.get('/', async (req, res) => {
  const { requesterId, companyId } = req.query;

  const sampleRequests = await prisma.sampleRequest.findMany({
    where: {
      ...(typeof requesterId === 'string' ? { requesterId } : {}),
      ...(typeof companyId === 'string' ? { product: { companyId } } : {}),
    },
    include: { product: true, requester: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ sampleRequests });
});

const updateStatusSchema = z.object({ status: statusSchema });

sampleRequestsRouter.patch('/:id/status', async (req, res) => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const existing = await prisma.sampleRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'sample_request_not_found' });
  }

  const currentIndex = STATUS_ORDER.indexOf(existing.status as (typeof STATUS_ORDER)[number]);
  const nextIndex = STATUS_ORDER.indexOf(parsed.data.status);
  if (nextIndex < currentIndex) {
    return res.status(400).json({ error: 'cannot_move_status_backwards' });
  }

  const sampleRequest = await prisma.sampleRequest.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
    include: { product: true, requester: true },
  });

  sendWhatsAppTemplate(sampleRequest.requester.phone, [
    sampleRequest.product.code,
    STATUS_LABELS[parsed.data.status],
  ]).catch(() => {});

  res.json({ sampleRequest });
});
