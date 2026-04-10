import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { validateBody, createIterationSchema, updateIterationSchema } from '@/lib/validation'
import { 
  createIterationPlan, 
  getIterationPlan, 
  completeIteration,
  getIterationStatus,
  getTaskCounts,
  getIterationsForTask,
  deleteIterationPlan,
  updateIterationTasks,
  planIteration,
  scheduleIterations
} from '@/lib/iteration-engine'
import { eventBus } from '@/lib/event-bus'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const resolvedParams = await params
    const taskId = parseInt(resolvedParams.id)
    const workspaceId = auth.user.workspace_id ?? 1

    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const iterations = db
      .prepare('SELECT * FROM iteration_plans WHERE task_id = ? AND workspace_id = ? ORDER BY iteration ASC')
      .all(taskId, workspaceId) as any[]

    const tasks = db
      .prepare('SELECT * FROM iteration_tasks')
      .all() as any[]

    return NextResponse.json({ 
      iterations: iterations.map(i => ({
        ...i,
        scope: i.scope ? JSON.parse(i.scope) : { files: [], features: [] }
      })),
      tasks,
      task_id: taskId
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/tasks/[id]/iterate error')
    return NextResponse.json({ error: 'Failed to fetch iterations' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const resolvedParams = await params
    const taskId = parseInt(resolvedParams.id)
    const workspaceId = auth.user.workspace_id ?? 1

    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const validated = await validateBody(request, createIterationSchema)
    if ('error' in validated) return validated.error
    const body = validated.data

    const { action } = body
    const now = Math.floor(Date.now() / 1000)

    let result: any

    if (action === 'create') {
      const plan = createIterationPlan(
        taskId,
        workspaceId,
        body.name || '',
        body.goal || '',
        body.scope || { files: [], features: [] }
      )
      result = { created: plan, message: 'Iteration plan created' }
    } else if (action === 'complete') {
      completeIteration(taskId, workspaceId)
      result = { completed: true, message: 'Iteration completed' }
    } else if (action === 'plan') {
      result = { 
        plan: planIteration(taskId, workspaceId),
        message: 'Iteration plan generated'
      }
    } else if (action === 'schedule') {
      scheduleIterations(taskId, workspaceId, body.iterations || 3)
      result = { scheduled: true, message: 'Iterations scheduled' }
    } else if (action === 'tasks') {
      const tasks = (body.tasks || []).map((t: any) => ({
        title: t.title || 'Untitled',
        description: t.description || '',
        subtasks: (t.subtasks || []).map((st: any) => ({
          title: st.title || 'Untitled',
          description: st.description || '',
          subtasks: [],
          estimated_hours: st.estimated_hours || 0
        })),
        estimated_hours: t.estimated_hours || 0
      }))
      updateIterationTasks(body.planId || 0, tasks)
      result = { tasks, message: 'Tasks updated' }
    } else if (action === 'status') {
      const status = getIterationStatus(taskId, workspaceId)
      result = { status, message: 'Status retrieved' }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    eventBus.broadcast('iteration.updated' as any, { task_id: taskId, ...result })

    return NextResponse.json(result)
  } catch (error) {
    logger.error({ err: error }, 'POST /api/tasks/[id]/iterate error')
    return NextResponse.json({ error: 'Failed to process iteration action' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const resolvedParams = await params
    const taskId = parseInt(resolvedParams.id)
    const workspaceId = auth.user.workspace_id ?? 1

    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const validated = await validateBody(request, updateIterationSchema)
    if ('error' in validated) return validated.error
    const body = validated.data

    const { planId, tasks } = body

    if (!planId) {
      return NextResponse.json({ error: 'planId required' }, { status: 400 })
    }

    const normalizedTasks = (tasks || []).map((t: any) => ({
      title: t.title || 'Untitled',
      description: t.description || '',
      subtasks: (t.subtasks || []).map((st: any) => ({
        title: st.title || 'Untitled',
        description: st.description || '',
        subtasks: [],
        estimated_hours: st.estimated_hours || 0
      })),
      estimated_hours: t.estimated_hours || 0
    }))
    updateIterationTasks(planId, normalizedTasks)

    return NextResponse.json({ updated: true, planId, tasks })
  } catch (error) {
    logger.error({ err: error }, 'PUT /api/tasks/[id]/iterate error')
    return NextResponse.json({ error: 'Failed to update iteration tasks' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const resolvedParams = await params
    const taskId = parseInt(resolvedParams.id)
    const workspaceId = auth.user.workspace_id ?? 1

    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const iterations = db
      .prepare('SELECT * FROM iteration_plans WHERE task_id = ? AND workspace_id = ?')
      .all(taskId, workspaceId) as any[]

    const planId = iterations[0]?.id

    if (planId) {
      deleteIterationPlan(planId)
    }

    return NextResponse.json({ deleted: true, task_id: taskId })
  } catch (error) {
    logger.error({ err: error }, 'DELETE /api/tasks/[id]/iterate error')
    return NextResponse.json({ error: 'Failed to delete iteration' }, { status: 500 })
  }
}
