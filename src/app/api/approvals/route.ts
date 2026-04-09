import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { validateBody, createApprovalGateSchema, createApprovalRequestSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDatabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const agentId = searchParams.get('agent_id');

    const whereClauses = ['ar.status = ?'];
    const params: any[] = [status];

    if (agentId) {
      whereClauses.push('ar.agent_id = ?');
      params.push(agentId);
    }

    const rows = db.prepare(`
      SELECT ar.*, ag.name as gate_name, ag.escalation_path
      FROM approval_requests ar
      JOIN approval_gates ag ON ag.id = ar.gate_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ar.created_at DESC
    `).all(...params);

    return NextResponse.json({ requests: rows, status: 'success' });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const validated = await validateBody(request, createApprovalGateSchema);
  if ('error' in validated) return validated.error;
  const body = validated.data;

  try {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const gateId = db.prepare(`
      INSERT INTO approval_gates (task_id, agent_id, name, condition, mode, approvers, timeout, escalation_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.task_id,
      body.agent_id,
      body.name,
      body.condition || 'before_tool',
      body.mode,
      JSON.stringify(body.approvers || []),
      body.timeout || 3600,
      body.escalation_path,
      now
    ).lastInsertRowid as number;

    return NextResponse.json({ gate_id: gateId, status: 'gate_created' }, { status: 201 });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const validated = await validateBody(request, createApprovalRequestSchema);
  if ('error' in validated) return validated.error;
  const body = validated.data;

  try {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (body.approval_timeout || 3600);

    const requestId = db.prepare(`
      INSERT INTO approval_requests (gate_id, task_id, agent_id, payload, reason, created_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.gate_id,
      body.task_id,
      body.agent_id,
      JSON.stringify(body.payload),
      body.reason || 'No reason provided',
      now,
      expiresAt,
      'pending'
    ).lastInsertRowid as number;

    return NextResponse.json({ request_id: requestId, expires_at: expiresAt }, { status: 201 });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID parameter required' }, { status: 400 });
    }

    db.prepare('DELETE FROM approval_gates WHERE id = ?').run(id);
    db.prepare('DELETE FROM approval_requests WHERE gate_id = ?').run(id);

    return NextResponse.json({ status: 'deleted' });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}