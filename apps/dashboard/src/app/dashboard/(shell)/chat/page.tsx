import Link from 'next/link';
import { db } from '@shopkeeper/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { isOrgAdmin } from '@/lib/api/permissions';
import { getShopifyOAuthAuthorizeConfig } from '@/lib/env';
import { readChatConfiguration } from '@/lib/storefront-chat/configuration';
import { readStorefrontChatEnabled } from '@/lib/storefront-chat/metadata';
import { buildShopifyThemeEditorAppEmbedUrl } from '@/lib/storefront-chat/theme-editor';
import StorefrontChatEditor from '@/components/storefront-chat/StorefrontChatEditor';

export default async function StorefrontChatPage() {
  const org = await getOrCreateOrg();
  const [integration, canManage] = await Promise.all([
    db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify', lifecycleStatus: 'active' },
      select: { id: true, metadata: true, externalAccountId: true, fromEmail: true },
    }),
    isOrgAdmin(),
  ]);
  if (!integration) return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">Website chat</h1>
      <p className="text-sm text-muted-foreground">Connect your Shopify store to customize its chat.</p>
      <Link href="/dashboard/integrations" className="text-sm font-medium underline underline-offset-4">Go to integrations</Link>
    </div>
  );
  const clientId = getShopifyOAuthAuthorizeConfig()?.clientId;
  return <StorefrontChatEditor
    key={integration.id}
    draftKey={`shopkeeper:chat-draft:${org.id}:${integration.id}`}
    initialData={{
      shop: integration.externalAccountId, shopName: integration.fromEmail || org.name,
      enabled: readStorefrontChatEnabled(integration.metadata),
      configuration: readChatConfiguration(integration.metadata),
    }}
    canManage={canManage}
    themeEditorUrl={clientId ? buildShopifyThemeEditorAppEmbedUrl(integration.externalAccountId, clientId)
      : `https://${integration.externalAccountId}/admin/themes/current/editor?context=apps`}
  />;
}
