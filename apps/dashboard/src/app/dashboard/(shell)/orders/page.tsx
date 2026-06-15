import { Suspense } from "react"
import OrdersPageClient from "./_components/OrdersPageClient"

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageClient />
    </Suspense>
  )
}
