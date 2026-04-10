import { getDatabase } from './db'
import { getProjectAnalysis, ProjectAnalysis } from './project-analyzer'

export interface IterationPlan {
  id: number
  task_id: number
  iteration: number
  name: string
  goal: string
  scope: IterationScope
  tasks: IterationTask[]
  estimated_hours: number
  created_at: number
  workspace_id: number
}

export interface IterationScope {
  files: string[]
  features: string[]
  database_changes?: string[]
  api_endpoints?: string[]
}

export interface IterationTask {
  title: string
  description: string
  subtasks: IterationTask[]
  estimated_hours: number
  assigned_to?: string
  completed?: boolean
}

export interface IterationStatus {
  task_id: number
  current_iteration: number
  total_iterations: number
  progress: number
  status: 'in_progress' | 'completed' | 'review' | 'pending'
  last_updated: number
}

export function createIterationPlan(taskId: number, workspaceId: number, name: string, goal: string, scope: IterationScope): IterationPlan {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const existingAnalysis = getProjectAnalysis(taskId, workspaceId)

  const estimatedHours = existingAnalysis ? existingAnalysis.estimated_hours : calculateEstimate(scope)

  const planId = db
    .prepare(`
      INSERT INTO iteration_plans 
        (task_id, iteration, name, goal, scope, estimated_hours, created_at, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(taskId, 1, name, goal, JSON.stringify(scope), estimatedHours, now, workspaceId).lastInsertRowid as number

  return {
    id: planId,
    task_id: taskId,
    iteration: 1,
    name,
    goal,
    scope,
    tasks: [],
    estimated_hours: estimatedHours,
    created_at: now,
    workspace_id: workspaceId
  }
}

function calculateEstimate(scope: IterationScope): number {
  let estimate = 4

  estimate += (scope.features?.length || 0) * 8
  estimate += (scope.files?.length || 0) * 2
  estimate += (scope.database_changes?.length || 0) * 4
  estimate += (scope.api_endpoints?.length || 0) * 6

  return estimate
}

export function getIterationPlan(taskId: number, workspaceId: number): IterationPlan | null {
  const db = getDatabase()

  const result = db
    .prepare(`
      SELECT * FROM iteration_plans 
      WHERE task_id = ? AND workspace_id = ? 
      ORDER BY iteration DESC LIMIT 1
    `)
    .get(taskId, workspaceId) as any

  if (!result) return null

  return {
    ...result,
    scope: result.scope ? JSON.parse(result.scope) : { files: [], features: [] },
  }
}

export function addIterationTask(planId: number, task: IterationTask, subtasks: IterationTask[]): void {
  const db = getDatabase()

  db.prepare(`
    INSERT INTO iteration_tasks (plan_id, title, description, subtasks, estimated_hours)
    VALUES (?, ?, ?, ?, ?)
  `).run(planId, task.title, task.description || '', JSON.stringify(subtasks), task.estimated_hours)
}

export function updateIterationTasks(planId: number, tasks: IterationTask[]): void {
  const db = getDatabase()

  db.prepare('DELETE FROM iteration_tasks WHERE plan_id = ?').run(planId)

  for (const task of tasks) {
    db.prepare(`
      INSERT INTO iteration_tasks (plan_id, title, description, subtasks, estimated_hours)
      VALUES (?, ?, ?, ?, ?)
    `).run(planId, task.title, task.description || '', JSON.stringify(task.subtasks), task.estimated_hours)
  }
}

export function completeIteration(taskId: number, workspaceId: number): void {
  const db = getDatabase()

  const plan = getIterationPlan(taskId, workspaceId)
  if (!plan) return

  const currentIter = plan.iteration || 1
  const nextIter = currentIter + 1

  db.prepare(`
    UPDATE iteration_plans SET iteration = ? WHERE task_id = ? AND workspace_id = ?
  `).run(nextIter, taskId, workspaceId)
}

export function getIterationStatus(taskId: number, workspaceId: number): IterationStatus {
  const db = getDatabase()

  const plan = getIterationPlan(taskId, workspaceId)
  if (!plan) {
    return {
      task_id: taskId,
      current_iteration: 0,
      total_iterations: 1,
      progress: 0,
      status: 'pending',
      last_updated: Math.floor(Date.now() / 1000)
    }
  }

  const tasks = getIterationTasks(plan.id)
  const taskCount = tasks.length
  const completedTasks = tasks.filter(t => t.completed).length
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0

  let status: IterationStatus['status'] = 'in_progress'
  if (progress === 100) {
    status = 'completed'
  }

  return {
    task_id: taskId,
    current_iteration: plan.iteration || 1,
    total_iterations: plan.iteration || 1,
    progress,
    status,
    last_updated: Math.floor(Date.now() / 1000)
  }
}

export function getIterationTasks(planId: number): IterationTask[] {
  const db = getDatabase()

  const rows = db
    .prepare('SELECT * FROM iteration_tasks WHERE plan_id = ?')
    .all(planId) as any[]

  return rows.map(row => ({
    title: row.title,
    description: row.description || '',
    subtasks: row.subtasks ? JSON.parse(row.subtasks) : [],
    estimated_hours: row.estimated_hours || 1,
    completed: row.completed || false
  }))
}

export function listIterationPlans(taskId: number, workspaceId: number): IterationPlan[] {
  const db = getDatabase()

  const rows = db
    .prepare(`
      SELECT * FROM iteration_plans 
      WHERE task_id = ? AND workspace_id = ? 
      ORDER BY iteration ASC
    `)
    .all(taskId, workspaceId) as any[]

  return rows.map(row => ({
    ...row,
    scope: row.scope ? JSON.parse(row.scope) : { files: [], features: [] },
  }))
}

export function deleteIterationPlan(planId: number): void {
  const db = getDatabase()

  db.prepare('DELETE FROM iteration_tasks WHERE plan_id = ?').run(planId)
  db.prepare('DELETE FROM iteration_plans WHERE id = ?').run(planId)
}

export function planIteration(taskId: number, workspaceId: number): IterationPlan | null {
  const projectAnalysis = getProjectAnalysis(taskId, workspaceId)
  if (!projectAnalysis) return null

  const { project_type, framework, language, database, complexity, estimated_hours } = projectAnalysis

  const featureCount = Math.max(1, Math.floor(estimated_hours / 16))
  const scope: IterationScope = {
    files: [],
    features: Array(featureCount).fill('feature'),
  }

  if (database) {
    scope.database_changes = ['schema', 'migrations']
  }

  const plan = createIterationPlan(
    taskId,
    workspaceId,
    `Iteration ${projectAnalysis.framework || 'app'}`,
    `Build ${project_type || 'application'} in ${projectAnalysis.framework || 'unknown'}`,
    scope
  )

  return plan
}

export function scheduleIterations(taskId: number, workspaceId: number, iterations: number): void {
  const db = getDatabase()

  const basePlan = getIterationPlan(taskId, workspaceId)
  if (!basePlan) return

  for (let i = 1; i <= iterations; i++) {
    const existing = db
      .prepare('SELECT id FROM iteration_plans WHERE task_id = ? AND iteration = ? AND workspace_id = ?')
      .get(taskId, i, workspaceId) as any

    if (!existing) {
      createIterationPlan(
        taskId,
        workspaceId,
        `Iteration ${i}: ${basePlan.name}`,
        `${basePlan.goal} - Phase ${i}`,
        basePlan.scope
      )
    }
  }
}

export function getEstimatedHours(taskId: number, workspaceId: number): number {
  const analysis = getProjectAnalysis(taskId, workspaceId)
  return analysis?.estimated_hours || 40
}

export function getTaskCounts(workspaceId: number): { total: number; completed: number; pending: number } {
  const db = getDatabase()

  const rows = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN progress >= 100 THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN progress < 100 THEN 1 ELSE 0 END) as pending
    FROM (
      SELECT task_id, MAX(progress) as progress
      FROM iteration_status
      WHERE workspace_id = ?
      GROUP BY task_id
    )
  `).all(workspaceId) as any[]

  return {
    total: rows[0]?.total || 0,
    completed: rows[0]?.completed || 0,
    pending: rows[0]?.pending || 0,
  }
}

export function getTaskBreakdown(taskId: number, workspaceId: number): { byFeature: Record<string, number>; byFile: number[] } {
  const db = getDatabase()

  const plan = getIterationPlan(taskId, workspaceId)
  if (!plan) return { byFeature: {}, byFile: [] }

  return {
    byFeature: { [plan.name]: plan.scope.features?.length || 0 },
    byFile: [plan.scope.files?.length || 0],
  }
}

export function getIterationsForTask(taskId: number, workspaceId: number): IterationPlan[] {
  return listIterationPlans(taskId, workspaceId)
}

export function assignTaskToIteration(planId: number, taskId: number, subtasks: IterationTask[]): void {
  addIterationTask(planId, { title: '', description: '', subtasks, estimated_hours: 0 }, subtasks)
}

export function validateIterationPlan(plan: IterationPlan): boolean {
  if (!plan.name || !plan.goal) return false
  if (plan.tasks?.length === 0 && plan.estimated_hours === 0) return false
  if (plan.scope.files?.length === 0 && plan.scope.features?.length === 0) return false
  return true
}
