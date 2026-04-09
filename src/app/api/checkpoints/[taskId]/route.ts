import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { resumeFromCheckpoint } from '@/lib/checkpoint-manager';

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { taskId } = await params;
  const task = parseInt(taskId, 10);
  
  if (isNaN(task)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  try {
    const checkpoint = resumeFromCheckpoint(task);
    
    if (!checkpoint) {
      return NextResponse.json({ error: 'No checkpoint found for this task' }, { status: 404 });
    }

    return NextResponse.json({ checkpoint });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch checkpoint' }, { status: 500 });
  }
}
