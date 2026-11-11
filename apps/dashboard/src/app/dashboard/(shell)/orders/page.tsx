import type { Metadata } from "next"
import { shopNavItem } from "@/app/dashboard/_components/nav-items"
import { Suspense } from "react"
import { OrdersPageSkeleton } from "@/app/dashboard/_components/skeletons"
import OrdersPageClient from "./_components/OrdersPageClient"

export const metadata: Metadata = { title: shopNavItem.name }

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersPageSkeleton />}>
      <OrdersPageClient />
    </Suspense>
  )
}
