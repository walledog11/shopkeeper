import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/signup(.*)',
  '/select-org(.*)',
  '/create-org(.*)',
  '/api/webhooks(.*)',
  '/webhooks(.*)',
  // OAuth callbacks are self-verified via state + HMAC — no Clerk session needed
  '/api/integrations/shopify/callback(.*)',
  '/api/integrations/instagram/callback(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }

  const { userId, orgId } = await auth()
  if (userId && !orgId && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/select-org', req.url))
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
