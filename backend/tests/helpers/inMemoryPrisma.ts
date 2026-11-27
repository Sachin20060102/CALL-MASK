import crypto from 'node:crypto';
import type { AppPrismaClient } from '../../src/lib/prisma.js';

type Row = Record<string, any>;

function matchesWhere(row: Row, where?: Row): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'phoneNumber_providerId' && cond && typeof cond === 'object') {
      if (row.phoneNumber !== cond.phoneNumber || row.providerId !== cond.providerId) {
        return false;
      }
      continue;
    }
    if (key === 'OR' && Array.isArray(cond)) {
      if (!cond.some((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
    const val = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gte' in cond && !(val instanceof Date && val >= cond.gte)) return false;
      if ('in' in cond && Array.isArray(cond.in) && !cond.in.includes(val)) return false;
      if ('not' in cond && val === cond.not) return false;
      if (
        'contains' in cond &&
        (typeof val !== 'string' || !val.toLowerCase().includes(String(cond.contains).toLowerCase()))
      ) {
        return false;
      }
      continue;
    }
    if (val !== cond) return false;
  }
  return true;
}

function applyOrderBy(rows: Row[], orderBy?: Row | Row[]): Row[] {
  if (!orderBy) return rows;
  const rules = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const rule of rules) {
      for (const [field, dir] of Object.entries(rule)) {
        const av = a[field];
        const bv = b[field];
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return dir === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  });
}

export class InMemoryPrisma {
  public readonly users: Row[] = [];
  public readonly refreshTokens: Row[] = [];
  public readonly telephonyProviders: Row[] = [];
  public readonly authorizedCallerIds: Row[] = [];
  public readonly destinationRestrictions: Row[] = [];
  public readonly callRecords: Row[] = [];
  public readonly callEvents: Row[] = [];
  public readonly abuseReports: Row[] = [];
  public readonly systemSettings: Row[] = [];
  public readonly auditLogs: Row[] = [];

  private id(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  }

  private createTable(rows: Row[], defaults: () => Row, attachIncludes?: (row: Row, include?: Row) => Row) {
    return {
      findUnique: async (args: { where: Row; include?: Row }) => {
        const row = rows.find((r) => {
          if (args.where.phoneNumber_providerId) {
            return (
              r.phoneNumber === args.where.phoneNumber_providerId.phoneNumber &&
              r.providerId === args.where.phoneNumber_providerId.providerId
            );
          }
          return matchesWhere(r, args.where);
        });
        if (!row) return null;
        return attachIncludes ? attachIncludes({ ...row }, args.include) : { ...row };
      },
      findFirst: async (args: { where?: Row; orderBy?: Row | Row[] } = {}) => {
        const filtered = applyOrderBy(
          rows.filter((r) => matchesWhere(r, args.where)),
          args.orderBy
        );
        return filtered[0] ? { ...filtered[0] } : null;
      },
      findMany: async (
        args: { where?: Row; orderBy?: Row | Row[]; skip?: number; take?: number; include?: Row } = {}
      ) => {
        let filtered = applyOrderBy(
          rows.filter((r) => matchesWhere(r, args.where)),
          args.orderBy
        );
        if (args.skip) filtered = filtered.slice(args.skip);
        if (args.take) filtered = filtered.slice(0, args.take);
        return filtered.map((r) => (attachIncludes ? attachIncludes({ ...r }, args.include) : { ...r }));
      },
      count: async (args: { where?: Row } = {}) => {
        return rows.filter((r) => matchesWhere(r, args.where)).length;
      },
      create: async (args: { data: Row }) => {
        const now = new Date();
        const row: Row = {
          id: this.id(),
          createdAt: now,
          updatedAt: now,
          ...defaults(),
          ...args.data,
        };
        rows.push(row);
        return { ...row };
      },
      update: async (args: { where: Row; data: Row }) => {
        const idx = rows.findIndex((r) => matchesWhere(r, args.where));
        if (idx === -1) throw new Error('Record not found');
        rows[idx] = { ...rows[idx], ...args.data, updatedAt: new Date() };
        return { ...rows[idx] };
      },
      upsert: async (args: { where: Row; update: Row; create: Row }) => {
        const idx = rows.findIndex((r) => matchesWhere(r, args.where));
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...args.update, updatedAt: new Date() };
          return { ...rows[idx] };
        }
        const now = new Date();
        const row: Row = {
          id: this.id(),
          createdAt: now,
          updatedAt: now,
          ...defaults(),
          ...args.create,
        };
        rows.push(row);
        return { ...row };
      },
      delete: async (args: { where: Row }) => {
        const idx = rows.findIndex((r) => matchesWhere(r, args.where));
        if (idx === -1) throw new Error('Record not found');
        const [removed] = rows.splice(idx, 1);
        return removed;
      },
    };
  }

  get user() {
    return this.createTable(
      this.users,
      () => ({
        role: 'USER',
        status: 'ACTIVE',
        suspensionReason: null,
        maxCallDurationSeconds: null,
        dailyCallLimit: null,
        monthlyCallQuota: null,
        defaultCallerIdId: null,
      }),
      (row, include) => {
        if (include?._count) {
          row._count = {
            callRecords: this.callRecords.filter((c) => c.userId === row.id).length,
          };
        }
        return row;
      }
    );
  }

  get refreshToken() {
    return this.createTable(
      this.refreshTokens,
      () => ({ revokedAt: null }),
      (row, include) => {
        if (include?.user) {
          row.user = this.users.find((u) => u.id === row.userId) ?? null;
        }
        return row;
      }
    );
  }

  get telephonyProvider() {
    return this.createTable(this.telephonyProviders, () => ({
      protocol: 'MOCK',
      enabled: false,
      complianceVerified: false,
      sipDomain: null,
      endpointUrl: null,
      configJson: null,
      healthStatus: 'DISABLED',
      lastHealthCheckAt: null,
    }));
  }

  get authorizedCallerId() {
    return this.createTable(
      this.authorizedCallerIds,
      () => ({
        userId: null,
        verificationStatus: 'VERIFIED',
        isGlobal: false,
        active: true,
      }),
      (row, include) => {
        if (include?.provider) {
          row.provider = this.telephonyProviders.find((p) => p.id === row.providerId) ?? null;
        }
        if (include?.user) {
          row.user = this.users.find((u) => u.id === row.userId) ?? null;
        }
        return row;
      }
    );
  }

  get destinationRestriction() {
    return this.createTable(this.destinationRestrictions, () => ({
      matchType: 'PREFIX',
      action: 'BLOCK',
      active: true,
    }));
  }

  get callRecord() {
    return this.createTable(
      this.callRecords,
      () => ({
        providerCallId: null,
        mode: 'MOCK',
        status: 'INITIATED',
        muted: false,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        durationSeconds: 0,
        terminationReason: null,
        failureCode: null,
        providerReportedCostMicros: null,
        providerCurrency: null,
      }),
      (row, include) => {
        if (include?.events) {
          row.events = applyOrderBy(
            this.callEvents.filter((e) => e.callRecordId === row.id),
            { occurredAt: 'asc' }
          );
        }
        if (include?.user) {
          row.user = this.users.find((u) => u.id === row.userId) ?? null;
        }
        if (include?.provider) {
          row.provider = this.telephonyProviders.find((p) => p.id === row.providerId) ?? null;
        }
        return row;
      }
    );
  }

  get callEvent() {
    return this.createTable(this.callEvents, () => ({
      metadataJson: null,
      occurredAt: new Date(),
    }));
  }

  get abuseReport() {
    return this.createTable(
      this.abuseReports,
      () => ({
        reportedByUserId: null,
        targetUserId: null,
        callRecordId: null,
        severity: 'MEDIUM',
        status: 'OPEN',
        resolutionNote: null,
        resolvedByAdminId: null,
      }),
      (row, include) => {
        if (include?.targetUser) {
          row.targetUser = this.users.find((u) => u.id === row.targetUserId) ?? null;
        }
        if (include?.reportedByUser) {
          row.reportedByUser = this.users.find((u) => u.id === row.reportedByUserId) ?? null;
        }
        return row;
      }
    );
  }

  get systemSetting() {
    return this.createTable(this.systemSettings, () => ({
      updatedByAdminId: null,
    }));
  }

  get auditLog() {
    return this.createTable(
      this.auditLogs,
      () => ({
        actorUserId: null,
        targetId: null,
        detailsJson: null,
        ipAddress: null,
      }),
      (row, include) => {
        if (include?.actorUser) {
          row.actorUser = this.users.find((u) => u.id === row.actorUserId) ?? null;
        }
        return row;
      }
    );
  }

  async $queryRaw() {
    return [{ 1: 1 }];
  }

  async $disconnect() {}
}

export function createInMemoryPrisma(): { raw: InMemoryPrisma; client: AppPrismaClient } {
  const raw = new InMemoryPrisma();
  return { raw, client: raw as unknown as AppPrismaClient };
}
