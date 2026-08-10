import { NextResponse } from 'next/server';
import type { IntegrationPlatform } from '@shopkeeper/analytics';
import { db } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreateIntegrationBody } from '@/app/api/integrations/_lib/validation';
import { CHANNEL_TYPE } from '@shopkeeper/agent/thread-constants';
import { getIntegrationsForOrg, serializeIntegrationRecord } from '@/lib/server/integrations-list';
import logger from '@/lib/server/logger';
import {
  captureIntegrationConnectionCompleted,
  captureIntegrationConnectionFailed,
} from '@/lib/server/product-analytics';
import { saveForwardingEmailIntegration } from './_lib/email-integration';
import { upsertRaceSafeIntegration } from './_lib/integration-upsert';

export const dynamic = 'force-dynamic';

function analyticsIntegrationPlatform(platform: string): IntegrationPlatform | null {
  if (
    platform === 'shopify'
    || platform === 'email'
    || platform === 'ig_dm'
    || platform === 'imessage'
    || platform === 'tiktok'
  ) {
    return platform;
  }
  return null;
}

export const GET = withOrgRoute(
  { context: 'Integrations GET', errorMessage: 'Failed to fetch integrations' },
  async ({ org }) => {
    const result = await getIntegrationsForOrg(org);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);

export const POST = withOrgRoute(
  {
    context: 'Integrations POST',
    errorMessage: 'Failed to create integration',
    requireAdmin: true,
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'integrations:create', limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { platform, externalAccountId, fromEmail } = parseCreateIntegrationBody(await readRequiredJsonObject(request));
    const platformValue = platform;

    if (platformValue === CHANNEL_TYPE.EMAIL) {
      const normalizedEmail = String(externalAccountId).trim().toLowerCase();
      if (!normalizedEmail) {
        throw new BadRequestError('Missing platform or externalAccountId');
      }
      const normalizedFromEmail = fromEmail === undefined || fromEmail === null
        ? normalizedEmail
        : String(fromEmail).trim().toLowerCase() || normalizedEmail;

      let integration;
      try {
        integration = await saveForwardingEmailIntegration({
          organizationId: org.id,
          externalAccountId: normalizedEmail,
          fromEmail: normalizedFromEmail,
        });
      } catch (error) {
        await captureIntegrationConnectionFailed({
          failureCategory: 'unknown',
          organizationId: org.id,
          platform: 'email',
        });
        throw error;
      }
      try {
        await captureIntegrationConnectionCompleted({
          integrationId: integration.id,
          organizationId: org.id,
          platform: 'email',
        });
      } catch (error) {
        logger.warn(
          { errorClass: error instanceof Error ? error.name : 'UnknownError' },
          '[Integrations POST] Analytics capture failed after forwarding email was saved',
        );
      }

      const defaultState = await db.organization.findUniqueOrThrow({
        where: { id: org.id },
        select: { defaultEmailIntegrationId: true },
      });
      return NextResponse.json(
        serializeIntegrationRecord(
          integration,
          undefined,
          undefined,
          defaultState.defaultEmailIntegrationId === integration.id,
        ),
        { status: 201 },
      );
    }

    const analyticsPlatform = analyticsIntegrationPlatform(platformValue);
    let integration;
    try {
      integration = await upsertRaceSafeIntegration({
        organizationId: org.id,
        platform: platformValue,
        externalAccountId: String(externalAccountId),
        data: {
          ...(fromEmail !== undefined && { fromEmail: fromEmail === null ? null : String(fromEmail) }),
        },
      });
    } catch (error) {
      if (analyticsPlatform) {
        await captureIntegrationConnectionFailed({
          failureCategory: 'unknown',
          organizationId: org.id,
          platform: analyticsPlatform,
        });
      }
      throw error;
    }
    if (analyticsPlatform) {
      await captureIntegrationConnectionCompleted({
        integrationId: integration.id,
        organizationId: org.id,
        platform: analyticsPlatform,
      });
    }

    return NextResponse.json(serializeIntegrationRecord(integration), { status: 201 });
  },
);
