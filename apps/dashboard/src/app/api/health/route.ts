import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Liveness only: is this deployment serving? Deliberately touches no
// dependency. Uptime monitors belong here, not on /api/health/deep — polling a
// DB check every few minutes holds the Neon compute above its scale-to-zero
// idle window and bills it around the clock.
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
