import { db } from './index.js';

export type ShipmentWatchIssueType = 'exception' | 'stalled';
export type ShipmentWatchStatus = 'open' | 'plan_pushed' | 'skipped';

export interface RecordShipmentWatchParams {
  organizationId: string;
  threadId: string | null;
  orderId: string;
  trackingNumber: string;
  trackingCompany: string | null;
  issueType: ShipmentWatchIssueType;
  issueSummary: string | null;
}

export interface ShipmentWatchHandle {
  id: string;
  status: ShipmentWatchStatus;
}

export async function recordShipmentWatch(params: RecordShipmentWatchParams): Promise<string> {
  const row = await db.shipmentWatch.upsert({
    where: {
      organizationId_trackingNumber: {
        organizationId: params.organizationId,
        trackingNumber: params.trackingNumber,
      },
    },
    create: {
      organizationId: params.organizationId,
      threadId: params.threadId,
      orderId: params.orderId,
      trackingNumber: params.trackingNumber,
      trackingCompany: params.trackingCompany,
      issueType: params.issueType,
      issueSummary: params.issueSummary,
      detectedAt: new Date(),
    },
    update: {
      threadId: params.threadId ?? undefined,
      orderId: params.orderId,
      trackingCompany: params.trackingCompany,
      issueType: params.issueType,
      issueSummary: params.issueSummary,
    },
    select: { id: true, status: true },
  });
  return row.id;
}

export async function getShipmentWatch(
  organizationId: string,
  trackingNumber: string,
): Promise<ShipmentWatchHandle | null> {
  const row = await db.shipmentWatch.findUnique({
    where: {
      organizationId_trackingNumber: {
        organizationId,
        trackingNumber,
      },
    },
    select: { id: true, status: true },
  });
  return row;
}

export function isTerminalShipmentWatchStatus(status: ShipmentWatchStatus): boolean {
  return status === 'plan_pushed' || status === 'skipped';
}

export async function markShipmentWatchPlanPushed(
  watchId: string,
  organizationId: string,
): Promise<boolean> {
  const updated = await db.shipmentWatch.updateMany({
    where: { id: watchId, organizationId, status: 'open' },
    data: {
      status: 'plan_pushed',
      planPushedAt: new Date(),
    },
  });
  return updated.count === 1;
}

export async function markShipmentWatchSkipped(
  watchId: string,
  organizationId: string,
): Promise<boolean> {
  const updated = await db.shipmentWatch.updateMany({
    where: { id: watchId, organizationId, status: 'open' },
    data: { status: 'skipped' },
  });
  return updated.count === 1;
}
