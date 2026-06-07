import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import {
  AGENT_SETTINGS_DEFAULTS,
  OrgSettingsValidationError,
  isValidBusinessHoursWindow,
  normalizeStoredOrgSettings,
  parseOrgSettingsPatch,
  type OrgSettingsPatch,
} from '@shopkeeper/agent/settings';
import { BadRequestError } from '@/lib/api/errors';

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

const ORG_PATCH_KEYS = new Set(['name', 'settings', 'settingsUnset', 'version']);

export interface VersionedOrgSnapshot {
  id: string;
  name: string;
  settings: unknown;
  updatedAt: Date;
}

export interface OrgPatchBody {
  name?: string;
  settings?: OrgSettingsPatch;
  settingsUnset: string[];
  version?: string;
}

export function hasVersionConflict(version: string | undefined, org: VersionedOrgSnapshot): boolean {
  return version !== undefined && version !== org.updatedAt.toISOString();
}

export function parseOrgPatchBody(value: unknown): OrgPatchBody {
  if (!isPlainObject(value)) {
    throw new BadRequestError('Invalid request body');
  }
  const unknownKey = Object.keys(value).find(key => !ORG_PATCH_KEYS.has(key));
  if (unknownKey) {
    throw new BadRequestError('Invalid request body', [{
      code: 'unknown_field',
      field: unknownKey,
      message: 'Unknown field',
    }]);
  }
  if (value.name !== undefined && typeof value.name !== 'string') {
    throw new BadRequestError('Invalid name');
  }
  if (value.version !== undefined && typeof value.version !== 'string') {
    throw new BadRequestError('Invalid version');
  }

  let settings: OrgSettingsPatch | undefined;
  if (value.settings !== undefined) {
    try {
      settings = parseOrgSettingsPatch(value.settings);
    } catch (error) {
      if (!(error instanceof OrgSettingsValidationError)) throw error;
      throw new BadRequestError(
        'Invalid settings',
        error.issues.map(issue => ({
          code: 'invalid_setting',
          field: issue.path,
          message: issue.message,
        })),
      );
    }
  }

  return {
    ...(value.name !== undefined ? { name: value.name } : {}),
    ...(settings !== undefined ? { settings } : {}),
    settingsUnset: parseSettingsUnset(value.settingsUnset),
    ...(value.version !== undefined ? { version: value.version } : {}),
  };
}

export function versionConflictResponse(org: VersionedOrgSnapshot): NextResponse {
  return NextResponse.json(
    {
      error: 'stale_version',
      message: 'Settings were updated elsewhere. Reload to see the latest values.',
      current: {
        id: org.id,
        name: org.name,
        settings: normalizeStoredOrgSettings(org.settings),
        version: org.updatedAt.toISOString(),
      },
    },
    { status: 409 },
  );
}

export function buildSettingsUpdate(
  currentSettings: unknown,
  newSettings: OrgSettingsPatch | undefined,
  settingsUnset: string[],
): { changed: boolean; settings: Prisma.InputJsonObject } {
  const settingsChanged = newSettings !== undefined || settingsUnset.length > 0;
  const updatedSettings = mergeSettingsPatch(
    toPlainRecord(normalizeStoredOrgSettings(currentSettings)),
    toPlainRecord(newSettings),
  );

  for (const path of settingsUnset) {
    deleteSettingPath(updatedSettings, path);
  }

  validateBusinessHoursWindow(updatedSettings);

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

function validateBusinessHoursWindow(settings: Record<string, unknown>): void {
  if (settings.businessHoursEnabled !== true) return;
  const start = typeof settings.businessHoursStart === 'number'
    ? settings.businessHoursStart
    : AGENT_SETTINGS_DEFAULTS.businessHoursStart;
  const end = typeof settings.businessHoursEnd === 'number'
    ? settings.businessHoursEnd
    : AGENT_SETTINGS_DEFAULTS.businessHoursEnd;
  if (isValidBusinessHoursWindow(start, end)) return;
  throw new BadRequestError('Invalid settings', [{
    code: 'invalid_setting',
    field: 'businessHoursEnd',
    message: 'Opening and closing times must be different',
  }]);
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
