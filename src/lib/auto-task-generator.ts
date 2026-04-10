import { getDatabase } from './db'
import { eventBus } from './event-bus'
import type { Task } from './db'
import { callClaudeDirectly } from './task-dispatch'
import { logger } from './logger'

export interface GeneratedSubtask {
  title: string
  description?: string
  agent_role: 'planner' | 'architect' | 'backend' | 'frontend' | 'qa' | 'devops' | 'reviewer' | 'recovery'
  execution_mode: 'autonomous'
  parallel_group?: string
  depends_on?: number[]
}

interface GoalAnalysis {
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

function getGoalAnalysis(task: Task): GoalAnalysis | null {
  const metadata = task.metadata 
    ? (typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata)
    : {}
  return metadata.goal_analysis?.goal_analysis || null
}

/**
 * Generate subtasks for a mission task using AI task decomposition.
 * Uses goal_analysis if available for smarter generation.
 */
export async function generateSubtasks(rootTask: Task, workspaceId: number): Promise<GeneratedSubtask[]> {
  const goalAnalysis = getGoalAnalysis(rootTask)
  
  let prompt: string
  
  if (goalAnalysis) {
    prompt = `You are a senior software architect. Break down this task into 6-12 subtasks based on the goal analysis.

Task: ${rootTask.title}
${rootTask.description || ''}

GOAL ANALYSIS:
- Domain: ${goalAnalysis.domain}
- Entities: ${goalAnalysis.entities.join(', ')}
- Modules: ${goalAnalysis.modules.join(', ')}
- Workflows: ${goalAnalysis.workflows.join(', ')}
- Integrations: ${goalAnalysis.integrations.join(', ')}
- Risks: ${goalAnalysis.risks.join(', ')}
- Architecture: ${goalAnalysis.suggestedArchitecture}
- Strategy: ${goalAnalysis.executionStrategy}
- Complexity: ${goalAnalysis.complexity}

Generate subtasks that are SPECIFIC to this domain and requirements. Include:
1. Domain-specific modules (based on entities and modules above)
2. API endpoints for each workflow
3. Frontend components for each workflow
4. Integration setup (if any)
5. Domain-specific tests
6. Domain-specific deployment

Return ONLY a JSON array (no markdown, no code blocks) with enhanced subtasks:
[
  {
    "title": "Design database schema",
    "description": "Create schema for ${goalAnalysis.entities.join(', ')} entities",
    "agent_role": "architect",
    "execution_mode": "autonomous",
    "parallel_group": "phase-1",
    "depends_on": []
  }
]

Include "depends_on" array for task dependencies (empty if no dependencies).`
  } else {
    prompt = `You are a senior software architect. Break down this task into 6-10 subtasks.

Task: ${rootTask.title}
${rootTask.description || ''}

Generate subtasks covering:
1. Product planning (planner role)
2. Architecture design (architect role)
3. Database design (architect role)
4. Backend API (backend role)
5. Frontend UI (frontend role)
6. Testing (qa role)
7. Deployment (devops role)
8. Documentation (planner role)

Return ONLY a JSON array (no markdown, no code blocks):
[
  {
    "title": "Design database schema",
    "description": "Create schema for car rental entities",
    "agent_role": "architect",
    "execution_mode": "autonomous",
    "parallel_group": "phase-1"
  }
]

Group parallel tasks with same parallel_group (e.g., backend + frontend can run together).`
  }

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

    const text = response.text || '[]'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const subtasks = JSON.parse(cleaned)

    return Array.isArray(subtasks) ? subtasks : []
  } catch (error) {
    logger.error({ err: error, taskId: rootTask.id }, 'Failed to generate subtasks, using defaults')
    return getDefaultSubtasks(rootTask)
  }
}

/**
 * Default subtask structure for mission tasks when AI generation fails.
 */
function getDefaultSubtasks(rootTask: Task): GeneratedSubtask[] {
  return [
    {
      title: 'Create PRD',
      description: 'Product requirements document',
      agent_role: 'planner',
      execution_mode: 'autonomous',
      parallel_group: 'planning'
    },
    {
      title: 'Design architecture',
      description: 'System architecture document',
      agent_role: 'architect',
      execution_mode: 'autonomous',
      parallel_group: 'planning'
    },
    {
      title: 'Design database schema',
      description: 'Database schema design',
      agent_role: 'architect',
      execution_mode: 'autonomous',
      parallel_group: 'phase-1'
    },
    {
      title: 'Implement backend API',
      description: 'Backend REST API',
      agent_role: 'backend',
      execution_mode: 'autonomous',
      parallel_group: 'phase-2'
    },
    {
      title: 'Implement frontend UI',
      description: 'Frontend components',
      agent_role: 'frontend',
      execution_mode: 'autonomous',
      parallel_group: 'phase-2'
    },
    {
      title: 'Write tests',
      description: 'Test suite',
      agent_role: 'qa',
      execution_mode: 'autonomous',
      parallel_group: 'phase-3'
    },
    {
      title: 'Deploy to staging',
      description: 'Deployment configuration',
      agent_role: 'devops',
      execution_mode: 'autonomous',
      parallel_group: 'phase-4'
    }
  ]
}

/**
 * Create subtask graph for a mission task.
 * Generates subtasks via AI and inserts them into the database.
 */
export async function createSubtaskGraph(rootTaskId: number, workspaceId: number): Promise<{ ok: boolean; count: number }> {
  const db = getDatabase()
  
  const rootTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
    .get(rootTaskId, workspaceId) as Task | undefined
  
  if (!rootTask) {
    throw new Error('Root task not found')
  }

  if (rootTask.task_type !== 'mission') {
    throw new Error('Only mission tasks can generate subtasks')
  }

  const subtasks = await generateSubtasks(rootTask, workspaceId)
  
  const insertStmt = db.prepare(`
    INSERT INTO tasks (
      title, description, status, priority, project_id,
      parent_task_id, task_type, execution_mode, agent_role,
      parallel_group_id, workspace_id, created_by, created_at, updated_at
    ) VALUES (?, ?, 'inbox', 'medium', ?, ?, 'subtask', 'autonomous', ?, ?, ?, 'system', ?, ?)
  `)

  const now = Math.floor(Date.now() / 1000)
  let count = 0

  const transaction = db.transaction(() => {
    for (const subtask of subtasks) {
      insertStmt.run(
        subtask.title,
        subtask.description || '',
        rootTask.project_id,
        rootTaskId,
        subtask.agent_role,
        subtask.parallel_group || null,
        workspaceId,
        now,
        now
      )
      count++
    }
  })

  transaction()

  eventBus.broadcast('task.subtasks_generated', {
    parent_id: rootTaskId,
    count,
    workspace_id: workspaceId
  })

  logger.info({ taskId: rootTaskId, count }, 'Subtask graph created')

  return { ok: true, count }
}

/**
 * Group subtasks by their parallel execution group.
 */
export function groupByParallelExecution(subtasks: GeneratedSubtask[]): Record<string, GeneratedSubtask[]> {
  const groups: Record<string, GeneratedSubtask[]> = {}
  
  for (const subtask of subtasks) {
    const groupId = subtask.parallel_group || 'sequential'
    if (!groups[groupId]) groups[groupId] = []
    groups[groupId].push(subtask)
  }
  
  return groups
}