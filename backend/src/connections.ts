import { prisma } from './db';

export type ConnectionState =
  | { status: 'none' }
  | { status: 'pending_sent' | 'pending_received' | 'accepted'; connectionId: string };

export async function getConnectionState(viewerId: string, otherId: string): Promise<ConnectionState> {
  const connection = await prisma.connection.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: viewerId },
      ],
    },
  });

  if (!connection) {
    return { status: 'none' };
  }

  if (connection.status === 'accepted') {
    return { status: 'accepted', connectionId: connection.id };
  }

  return {
    status: connection.requesterId === viewerId ? 'pending_sent' : 'pending_received',
    connectionId: connection.id,
  };
}

export function isConnectedAccepted(state: ConnectionState): boolean {
  return state.status === 'accepted';
}
