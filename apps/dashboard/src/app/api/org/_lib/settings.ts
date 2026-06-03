import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { BadRequestError } from '@/lib/api/errors';
import type { OrgSettings } from '@/types';

const ALLOWED_SETTINGS_UNSET = new Set([
  'requireApprovalForActions',
  'maxRefundAmount',
  'blockCancellations',
  'blockCustomLineItems',
  'toolsEnabled.action',
  'toolsEnabled.communication',
  'toolsEnabled.internal',
  'toolsEnabled.read',
]);

export interface VersionedOrgSnapshot {
  id: string;
  name: string;
  settings: unknown;
  updatedAt: Date;
}

export function hasVersionConflict(version: string | undefined, org: VersionedOrgSnapshot): boolean {
  return version !== undefined && version !== org.updatedAt.toISOString();
}

export function versionConflictResponse(org: VersionedOrgSnapshot): NextResponse {
  return NextResponse.json(
    {
      error: 'stale_version',
      message: 'Settings were updated elsewhere. Reload to see the latest values.',
      current: {
        id: org.id,
        name: org.name,
        settings: org.settings ?? {},
        version: org.updatedAt.toISOString(),
      },
    },
    { status: 409 },
  );
}

export function buildSettingsUpdate(
  currentSettings: unknown,
  newSettings: Partial<OrgSettings> | undefined,
  settingsUnset: unknown,
): { changed: boolean; settings: Prisma.InputJsonObject } {
  const unsetPaths = parseSettingsUnset(settingsUnset);
  const settingsChanged = newSettings !== undefined || unsetPaths.length > 0;
  const updatedSettings = mergeSettingsPatch(
    toPlainRecord(currentSettings),
    normalizeSettingsPatch(newSettings),
  );

  for (const path of unsetPaths) {
    deleteSettingPath(updatedSettings, path);
  }

  return {
    changed: settingsChanged,
    settings: toPrismaJsonObject(updatedSettings),
  };
}

function parseSettingsUnset(settingsUnset: unknown): string[] {
  const unsetPaths = settingsUnset === undefined ? [] : settingsUnset;
  if (
    !Array.isArray(unsetPaths)
    || unsetPaths.some(path => typeof path !== 'string' || !ALLOWED_SETTINGS_UNSET.has(path))
  ) {
    throw new BadRequestError('Invalid settingsUnset');
  }
  return unsetPaths;
}

function normalizeSettingsPatch(newSettings: Partial<OrgSettings> | undefined): Record<string, unknown> {
  return newSettings === undefined
    ? {}
    : JSON.parse(JSON.stringify(newSettings)) as Record<string, unknown>;
}

function toPrismaJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? { ...value } : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeSettingsPatch(
  currentSettings: Record<string, unknown>,
  newSettings: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...currentSettings };
  for (const [key, value] of Object.entries(newSettings)) {
    const currentValue = merged[key];
    merged[key] = isPlainObject(currentValue) && isPlainObject(value)
      ? { ...currentValue, ...value }
      : value;
  }
  return merged;
}

function deleteSettingPath(settings: Record<string, unknown>, path: string) {
  const [first, second] = path.split('.');
  if (!second) {
    delete settings[first];
    return;
  }

  const nested = settings[first];
  if (!isPlainObject(nested)) return;
  delete nested[second];
  if (Object.keys(nested).length === 0) delete settings[first];
}
