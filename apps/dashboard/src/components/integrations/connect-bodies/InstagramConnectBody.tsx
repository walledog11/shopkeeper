"use client"

import { Button } from "@/components/ui/button"

export function InstagramConnectBody({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/40 leading-relaxed">
            Connect an Instagram Professional account to manage customer DMs in Shopkeeper.
          </p>
          <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Use a Business or Creator account; personal accounts cannot connect</li>
            <li>Authorize Shopkeeper directly with your Instagram sign-in</li>
            <li>Customers must message you first; replies are available for 24 hours</li>
          </ol>
        </div>
      )}
      <form action="/api/integrations/instagram/auth" method="post">
        <Button type="submit" size="sm" className="h-9 px-4 font-medium">
          {isConnected ? "Reconnect" : "Connect with Instagram"}
        </Button>
      </form>
    </div>
  )
}
