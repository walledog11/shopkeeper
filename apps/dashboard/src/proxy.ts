import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isE2EAuthBypassEnabled } from '@/lib/e2e-auth'
import { getCanonicalHostRedirect } from '@/proxy/canonical-host'
import { CSP_REPORT_ENDPOINT, cspDirectives } from '@/proxy/content-security-policy'
import { getPathAccessPolicy, isApiPath } from '@/proxy/path-access-policy'

export default clerkMiddleware(async (auth, req) => {
  if (isE2EAuthBypassEnabled()) {
    return
  }

  // Before anything reads a cookie: the OAuth handshake cookies are host-only,
  // so an app surface served off a sibling host silently breaks every connect.
  const canonicalHostRedirect = getCanonicalHostRedirect(
    req.headers.get('host'),
    req.nextUrl.pathname,
    req.nextUrl.search,
  )
  if (canonicalHostRedirect) {
    return NextResponse.redirect(canonicalHostRedirect, 307)
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
}, {
  // Clerk mints the nonce, stamps it onto its own script tag and the forwarded
  // request headers Next reads to nonce its bundles, and merges these
  // directives into its defaults. Still report-only: enforcement waits on the
  // violation-telemetry window.
  contentSecurityPolicy: {
    strict: true,
    reportOnly: true,
    reportTo: CSP_REPORT_ENDPOINT,
    directives: cspDirectives,
  },
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|mp4|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
