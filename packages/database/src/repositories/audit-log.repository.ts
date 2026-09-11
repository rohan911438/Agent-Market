import type { AuditLog, PrismaClient } from '@prisma/client';

export interface RecordAuditLogInput {
  actorType: 'wallet' | 'system' | 'admin';
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
}
