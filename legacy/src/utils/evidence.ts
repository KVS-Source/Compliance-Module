import { Prisma, PrismaClient } from '@prisma/client';

import { conflict } from './errors';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface EvidenceTarget {
  clientId: string;
  entityType: string;
  entityId: string;
}

// The core "Where is the proof?" check: is there at least one approved, active
// evidence document linked to this record for this client?
export async function hasApprovedEvidence(db: DbClient, target: EvidenceTarget): Promise<boolean> {
  const count = await db.evidenceLink.count({
    where: {
      client_id: target.clientId,
      linked_entity_type: target.entityType,
      linked_entity_id: target.entityId,
      status: 'active',
      evidence_document: {
        client_id: target.clientId,
        status: 'active',
        approval_status: 'approved',
      },
    },
  });
  return count > 0;
}

export async function assertApprovedEvidence(db: DbClient, target: EvidenceTarget): Promise<void> {
  if (!(await hasApprovedEvidence(db, target))) {
    throw conflict(
      'Approved evidence must be linked before this can be completed, approved, reviewed or closed. Where is the proof?',
    );
  }
}
