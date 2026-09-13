import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { getConnectionState, isConnectedAccepted } from '../connections';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { company: true },
  });
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  const isSelf = req.user!.id === user.id;
  const state = isSelf ? null : await getConnectionState(req.user!.id, user.id);

  res.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      position: user.position,
      accountType: user.accountType,
      company: user.company
        ? { id: user.company.id, name: user.company.name, verification: user.company.verification }
        : null,
      ...(isSelf || (state && isConnectedAccepted(state)) ? { phone: user.phone } : {}),
    },
  });
});
