import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ChannelType, computeTenantConsistencyReport, db } from '@shopkeeper/db';

class RollbackAuditFixture extends Error {}

async function expectTenantConstraint(
  operation: Promise<unknown>,
  constraint: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({
    code: 'P2003',
    meta: expect.objectContaining({ constraint }),
  });
}

describe('tenant consistency audit', () => {
  it('finds cross-tenant parent relationships without exposing row content', async () => {
    try {
      await db.$transaction(async (tx) => {
        // The production gate must keep detecting historical corruption even
        // after the NOT VALID P5-03 constraints begin protecting new writes.
        // Disable FK triggers only inside this rolled-back, test-only session.
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');

        const orgA = await tx.organization.create({
          data: { clerkOrgId: `org_test_${randomUUID()}`, name: 'Audit org A' },
        });
        const orgB = await tx.organization.create({
          data: { clerkOrgId: `org_test_${randomUUID()}`, name: 'Audit org B' },
        });
        const customerB = await tx.customer.create({
          data: {
            organizationId: orgB.id,
            platformId: `audit-${randomUUID()}@example.com`,
          },
        });
        const integrationA = await tx.integration.create({
          data: {
            organizationId: orgA.id,
            platform: ChannelType.email,
            emailProvider: 'postmark',
            externalAccountId: `audit-${randomUUID()}`,
          },
        });
        const integrationB = await tx.integration.create({
          data: {
            organizationId: orgB.id,
            platform: ChannelType.email,
            emailProvider: 'postmark',
            externalAccountId: `audit-${randomUUID()}`,
          },
        });
        const threadA = await tx.thread.create({
      data: {
        organizationId: orgA.id,
        customerId: customerB.id,
        channelType: ChannelType.email,
        status: 'open',
        replyIntegrationId: integrationB.id,
      },
    });
        const threadB = await tx.thread.create({
      data: {
        organizationId: orgB.id,
        customerId: customerB.id,
        channelType: ChannelType.email,
        status: 'open',
      },
    });
        const message = await tx.message.create({
      data: {
        organizationId: orgB.id,
        threadId: threadA.id,
        integrationId: integrationA.id,
        senderType: 'customer',
        contentText: 'content must never appear in the audit report',
      },
    });
        const messageB = await tx.message.create({
      data: {
        organizationId: orgB.id,
        threadId: threadB.id,
        senderType: 'customer',
        contentText: 'other private content',
      },
    });
        await tx.thread.update({
      where: { id: threadA.id },
      data: { cachedPlanMessageId: messageB.id },
    });

        const executionB = await tx.planExecution.create({
      data: {
        planId: randomUUID(),
        organizationId: orgB.id,
        threadId: threadB.id,
        sourceMessageId: messageB.id,
        planHash: 'b'.repeat(64),
        instructionHash: 'c'.repeat(64),
      },
    });
        const action = await tx.agentAction.create({
      data: {
        turnId: randomUUID(),
        organizationId: orgA.id,
        threadId: threadB.id,
        customerId: customerB.id,
        executionId: executionB.id,
        tool: 'get_order',
        category: 'orders',
        input: {},
        status: 'success',
        mode: 'read_only',
        durationMs: 1,
      },
    });
        const executionA = await tx.planExecution.create({
      data: {
        planId: randomUUID(),
        organizationId: orgA.id,
        threadId: threadB.id,
        sourceMessageId: messageB.id,
        planHash: 'd'.repeat(64),
        instructionHash: 'e'.repeat(64),
      },
    });

        const knowledgeBaseB = await tx.knowledgeBase.create({
      data: { organizationId: orgB.id, name: 'Private KB' },
    });
        const crossTenantArticle = await tx.kbArticle.create({
      data: {
        organizationId: orgA.id,
        knowledgeBaseId: knowledgeBaseB.id,
        title: 'Private title',
        body: 'private body',
      },
    });
        const articleB = await tx.kbArticle.create({
      data: {
        organizationId: orgB.id,
        knowledgeBaseId: knowledgeBaseB.id,
        title: 'Other private title',
        body: 'other private body',
      },
    });
        const citation = await tx.kbCitation.create({
      data: {
        organizationId: orgA.id,
        kbArticleId: articleB.id,
        threadId: threadB.id,
      },
    });

        const report = await computeTenantConsistencyReport(tx as never);
        const serialized = JSON.stringify(report);

        expect(report.safeToConstrain).toBe(false);
        expect(report.checks.thread_customer.samples).toEqual(expect.arrayContaining([
          expect.objectContaining({ childId: threadA.id, parentId: customerB.id }),
        ]));
        expect(report.checks.thread_reply_integration.samples).toEqual(expect.arrayContaining([
          expect.objectContaining({ childId: threadA.id, parentId: integrationB.id }),
        ]));
        expect(report.checks.thread_cached_plan_message.samples).toEqual(expect.arrayContaining([
          expect.objectContaining({ childId: threadA.id, parentId: messageB.id }),
        ]));
        expect(report.checks.message_thread.samples).toEqual(expect.arrayContaining([
          expect.objectContaining({ childId: message.id, parentId: threadA.id }),
        ]));
        expect(report.checks.message_integration.samples).toEqual(expect.arrayContaining([
          expect.objectContaining({ childId: message.id, parentId: integrationA.id }),
        ]));
        for (const check of ['agent_action_thread', 'agent_action_customer', 'agent_action_execution']) {
          expect(report.checks[check].samples).toEqual(expect.arrayContaining([
            expect.objectContaining({ childId: action.id }),
          ]));
        }
        for (const check of ['plan_execution_thread', 'plan_execution_source_message']) {
          expect(report.checks[check].samples).toEqual(expect.arrayContaining([
            expect.objectContaining({ childId: executionA.id }),
          ]));
        }
        expect(report.checks.kb_article_knowledge_base.samples).toEqual(expect.arrayContaining([
          expect.objectContaining({ childId: crossTenantArticle.id, parentId: knowledgeBaseB.id }),
        ]));
        for (const check of ['kb_citation_article', 'kb_citation_thread']) {
          expect(report.checks[check].samples).toEqual(expect.arrayContaining([
            expect.objectContaining({ childId: citation.id }),
          ]));
        }
        expect(serialized).not.toContain('content must never appear');
        expect(serialized).not.toContain('Private title');
        expect(serialized).not.toContain(customerB.platformId);

        throw new RollbackAuditFixture();
      });
    } catch (error) {
      if (!(error instanceof RollbackAuditFixture)) throw error;
    }
  });

  it('rejects new cross-tenant relationships while preserving same-tenant writes', async () => {
    const orgA = await db.organization.create({
      data: { clerkOrgId: `org_test_${randomUUID()}`, name: 'Constraint org A' },
    });
    const orgB = await db.organization.create({
      data: { clerkOrgId: `org_test_${randomUUID()}`, name: 'Constraint org B' },
    });

    try {
      const [customerA, customerB, integrationA, integrationB] = await Promise.all([
        db.customer.create({
          data: { organizationId: orgA.id, platformId: `a-${randomUUID()}@example.com` },
        }),
        db.customer.create({
          data: { organizationId: orgB.id, platformId: `b-${randomUUID()}@example.com` },
        }),
        db.integration.create({
          data: {
            organizationId: orgA.id,
            platform: ChannelType.email,
            emailProvider: 'postmark',
            externalAccountId: `a-${randomUUID()}`,
          },
        }),
        db.integration.create({
          data: {
            organizationId: orgB.id,
            platform: ChannelType.email,
            emailProvider: 'postmark',
            externalAccountId: `b-${randomUUID()}`,
          },
        }),
      ]);
      const [threadA, threadB] = await Promise.all([
        db.thread.create({
          data: {
            organizationId: orgA.id,
            customerId: customerA.id,
            channelType: ChannelType.email,
            status: 'open',
            replyIntegrationId: integrationA.id,
          },
        }),
        db.thread.create({
          data: {
            organizationId: orgB.id,
            customerId: customerB.id,
            channelType: ChannelType.email,
            status: 'open',
            replyIntegrationId: integrationB.id,
          },
        }),
      ]);
      const [messageA, messageB] = await Promise.all([
        db.message.create({
          data: {
            organizationId: orgA.id,
            threadId: threadA.id,
            integrationId: integrationA.id,
            senderType: 'customer',
            contentText: 'same tenant A',
          },
        }),
        db.message.create({
          data: {
            organizationId: orgB.id,
            threadId: threadB.id,
            integrationId: integrationB.id,
            senderType: 'customer',
            contentText: 'same tenant B',
          },
        }),
      ]);
      const [executionA, executionB, knowledgeBaseA, knowledgeBaseB] = await Promise.all([
        db.planExecution.create({
          data: {
            planId: randomUUID(),
            organizationId: orgA.id,
            threadId: threadA.id,
            sourceMessageId: messageA.id,
            planHash: 'a'.repeat(64),
            instructionHash: 'b'.repeat(64),
          },
        }),
        db.planExecution.create({
          data: {
            planId: randomUUID(),
            organizationId: orgB.id,
            threadId: threadB.id,
            sourceMessageId: messageB.id,
            planHash: 'c'.repeat(64),
            instructionHash: 'd'.repeat(64),
          },
        }),
        db.knowledgeBase.create({ data: { organizationId: orgA.id, name: 'KB A' } }),
        db.knowledgeBase.create({ data: { organizationId: orgB.id, name: 'KB B' } }),
      ]);
      const [articleA, articleB] = await Promise.all([
        db.kbArticle.create({
          data: {
            organizationId: orgA.id,
            knowledgeBaseId: knowledgeBaseA.id,
            title: 'Article A',
            body: 'A',
          },
        }),
        db.kbArticle.create({
          data: {
            organizationId: orgB.id,
            knowledgeBaseId: knowledgeBaseB.id,
            title: 'Article B',
            body: 'B',
          },
        }),
      ]);

      await expectTenantConstraint(db.thread.create({
        data: {
          organizationId: orgA.id,
          customerId: customerB.id,
          channelType: ChannelType.email,
          status: 'closed',
        },
      }), 'threads_tenant_customer_fkey');
      await expectTenantConstraint(db.thread.update({
        where: { id: threadA.id },
        data: { replyIntegrationId: integrationB.id },
      }), 'threads_tenant_reply_integration_fkey');
      await expectTenantConstraint(db.thread.update({
        where: { id: threadA.id },
        data: { cachedPlanMessageId: messageB.id },
      }), 'threads_tenant_cached_plan_message_fkey');
      await expectTenantConstraint(db.message.create({
        data: {
          organizationId: orgB.id,
          threadId: threadA.id,
          senderType: 'customer',
          contentText: 'wrong thread tenant',
        },
      }), 'messages_tenant_thread_fkey');
      await expectTenantConstraint(db.message.create({
        data: {
          organizationId: orgA.id,
          threadId: threadA.id,
          integrationId: integrationB.id,
          senderType: 'customer',
          contentText: 'wrong integration tenant',
        },
      }), 'messages_tenant_integration_fkey');

      for (const [data, constraint] of [
        [{ threadId: threadB.id }, 'agent_actions_tenant_thread_fkey'],
        [{ customerId: customerB.id }, 'agent_actions_tenant_customer_fkey'],
        [{ executionId: executionB.id }, 'agent_actions_tenant_execution_fkey'],
      ] as const) {
        await expectTenantConstraint(db.agentAction.create({
          data: {
            turnId: randomUUID(),
            organizationId: orgA.id,
            tool: 'get_order',
            category: 'orders',
            input: {},
            status: 'success',
            mode: 'read_only',
            durationMs: 1,
            ...data,
          },
        }), constraint);
      }

      await expectTenantConstraint(db.planExecution.create({
        data: {
          planId: randomUUID(),
          organizationId: orgA.id,
          threadId: threadB.id,
          planHash: 'e'.repeat(64),
          instructionHash: 'f'.repeat(64),
        },
      }), 'plan_executions_tenant_thread_fkey');
      await expectTenantConstraint(db.planExecution.create({
        data: {
          planId: randomUUID(),
          organizationId: orgA.id,
          threadId: threadA.id,
          sourceMessageId: messageB.id,
          planHash: '1'.repeat(64),
          instructionHash: '2'.repeat(64),
        },
      }), 'plan_executions_tenant_source_message_fkey');
      await expectTenantConstraint(db.kbArticle.create({
        data: {
          organizationId: orgA.id,
          knowledgeBaseId: knowledgeBaseB.id,
          title: 'Wrong KB tenant',
          body: 'blocked',
        },
      }), 'kb_articles_tenant_knowledge_base_fkey');
      await expectTenantConstraint(db.kbCitation.create({
        data: { organizationId: orgA.id, kbArticleId: articleB.id },
      }), 'kb_citations_tenant_article_fkey');
      await expectTenantConstraint(db.kbCitation.create({
        data: { organizationId: orgA.id, kbArticleId: articleA.id, threadId: threadB.id },
      }), 'kb_citations_tenant_thread_fkey');

      expect(executionA.organizationId).toBe(orgA.id);
    } finally {
      await db.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    }
  });
});
