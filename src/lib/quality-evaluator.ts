import { getDatabase } from './db'
import type { Task } from './db'
import { logger } from './logger'

export interface QualityMetrics {
  task_id: number
  completeness_score: number
  quality_score: number
  code_quality: number
  test_coverage: number
  validation_status: 'passed' | 'failed' | 'pending'
  issues: string[]
  evaluated_at: number
}

export async function evaluateMissionQuality(rootTaskId: number, workspaceId: number): Promise<QualityMetrics> {
  const db = getDatabase()
  
  const rootTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(rootTaskId) as Task
  const subtasks = db.prepare(`
    SELECT * FROM tasks WHERE parent_task_id = ? AND task_type = 'subtask'
  `).all(rootTaskId) as Task[]

  const completed = subtasks.filter(t => t.status === 'done').length
  const failed = subtasks.filter(t => t.status === 'failed').length
  const total = subtasks.length

  const completeness_score = total > 0 ? (completed / total) * 100 : 0
  const quality_score = failed === 0 ? 100 : Math.max(0, 100 - (failed * 20))
  
  const code_quality = quality_score * 0.8
  const test_coverage = completeness_score > 80 ? 75 : completeness_score > 50 ? 50 : 25

  const issues: string[] = []
  if (completeness_score < 100) issues.push(`${total - completed} subtasks incomplete`)
  if (failed > 0) issues.push(`${failed} subtasks failed`)
  if (test_coverage < 50) issues.push('Low test coverage')

  const validation_status = issues.length === 0 ? 'passed' : 'failed'

  const metrics: QualityMetrics = {
    task_id: rootTaskId,
    completeness_score,
    quality_score,
    code_quality,
    test_coverage,
    validation_status,
    issues,
    evaluated_at: Math.floor(Date.now() / 1000)
  }

  const metadata = rootTask.metadata 
    ? (typeof rootTask.metadata === 'string' ? JSON.parse(rootTask.metadata) : rootTask.metadata)
    : {}
  metadata.quality_metrics = metrics

  db.prepare('UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(metadata), Math.floor(Date.now() / 1000), rootTaskId)

  logger.info({ rootTaskId, completeness_score, quality_score }, 'Quality evaluation complete')

  return metrics
}

export function getQualityMetrics(task: Task): QualityMetrics | null {
  const metadata = task.metadata 
    ? (typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata)
    : {}
  return metadata.quality_metrics || null
}