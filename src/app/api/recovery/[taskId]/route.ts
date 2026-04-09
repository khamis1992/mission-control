import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { requireRole } from '@/lib/auth';

type RecoveryStrategy = 'retry' | 'rollback' | 'escalate' | 'skip' | 'fallback';

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDatabase();
    const { taskId } = await params;
    const id = parseInt(taskId, 10);
    
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const strategy = searchParams.get('strategy') as RecoveryStrategy;

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy parameter required' }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    let result: any;

    switch (strategy) {
      case 'retry':
        result = await db.prepare(`
          UPDATE tasks 
          SET status = 'assigned', 
              retry_count = COALESCE(retry_count, 0) + 1,
              recovery_strategy = 'retry',
              updated_at = ?
          WHERE id = ?
        `).run(now, id);
        break;

      case 'rollback':
        result = await db.prepare(`
          UPDATE tasks 
          SET status = 'assigned', 
              retry_count = COALESCE(retry_count, 0) + 1,
              recovery_strategy = 'rollback',
              updated_at = ?
          WHERE id = ?
        `).run(now, id);
        break;

      case 'escalate':
        result = await db.prepare(`
          UPDATE tasks 
          SET status = 'failed',
          recovery_strategy = 'escalate',
          failure_type = 'unknown',
          error_message = 'Escalated to human operator',
          updated_at = ?
        WHERE id = ?
      `).run(now, id);
        break;

      case 'skip':
        result = await db.prepare(`
          UPDATE tasks 
          SET status = 'done',
          recovery_strategy = 'skip',
          outcome = 'skipped',
          updated_at = ?
        WHERE id = ?
      `).run(now, id);
        break;

      case 'fallback':
        const fallbackTaskId = db.prepare(`
          INSERT INTO tasks (title, description, status, metadata, assigned_to, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          `Fallback for Task ${id}`,
          `Fallback execution for task ${id}`,
          'assigned',
          JSON.stringify({ original_task_id: id }),
          task.assigned_to,
          now,
          now
        ).lastInsertRowid as number;

        result = await db.prepare(`
          UPDATE tasks 
          SET status = 'assigned',
              recovery_strategy = 'fallback',
              updated_at = ?
          WHERE id = ?
        `).run(now, id);
        break;

      default:
        return NextResponse.json({ error: `Unknown strategy: ${strategy}` }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      task_id: id,
      strategy,
      status: 'recovery_initiated'
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDatabase();
    const { taskId } = await params;
    const id = parseInt(taskId, 10);
    
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const task = db.prepare(`
      SELECT t.*, 
             ag.name as gate_name,
             ag.condition as gate_condition,
             ag.mode as gate_mode
      FROM tasks t
      LEFT JOIN approval_gates ag ON ag.task_id = t.id
      WHERE t.id = ?
    `).get(id) as any;

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const pendingApprovals = db.prepare(`
      SELECT ar.* FROM approval_requests ar
      WHERE ar.task_id = ? AND ar.status = 'pending'
      ORDER BY ar.created_at DESC
    `).all(id);

    return NextResponse.json({ 
      task, 
      pending_approvals: pendingApprovals 
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDatabase();
    const { taskId } = await params;
    const id = parseInt(taskId, 10);
    
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const json = await request.json();
    const { status, recovery_strategy, error_message } = json;

    const update: any = { updated_at: Math.floor(Date.now() / 1000) };
    
    if (status) update.status = status;
    if (recovery_strategy) update.recovery_strategy = recovery_strategy;
    if (error_message) update.error_message = error_message.substring(0, 5000);

    const setClauses = Object.keys(update).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(update), id];

    db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...values);

    return NextResponse.json({ success: true, task_id: id });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}