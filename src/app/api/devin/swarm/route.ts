import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  executeSwarmTask,
  decomposeIntoSubtasks,
  swarmOrchestrator,
  type SwarmTask,
  type Subtask,
  type SwarmResult
} from '@/lib/swarm-orchestrator'

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { action, taskId, description, strategy, coordination, maxParallel, subtasks } = body

    if (action === 'decompose') {
      if (!taskId || !description) {
        return NextResponse.json({ error: 'Missing taskId or description' }, { status: 400 })
      }
      const decomposed: Subtask[] = await decomposeIntoSubtasks(taskId, description)
      return NextResponse.json({ subtasks: decomposed })
    }

    if (action === 'execute') {
      if (!taskId || !subtasks || !strategy) {
        return NextResponse.json({ error: 'Missing required fields for swarm execution' }, { status: 400 })
      }

      const swarm: SwarmTask = {
        parentTaskId: taskId,
        strategy: strategy || 'feature-based',
        subtasks,
        coordination: coordination || 'parallel',
        maxParallel: maxParallel || 3
      }

      const result: SwarmResult = await executeSwarmTask(swarm)
      return NextResponse.json(result)
    }

    if (action === 'reserve') {
      if (!subtasks) {
        return NextResponse.json({ error: 'Missing subtasks' }, { status: 400 })
      }
      const reservations = await swarmOrchestrator.reserveFiles(subtasks)
      return NextResponse.json({ reservations: Object.fromEntries(reservations) })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Swarm operation failed', details: String(error) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'strategies') {
      return NextResponse.json({
        strategies: [
          { id: 'file-based', description: 'Split by files' },
          { id: 'feature-based', description: 'Split by features' },
          { id: 'risk-based', description: 'Split by risk level' }
        ]
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Swarm query failed', details: String(error) }, { status: 500 })
  }
}