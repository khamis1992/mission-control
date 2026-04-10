import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  estimateTaskCost,
  getOptimalModel,
  getAvailableModels,
  costOptimizer,
  type CostEstimate,
  type ModelRecommendation
} from '@/lib/cost-optimizer'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'models'
    const taskDescription = searchParams.get('taskDescription')
    const model = searchParams.get('model')

    if (action === 'estimate') {
      if (!taskDescription || !model) {
        return NextResponse.json({ error: 'Missing taskDescription or model' }, { status: 400 })
      }
      const estimate: CostEstimate = await estimateTaskCost(taskDescription, model)
      return NextResponse.json(estimate)
    }

    if (action === 'optimal-model') {
      if (!taskDescription) {
        return NextResponse.json({ error: 'Missing taskDescription' }, { status: 400 })
      }
      const optimal: string = await getOptimalModel(taskDescription)
      return NextResponse.json({ model: optimal })
    }

    if (action === 'models') {
      const models: ModelRecommendation[] = getAvailableModels()
      return NextResponse.json({ models })
    }

    if (action === 'historical') {
      const taskType = searchParams.get('taskType') || 'default'
      const avgCost: number = await costOptimizer.getHistoricalCosts(taskType)
      return NextResponse.json({ avgCost })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Cost query failed', details: String(error) }, { status: 500 })
  }
}