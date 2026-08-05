import { Suspense } from "react"
import { OrdersPageSkeleton } from "@/app/dashboard/_components/skeletons"
import OrdersPageClient from "./_components/OrdersPageClient"

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersPageSkeleton />}>
      <OrdersPageClient />
    </Suspense>
  )
}
