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
    const period = (url.searchParams.get('period') || 'day') as 'day' | 'week' | 'month';

    const costs = await traceCollector.getCostMetrics(period);

    return NextResponse.json(costs);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch cost metrics' }, { status: 500 });
  }
}
