import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { createSubtaskGraph } from '@/lib/auto-task-generator'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const taskId = parseInt(params.id, 10)
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
  }

  try {
    const result = await createSubtaskGraph(taskId, auth.user.workspace_id)
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error({ err: error, taskId }, 'Failed to generate subtasks')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}