"use client"

import { Button } from "@/components/ui/button"

export function InstagramConnectBody({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/40 leading-relaxed">
            Connect your Instagram Business account to manage DMs alongside every other channel.
          </p>
          <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Make sure your Instagram is linked to a Facebook Business Page</li>
            <li>Click Connect below and authorize Shopkeeper via Meta OAuth</li>
            <li>DMs will start appearing as tickets immediately</li>
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
