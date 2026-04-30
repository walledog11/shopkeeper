import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isE2EAuthBypassEnabled } from '@/lib/e2e-auth'
import { getPathAccessPolicy } from '@/proxy/path-access-policy'

export default clerkMiddleware(async (auth, req) => {
  if (isE2EAuthBypassEnabled()) {
    return
  }

  const pathname = req.nextUrl.pathname
  const policy = getPathAccessPolicy(pathname)

  if (policy.requiresAuth) {
    await auth.protect()
  }

  const { userId, orgId } = await auth()
  if (!userId || orgId || !policy.requiresOrganization) {
    return
  }

  if (policy.missingOrganizationAction === 'json-403') {
    return NextResponse.json({ error: 'No active organization' }, { status: 403 })
  }

  return NextResponse.redirect(new URL('/select-org', req.url))
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
