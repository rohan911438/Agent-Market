import type { AuditLog, PrismaClient } from '@prisma/client';

export interface RecordAuditLogInput {
  actorType: 'wallet' | 'system' | 'admin' | 'provider_account';
  actorId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export class AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  record(input: RecordAuditLogInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        userId: input.userId,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      },
    });
  }

  /** Backs the trust score's publish-success-rate signal (see services/trust-score.ts). */
  countByActorAndAction(actorId: string, action: string): Promise<number> {
    return this.prisma.auditLog.count({ where: { actorId, action } });
  }
}
