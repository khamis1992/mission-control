import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { analyzeTaskGoal } from '@/lib/goal-analyzer'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const taskId = parseInt(id, 10)
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
  }

  try {
    const result = await analyzeTaskGoal(taskId, auth.user.workspace_id)
    if (!result) {
      return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
    }
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error({ err: error, taskId }, 'Goal analysis endpoint error')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}