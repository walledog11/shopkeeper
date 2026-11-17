import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Liveness only: is this deployment serving? Deliberately touches no
// dependency. The dashboard's uptime monitor polls here; the database is
// watched by the gateway's monitor on its /health/deep (runbook *External
// monitors*).
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
