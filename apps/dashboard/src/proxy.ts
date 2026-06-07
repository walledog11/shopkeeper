import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isE2EAuthBypassEnabled } from '@/lib/e2e-auth'
import { getPathAccessPolicy, isApiPath } from '@/proxy/path-access-policy'

export default clerkMiddleware(async (auth, req) => {
  if (isE2EAuthBypassEnabled()) {
    return
  }

  const pathname = req.nextUrl.pathname
  const policy = getPathAccessPolicy(pathname)

  const { userId, orgId } = await auth()

  if (userId && pathname === '/signup') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  if (policy.requiresAuth && !userId) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await auth.protect()
    return
  }

  if (!policy.requiresOrganization || orgId) {
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
