import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { executeMissionWithOpenCode } from '@/lib/opencode-executor'
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
    const projectPath = process.cwd()
    const result = await executeMissionWithOpenCode({
      rootTaskId: taskId,
      workspaceId: auth.user.workspace_id,
      projectPath
    })
    return NextResponse.json(result)
  } catch (error: any) {
    logger.error({ err: error, taskId }, 'Failed to execute mission')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}