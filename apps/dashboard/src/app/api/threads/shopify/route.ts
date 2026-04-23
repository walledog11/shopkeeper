import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';

/**
 * POST /api/threads/shopify
 *
 * Finds or creates a support thread for a Shopify customer.
 * Used by the Orders page "New thread" action.
 *
 * Body: { shopifyCustomerId, customerEmail, customerName?, orderName? }
 * Response: { threadId: string, isNew: boolean }
 */
export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { shopifyCustomerId, customerEmail, customerName, orderName } = await request.json();

    if (!shopifyCustomerId || !customerEmail) {
      return NextResponse.json({ error: 'Missing shopifyCustomerId or customerEmail' }, { status: 400 });
    }

    // Upsert the customer keyed by email (the canonical platformId for email threads)
    const platformId = customerEmail.toLowerCase();
    let customer = await db.customer.findUnique({
      where: { organizationId_platformId: { organizationId: org.id, platformId } },
    });

    if (!customer) {
      try {
        customer = await db.customer.create({
          data: {
            organizationId: org.id,
            platformId,
            name: customerName ?? null,
          },
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        customer = (await db.customer.findUnique({
          where: { organizationId_platformId: { organizationId: org.id, platformId } },
        }))!;
      }
    }

    // Update name if we now have one and didn't before
    if (customerName && !customer.name) {
      await db.customer.update({ where: { id: customer.id }, data: { name: customerName } }).catch(() => {});
    }

    // Return the most recent open email thread for this customer if one exists
    const existingThread = await db.thread.findFirst({
      where: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
        archivedAt: null,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existingThread) {
      return NextResponse.json({ threadId: existingThread.id, isNew: false });
    }

    // No open thread — create one
    const thread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
        shopifyCustomerId: String(shopifyCustomerId),
        tag: orderName ? `Order ${orderName}` : 'Support',
      },
    });

    return NextResponse.json({ threadId: thread.id, isNew: true });
  } catch (error) {
    return handleApiError(error, 'Threads Shopify POST', 'Failed to create thread');
  }
}
