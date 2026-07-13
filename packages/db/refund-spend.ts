import type { Prisma, RefundSpendReservation } from '@prisma/client';
import { db } from './index.js';
import { utcDayString } from './llm-spend.js';

// Postgres-backed daily refund-cap counter. Dashboard and gateway both call
// these so the per-org refund cap is enforced against one shared total instead
// of two separate Redis instances. Amounts are integer cents.

export async function getDailyRefundSpendCents(
  orgId: string,
  day: string = utcDayString(),
): Promise<number> {
  const row = await db.refundDailySpend.findUnique({
    where: { organizationId_day: { organizationId: orgId, day } },
    select: { spentCents: true },
  });
  return row?.spentCents ?? 0;
}

export async function incrementDailyRefundSpendCents(
  orgId: string,
  cents: number,
  day: string = utcDayString(),
): Promise<void> {
  const delta = Math.round(cents);
  if (!Number.isFinite(delta) || delta <= 0) return;
  await db.refundDailySpend.upsert({
    where: { organizationId_day: { organizationId: orgId, day } },
    create: { organizationId: orgId, day, spentCents: delta },
    update: { spentCents: { increment: delta } },
  });
}

export interface ReserveDailyRefundSpendParams {
  orgId: string;
  operationKey: string;
  tool: string;
  input: Prisma.InputJsonValue;
  requestedCents: number;
  capCents?: number | null;
  day?: string;
}

export type ReserveDailyRefundSpendResult =
  | {
      kind: 'reserved';
      reservation: RefundSpendReservation;
    }
  | {
      kind: 'duplicate';
      reservation: RefundSpendReservation;
    }
  | {
      kind: 'blocked';
      spentCents: number;
      heldCents: number;
      remainingCents: number;
    };

type RefundSpendTransaction = Pick<
  typeof db,
  'refundDailySpend' | 'refundSpendReservation' | '$executeRaw' | '$queryRaw'
>;

function positiveCents(value: number, field: string): number {
  const cents = Math.round(value);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 2_147_483_647) {
    throw new RangeError(`${field} must be a positive 32-bit integer number of cents.`);
  }
  return cents;
}

function optionalCapCents(value: number | null | undefined): number | null {
  if (value == null) return null;
  const cents = Math.round(value);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 2_147_483_647) {
    throw new RangeError('capCents must be a non-negative 32-bit integer number of cents.');
  }
  return cents;
}

function validateReservationIdentity(operationKey: string, tool: string): void {
  if (!operationKey || operationKey.length > 255) {
    throw new RangeError('operationKey must contain 1 to 255 characters.');
  }
  if (!tool || tool.length > 64) {
    throw new RangeError('tool must contain 1 to 64 characters.');
  }
}

function canonicalJsonValue(value: Prisma.JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonicalJsonValue(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJsonValue(value[key] as Prisma.JsonValue)}`
  )).join(',')}}`;
}

function canonicalJson(value: Prisma.JsonValue | Prisma.InputJsonValue): string {
  return canonicalJsonValue(JSON.parse(JSON.stringify(value)) as Prisma.JsonValue);
}

async function lockDailySpendRow(
  tx: RefundSpendTransaction,
  orgId: string,
  day: string,
): Promise<{ spentCents: number }> {
  // Prisma's read-then-create upsert can surface P2002 when two transactions
  // initialize the same organization/day concurrently. Let PostgreSQL perform
  // the conflict-free initialization so both callers proceed to the same row
  // lock and the cap decision remains serialized.
  await tx.$executeRaw`
    INSERT INTO "refund_daily_spend" (
      "id",
      "organization_id",
      "day",
      "spent_cents",
      "updated_at"
    )
    VALUES (gen_random_uuid(), ${orgId}::uuid, ${day}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("organization_id", "day") DO NOTHING
  `;
  const rows = await tx.$queryRaw<Array<{ spentCents: number }>>`
    SELECT "spent_cents" AS "spentCents"
    FROM "refund_daily_spend"
    WHERE "organization_id" = ${orgId}::uuid
      AND "day" = ${day}
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new Error('Daily refund spend row disappeared while acquiring its budget lock.');
  }
  return rows[0];
}

// Serializes budget decisions on the per-org/day spend row. The provider call
// happens only after this transaction commits, so concurrent dashboard/gateway
// workers cannot both observe the same remaining capacity.
export async function reserveDailyRefundSpend(
  params: ReserveDailyRefundSpendParams,
): Promise<ReserveDailyRefundSpendResult> {
  validateReservationIdentity(params.operationKey, params.tool);
  const requestedCents = positiveCents(params.requestedCents, 'requestedCents');
  const capCents = optionalCapCents(params.capCents);
  const day = params.day ?? utcDayString();

  return db.$transaction(async (tx) => {
    const spend = await lockDailySpendRow(tx, params.orgId, day);
    const existing = await tx.refundSpendReservation.findUnique({
      where: {
        organizationId_day_operationKey: {
          organizationId: params.orgId,
          day,
          operationKey: params.operationKey,
        },
      },
    });
    if (existing) {
      if (
        existing.tool !== params.tool
        || existing.reservedCents !== requestedCents
        || canonicalJson(existing.input) !== canonicalJson(params.input)
      ) {
        throw new Error('Refund spend operation identity was reused with different tool input.');
      }
      return { kind: 'duplicate' as const, reservation: existing };
    }

    const active = await tx.refundSpendReservation.aggregate({
      where: {
        organizationId: params.orgId,
        day,
        status: { in: ['reserved', 'unknown'] },
      },
      _sum: { reservedCents: true },
    });
    const heldCents = active._sum.reservedCents ?? 0;
    if (capCents !== null && spend.spentCents + heldCents + requestedCents > capCents) {
      return {
        kind: 'blocked' as const,
        spentCents: spend.spentCents,
        heldCents,
        remainingCents: Math.max(0, capCents - spend.spentCents - heldCents),
      };
    }

    const reservation = await tx.refundSpendReservation.create({
      data: {
        organizationId: params.orgId,
        day,
        operationKey: params.operationKey,
        tool: params.tool,
        input: params.input,
        reservedCents: requestedCents,
      },
    });
    return { kind: 'reserved' as const, reservation };
  });
}

async function loadReservationForUpdate(
  tx: RefundSpendTransaction,
  reservationId: string,
): Promise<RefundSpendReservation> {
  const initial = await tx.refundSpendReservation.findUniqueOrThrow({
    where: { id: reservationId },
  });
  await lockDailySpendRow(tx, initial.organizationId, initial.day);
  return tx.refundSpendReservation.findUniqueOrThrow({ where: { id: reservationId } });
}

export async function commitDailyRefundSpendReservation(
  reservationId: string,
  committedCentsValue: number,
): Promise<RefundSpendReservation> {
  const committedCents = positiveCents(committedCentsValue, 'committedCents');
  return db.$transaction(async (tx) => {
    const reservation = await loadReservationForUpdate(tx, reservationId);
    if (reservation.status === 'committed') {
      if (reservation.committedCents !== committedCents) {
        throw new Error('Refund spend reservation was committed with a different amount.');
      }
      return reservation;
    }
    if (reservation.status === 'released') {
      throw new Error('Released refund spend reservation cannot be committed.');
    }

    const resolvedAt = new Date();
    const updated = await tx.refundSpendReservation.updateMany({
      where: { id: reservation.id, status: { in: ['reserved', 'unknown'] } },
      data: {
        status: 'committed',
        committedCents,
        resolvedAt,
        lastError: null,
      },
    });
    if (updated.count !== 1) {
      throw new Error('Refund spend reservation changed while it was being committed.');
    }
    await tx.refundDailySpend.update({
      where: {
        organizationId_day: {
          organizationId: reservation.organizationId,
          day: reservation.day,
        },
      },
      data: { spentCents: { increment: committedCents } },
    });
    return tx.refundSpendReservation.findUniqueOrThrow({ where: { id: reservation.id } });
  });
}

export async function releaseDailyRefundSpendReservation(
  reservationId: string,
  reason?: string,
): Promise<RefundSpendReservation> {
  return db.$transaction(async (tx) => {
    const reservation = await loadReservationForUpdate(tx, reservationId);
    if (reservation.status === 'released' || reservation.status === 'committed') {
      return reservation;
    }
    return tx.refundSpendReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'released',
        resolvedAt: new Date(),
        lastError: reason ?? null,
      },
    });
  });
}

export async function markDailyRefundSpendReservationUnknown(
  reservationId: string,
  reason: string,
): Promise<RefundSpendReservation> {
  await db.refundSpendReservation.updateMany({
    where: { id: reservationId, status: 'reserved' },
    data: { status: 'unknown', lastError: reason },
  });
  return db.refundSpendReservation.findUniqueOrThrow({ where: { id: reservationId } });
}
