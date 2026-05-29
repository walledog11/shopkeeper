export function ShopifyCustomerSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
        <div className="h-2 w-16 bg-white/[0.08] rounded" />
        <div className="h-2.5 w-28 bg-white/[0.08] rounded" />
        <div className="h-2 w-32 bg-white/[0.05] rounded" />
        <div className="h-2 w-20 bg-white/[0.05] rounded" />
      </div>
      {["shopify-customer-skeleton-1", "shopify-customer-skeleton-2"].map(key => (
        <div key={key} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1">
          <div className="h-2.5 w-20 bg-white/[0.08] rounded" />
          <div className="h-2 w-32 bg-white/[0.05] rounded" />
          <div className="h-2 w-16 bg-white/[0.05] rounded" />
        </div>
      ))}
    </div>
  )
}
