import type { Metadata } from 'next';
import { chatNavItem } from '@/app/dashboard/_components/nav-items';
import Link from 'next/link';
import { PageTitle } from '@/app/dashboard/_components/PageTitle';
import { dashboardPageShellClassName } from '@/app/dashboard/_components/sidebar/sidebar-helpers';
import { db } from '@shopkeeper/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { isOrgAdmin } from '@/lib/api/permissions';
import { getShopifyOAuthAuthorizeConfig } from '@/lib/env';
import { chatConfigurationFromIntegration } from '@/lib/storefront-chat/service';
import { buildShopifyThemeEditorAppEmbedUrl } from '@/lib/storefront-chat/theme-editor';
import StorefrontChatEditor from '@/components/storefront-chat/StorefrontChatEditor';

export const metadata: Metadata = { title: chatNavItem.name };

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
    <div className={dashboardPageShellClassName()}>
      <PageTitle>{chatNavItem.name}</PageTitle>
      <p className="text-sm text-muted-foreground">Connect your Shopify store to customize its chat.</p>
      <Link href="/dashboard/integrations" className="w-fit text-sm font-medium underline underline-offset-4">Go to Channels</Link>
    </div>
  );
  const clientId = getShopifyOAuthAuthorizeConfig()?.clientId;
  return <StorefrontChatEditor
    key={integration.id}
    draftKey={`shopkeeper:chat-draft:${org.id}:${integration.id}`}
    initialData={chatConfigurationFromIntegration(integration, org.name)}
    canManage={canManage}
    themeEditorUrl={clientId ? buildShopifyThemeEditorAppEmbedUrl(integration.externalAccountId, clientId)
      : `https://${integration.externalAccountId}/admin/themes/current/editor?context=apps`}
  />;
}
