"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

interface TagItem {
  tag: string
  count: number
}

interface TopTopicsCardProps {
  byTag: TagItem[]
  maxTag: number
  isLoading: boolean
}

export function TopTopicsCard({ byTag, maxTag, isLoading }: TopTopicsCardProps) {
  return (
    <Card className="gap-6">
      <CardHeader>
        <CardTitle className="text-sm">Top Topics</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse space-y-1">
                <div className="flex justify-between">
                  <div className="h-3 w-20 bg-muted rounded" />
                  <div className="h-3 w-6 bg-muted rounded" />
                </div>
                <div className="h-1.5 bg-muted rounded-full" />
              </div>
            ))}
          </div>
        ) : byTag.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No tagged tickets yet.</p>
        ) : (
          <div className="space-y-3">
            {byTag.map(item => (
              <div key={item.tag}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-foreground">{item.tag}</span>
                  <span className="text-xs font-semibold text-muted-foreground">{item.count}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    title={`${item.count} ticket${item.count !== 1 ? 's' : ''}`}
                    className="h-full bg-primary rounded-full transition-all duration-500 hover:opacity-80 cursor-default"
                    style={{ width: `${(item.count / maxTag) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
