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
    const agent = url.searchParams.get('agent');
    const startDate = url.searchParams.get('start');
    const endDate = url.searchParams.get('end');
    const type = url.searchParams.get('type');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const taskId = url.searchParams.get('task');

    let traces = await traceCollector.getAllTraces();

    if (agent) {
      traces = traces.filter((t) => t.agent_id === agent);
    }

    if (taskId) {
      traces = traces.filter((t) => t.task_id === parseInt(taskId));
    }

    if (startDate) {
      const start = new Date(startDate).getTime();
      traces = traces.filter((t) => t.start_time >= start);
    }

    if (endDate) {
      const end = new Date(endDate).getTime();
      traces = traces.filter((t) => (t.end_time || Infinity) <= end);
    }

    if (type && type !== 'all') {
      traces = traces.filter((t) => t.events.some((e) => e.type === type));
    }

    traces = traces.slice(0, limit);

    return NextResponse.json(traces);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch traces' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = requireRole(request, 'operator');
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const sessionId = parts[parts.length - 1];

    if (!sessionId || sessionId === 'telemetry') {
      return NextResponse.json({ error: 'Invalid trace ID' }, { status: 400 });
    }

    await traceCollector.deleteTrace(sessionId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete trace' }, { status: 500 });
  }
}
