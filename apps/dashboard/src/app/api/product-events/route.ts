import { NextResponse } from 'next/server';
import {
  INTEGRATION_PLATFORMS,
  ONBOARDING_STEPS,
  productEventInsertId,
  type IntegrationPlatform,
  type OnboardingStep,
} from '@shopkeeper/analytics';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import logger from '@/lib/server/logger';
import { captureDashboardProductEvent } from '@/lib/server/product-analytics';
import { getRedis } from '@/lib/server/redis';

const MAX_BODY_BYTES = 1_024;
const ONBOARDING_DEDUP_TTL_SECONDS = 30 * 24 * 60 * 60;

type RestrictedProductEvent =
  | { event: 'onboarding_step_completed'; step: OnboardingStep }
  | { event: 'integration_connection_started'; platform: IntegrationPlatform };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}

function isAllowed<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export function parseRestrictedProductEvent(value: unknown): RestrictedProductEvent {
  if (!isRecord(value) || typeof value.event !== 'string') {
    throw new BadRequestError('Invalid product event');
  }

  if (value.event === 'onboarding_step_completed') {
    if (
      !hasExactKeys(value, ['event', 'step'])
      || !isAllowed(value.step, ONBOARDING_STEPS)
    ) {
      throw new BadRequestError('Invalid product event');
    }
    return { event: value.event, step: value.step };
  }

  if (value.event === 'integration_connection_started') {
    if (
      !hasExactKeys(value, ['event', 'platform'])
      || !isAllowed(value.platform, INTEGRATION_PLATFORMS)
    ) {
      throw new BadRequestError('Invalid product event');
    }
    return { event: value.event, platform: value.platform };
  }

  throw new BadRequestError('Invalid product event');
}

async function readRestrictedProductEvent(request: Request): Promise<RestrictedProductEvent> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new BadRequestError('Product event body is too large');
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new BadRequestError('Product event body is too large');
  }

  try {
    return parseRestrictedProductEvent(JSON.parse(body) as unknown);
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError('Invalid product event');
  }
}

async function claimOnboardingStep(
  organizationId: string,
  step: OnboardingStep,
): Promise<boolean> {
  try {
    const result = await getRedis().set(
      `product-event:onboarding-step:${organizationId}:${step}`,
      '1',
      { nx: true, ex: ONBOARDING_DEDUP_TTL_SECONDS },
    );
    return result === 'OK';
  } catch (error) {
    logger.warn(
      {
        errorClass: error instanceof Error ? error.name : 'UnknownError',
        organizationId,
        step,
      },
      '[ProductAnalytics] Onboarding event deduplication failed open',
    );
    return true;
  }
}

export const POST = withOrgRoute(
  {
    context: 'POST /api/product-events',
    errorMessage: 'Failed to capture product event',
    rateLimit: { key: 'product-events', limit: 60, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const event = await readRestrictedProductEvent(request);

    if (event.event === 'onboarding_step_completed') {
      const claimed = await claimOnboardingStep(org.id, event.step);
      if (!claimed) return NextResponse.json({ ok: true });

      await captureDashboardProductEvent({
        ...event,
        organizationId: org.id,
        source: 'dashboard',
        insertId: productEventInsertId.onboardingStepCompleted(org.id, event.step),
      });
    } else {
      await captureDashboardProductEvent({
        ...event,
        organizationId: org.id,
        source: 'dashboard',
      });
    }

    return NextResponse.json({ ok: true });
  },
);
