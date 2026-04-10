import { getDatabase } from './db'
import { eventBus } from './event-bus'
import type { Task } from './db'
import { callClaudeDirectly } from './task-dispatch'
import { logger } from './logger'

export interface GoalAnalysis {
  domain: string
  entities: string[]
  modules: string[]
  workflows: string[]
  integrations: string[]
  risks: string[]
  suggestedArchitecture: string
  executionStrategy: string
  complexity: 'low' | 'medium' | 'high'
}

export interface AnalysisResult {
  goal_analysis: GoalAnalysis
  analyzed_at: number
  model_used: string
}

export async function generateGoalAnalysis(rootTask: Task, workspaceId: number): Promise<AnalysisResult | null> {
  const prompt = `You are a senior software architect. Analyze this task deeply to understand its requirements.

Task: ${rootTask.title}
${rootTask.description || ''}

Analyze and return ONLY a JSON object with:
{
  "domain": "primary domain (e.g., e-commerce, fintech)",
  "entities": ["User", "Product", "Order"],
  "modules": ["auth", "payments", "notifications"],
  "workflows": ["signup", "purchase"],
  "integrations": ["stripe", "sendgrid"],
  "risks": ["security", "performance"],
  "suggestedArchitecture": "brief recommendation",
  "executionStrategy": "sequential|parallel",
  "complexity": "low|medium|high"
}`

  try {
    const response = await callClaudeDirectly({
      id: rootTask.id,
      title: rootTask.title,
      description: prompt,
      status: rootTask.status,
      priority: rootTask.priority,
      assigned_to: rootTask.assigned_to || '',
      workspace_id: workspaceId,
      agent_name: rootTask.assigned_to || 'system',
      agent_id: 0,
      agent_config: null,
      ticket_prefix: null,
      project_ticket_no: null,
      project_id: rootTask.project_id || null,
    }, prompt)

    const text = response.text || '{}'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const analysis = JSON.parse(cleaned) as GoalAnalysis

    const now = Math.floor(Date.now() / 1000)
    const result: AnalysisResult = {
      goal_analysis: analysis,
      analyzed_at: now,
      model_used: 'claude'
    }

    const metadata = rootTask.metadata 
      ? (typeof rootTask.metadata === 'string' ? JSON.parse(rootTask.metadata) : rootTask.metadata)
      : {}
    metadata.goal_analysis = result

    getDatabase().prepare('UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(metadata), now, rootTask.id)

    eventBus.broadcast('task:goal_analyzed' as any, {
      task_id: rootTask.id,
      workspace_id: workspaceId,
      complexity: analysis.complexity,
      domain: analysis.domain
    })

    logger.info({ taskId: rootTask.id, complexity: analysis.complexity }, 'Goal analysis complete')
    return result
  } catch (error) {
    logger.error({ err: error, taskId: rootTask.id }, 'Goal analysis failed')
    return null
  }
}

export function getGoalAnalysis(task: Task): AnalysisResult | null {
  const metadata = task.metadata 
    ? (typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata)
    : {}
  return metadata.goal_analysis || null
}

export async function analyzeTaskGoal(rootTaskId: number, workspaceId: number): Promise<AnalysisResult | null> {
  const db = getDatabase()
  const rootTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
    .get(rootTaskId, workspaceId) as Task | undefined
  if (!rootTask) return null
  return generateGoalAnalysis(rootTask, workspaceId)
}