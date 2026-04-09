import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { workflowExecutor } from '@/lib/workflow-executor'
import { mutationLimiter } from '@/lib/rate-limit'
import { eventBus } from '@/lib/event-bus'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  const { workflowId } = await params
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const inputs = body.input || {}

  try {
    const result = await workflowExecutor.execute(workflowId, {
      ...inputs,
      workflow_id: workflowId,
      workspace_id: auth.user.workspace_id ?? 1,
    })

    eventBus.broadcast('workflow.executed', {
      workflow_id: workflowId,
      success: result.success,
      nodes_executed: result.nodes_executed.length,
      duration_ms: result.duration_ms,
    })

    return NextResponse.json({
      ok: result.success,
      result,
      workflow_id: workflowId
    })
  } catch (error: any) {
    logger.error({ workflowId, err: error }, 'Workflow execution failed')
    return NextResponse.json({ 
      ok: false, 
      error: error.message,
      workflow_id: workflowId
    }, { status: 400 })
  }
}
