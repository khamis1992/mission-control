import { NextRequest, NextResponse } from 'next/server';
import { traceCollector } from '@/lib/telemetry';
import { requireRole } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, 'viewer');
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const traceId = parts[parts.length - 1];

    if (!traceId || traceId === 'trace') {
      return NextResponse.json({ error: 'Invalid trace ID' }, { status: 400 });
    }

    const trace = await traceCollector.getTraceById(traceId);

    if (!trace) {
      return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
    }

    return NextResponse.json(trace);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch trace' }, { status: 500 });
  }
}
