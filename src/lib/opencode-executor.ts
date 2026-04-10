import { getDatabase } from './db'
import { eventBus } from './event-bus'
import type { Task } from './db'
import { opencodeAgent, executeOpenCodeTask, type OpenCodeResult } from './opencode-agent'
import { getAgentConfig } from './opencode-config'
import { callClaudeDirectly } from './task-dispatch'
import { logger } from './logger'
import { updateTaskMemory, suggestFromMemory } from './task-memory'

export interface ExecutionResult {
  subtaskId: number
  success: boolean
  result: OpenCodeResult
  retryCount: number
}

export interface TaskExecutionContext {
  rootTaskId: number
  workspaceId: number
  projectPath: string
  onProgress?: (subtaskId: number, status: string) => void
}

interface TaskMetadata {
  goal_analysis?: any
  depends_on?: number[]
}

function getTaskDependencies(task: Task): number[] {
  const meta = task.metadata 
    ? (typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata) 
    : {}
  return meta.depends_on || []
}

function areDependenciesMet(task: Task, completedIds: Set<number>): boolean {
  const deps = getTaskDependencies(task)
  if (deps.length === 0) return true
  return deps.every(id => completedIds.has(id))
}

function mapRoleToOpenCodeAgent(role: string): string {
  const roleMap: Record<string, string> = {
    'planner': 'planner',
    'architect': 'architect',
    'backend': 'developer',
    'frontend': 'developer',
    'qa': 'tester',
    'devops': 'deployer',
    'reviewer': 'reviewer',
    'recovery': 'developer'
  }
  return roleMap[role] || 'developer'
}

function buildExecutionPrompt(subtask: Task, rootTask: Task): string {
  const agentConfig = getAgentConfig(mapRoleToOpenCodeAgent(subtask.agent_role || 'developer'))
  
  return `${agentConfig.prompt}

ROOT TASK: ${rootTask.title}
${rootTask.description || ''}

CURRENT SUBTASK: ${subtask.title}
${subtask.description || ''}

Execute this subtask autonomously. Create the necessary files, write tests, and ensure the code works.
Working directory: The project root.
`
}

async function analyzeFailureAndCreateRemediation(
  failedTask: Task,
  rootTask: Task,
  result: OpenCodeResult,
  workspaceId: number
): Promise<Task | null> {
  const db = getDatabase()
  
  const prompt = `Analyze this failed task and create a remediation plan.

Failed Task: ${failedTask.title}
Errors: ${result.errors.join('\n')}

Return ONLY a JSON object:
{
  "title": "Fix description",
  "description": "What needs to be fixed",
  "agent_role": "recovery",
  "depends_on": []
}`

  try {
    const response = await callClaudeDirectly({
      id: failedTask.id,
      title: failedTask.title,
      description: prompt,
      status: 'inbox',
      priority: 'high',
      assigned_to: '',
      workspace_id: workspaceId,
      agent_name: 'system',
      agent_id: 0,
      agent_config: null,
      ticket_prefix: null,
      project_ticket_no: null,
      project_id: rootTask.project_id || null,
    }, prompt)

    const text = response.text || '{}'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const fix = JSON.parse(cleaned)

    const now = Math.floor(Date.now() / 1000)
    const insertId = db.prepare(`
      INSERT INTO tasks (title, description, status, priority, project_id, parent_task_id, task_type, execution_mode, agent_role, depends_on, workspace_id, created_by, created_at, updated_at)
      VALUES (?, ?, 'inbox', 'high', ?, ?, 'subtask', 'autonomous', 'recovery', ?, ?, 'system', ?, ?)
    `).run(
      fix.title || 'Fix ' + failedTask.title,
      fix.description || result.errors[0] || 'Auto-created fix',
      rootTask.project_id,
      failedTask.parent_task_id || rootTask.id,
      JSON.stringify(fix.depends_on || [failedTask.id]),
      workspaceId,
      now,
      now
    ).lastInsertRowid

    logger.info({ failedTaskId: failedTask.id, fixTaskId: insertId }, 'Created remediation task')

    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(insertId) as Task
  } catch (error) {
    logger.error({ err: error, taskId: failedTask.id }, 'Failed to create remediation')
    return null
  }
}

async function executeSubtask(
  subtask: Task,
  rootTask: Task,
  projectPath: string,
  retryCount: number = 0
): Promise<ExecutionResult> {
  const db = getDatabase()
  const maxRetries = 3
  
  logger.info({ 
    subtaskId: subtask.id, 
    title: subtask.title,
    retryCount 
  }, 'Executing subtask with OpenCode')

  const prompt = buildExecutionPrompt(subtask, rootTask)
  const agent = mapRoleToOpenCodeAgent(subtask.agent_role || 'developer')

  let result: OpenCodeResult
  
  try {
    result = await executeOpenCodeTask(prompt, agent, projectPath)
  } catch (error) {
    result = {
      success: false,
      output: '',
      errors: [(error as Error).message],
      exitCode: 1,
      duration: 0
    }
  }

  if (!result.success && retryCount < maxRetries) {
    logger.warn({ 
      subtaskId: subtask.id,
      errors: result.errors 
    }, 'Subtask failed, retrying with error context')

    const retryPrompt = `${prompt}

PREVIOUS ATTEMPT FAILED WITH ERRORS:
${result.errors.join('\n')}

Please fix these errors and complete the task.`
    
    const retryResult = await executeOpenCodeTask(retryPrompt, agent, projectPath)
    return {
      subtaskId: subtask.id,
      success: retryResult.success,
      result: retryResult,
      retryCount: retryCount + 1
    }
  }

  return {
    subtaskId: subtask.id,
    success: result.success,
    result,
    retryCount
  }
}

export async function executeMissionWithOpenCode(
  context: TaskExecutionContext
): Promise<{ ok: boolean; results: ExecutionResult[] }> {
  const db = getDatabase()
  const { rootTaskId, workspaceId, projectPath, onProgress } = context

  const rootTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
    .get(rootTaskId, workspaceId) as Task | undefined

  if (!rootTask) {
    throw new Error('Root task not found')
  }

  const subtasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE parent_task_id = ? AND workspace_id = ? AND task_type = 'subtask'
    ORDER BY created_at ASC
  `).all(rootTaskId, workspaceId) as Task[]

  if (subtasks.length === 0) {
    logger.warn({ rootTaskId }, 'No subtasks found to execute')
    return { ok: true, results: [] }
  }

  logger.info({ 
    rootTaskId, 
    subtaskCount: subtasks.length 
  }, 'Starting OpenCode execution for mission subtasks')

  const results: ExecutionResult[] = []
  const completedIds = new Set<number>()
  const inProgressIds = new Set<number>()
  const remediationTasks: Task[] = []
  
  const pending = [...subtasks]
  const blocked: Task[] = []
  
  while (pending.length > 0 || blocked.length > 0) {
    while (pending.length > 0) {
      const readyTasks = pending.filter(t => 
        areDependenciesMet(t, completedIds) && !inProgressIds.has(t.id)
      )
      
      if (readyTasks.length === 0) {
        const next = pending.shift()
        if (next && !blocked.find(b => b.id === next.id)) {
          blocked.push(next)
        }
        break
      }
      
      for (const subtask of readyTasks) {
        pending.splice(pending.indexOf(subtask), 1)
        inProgressIds.add(subtask.id)
        
        onProgress?.(subtask.id, 'running')
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?')
          .run('in_progress', subtask.id)

        logger.info({ subtaskId: subtask.id, title: subtask.title }, 'Executing subtask')

        const result = await executeSubtask(subtask, rootTask, projectPath)
        results.push(result)

        const newStatus = result.success ? 'done' : 'failed'
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?')
          .run(newStatus, subtask.id)

        inProgressIds.delete(subtask.id)
        let fixTaskCreated = false
        if (result.success) {
          completedIds.add(subtask.id)
        } else {
          const fixTask = await analyzeFailureAndCreateRemediation(subtask, rootTask, result.result, workspaceId)
          if (fixTask) {
            remediationTasks.push(fixTask)
            pending.push(fixTask)
            fixTaskCreated = true
            logger.info({ fixTaskId: fixTask.id }, 'Added remediation task to queue')
          }
        }

        onProgress?.(subtask.id, newStatus)

        eventBus.emit('task:subtask_executed' as any, {
          subtask_id: subtask.id,
          root_task_id: rootTaskId,
          success: result.success,
          retry_count: result.retryCount,
          remediation_created: fixTaskCreated
        })
      }
    }
    
    if (blocked.length > 0) {
      const unblocked: Task[] = []
      for (const b of blocked) {
        if (areDependenciesMet(b, completedIds)) {
          unblocked.push(b)
        }
      }
      for (const u of unblocked) {
        blocked.splice(blocked.indexOf(u), 1)
        pending.push(u)
      }
      if (unblocked.length === 0 && pending.length === 0) {
        break
      }
    }
  }

  const allSuccess = results.every(r => r.success) && remediationTasks.length === 0
  const finalStatus = allSuccess ? 'done' : 'in_progress'
  
  const totalDuration = results.reduce((sum, r) => sum + r.result.duration, 0)
  
  updateTaskMemory(
    rootTaskId,
    totalDuration,
    allSuccess,
    rootTask.execution_mode || 'autonomous',
    []
  )

  const memorySuggestions = suggestFromMemory(rootTask.title)
  logger.info({ rootTaskId, suggestions: memorySuggestions }, 'Task memory updated')

  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(finalStatus, Math.floor(Date.now() / 1000), rootTaskId)
  
  logger.info({ 
    rootTaskId,
    totalSubtasks: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    remediationCreated: remediationTasks.length,
    totalDuration
  }, 'Mission execution completed')

  return { ok: allSuccess, results }
}

export function getExecutionStatus(rootTaskId: number): {
  total: number
  completed: number
  failed: number
  inProgress: number
} {
  const db = getDatabase()
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
    FROM tasks 
    WHERE parent_task_id = ? AND task_type = 'subtask'
  `).get(rootTaskId) as any

  return {
    total: stats.total || 0,
    completed: stats.completed || 0,
    failed: stats.failed || 0,
    inProgress: stats.in_progress || 0
  }
}