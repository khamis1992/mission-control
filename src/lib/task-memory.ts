import { getDatabase } from './db'
import { eventBus } from './event-bus'
import type { Task } from './db'
import { logger } from './logger'

export interface TaskMemory {
  task_id: number
  successful_strategies: string[]
  failed_strategies: string[]
  preferred_stack: string[]
  patterns: string[]
  avg_execution_time?: number
  last_updated: number
}

const memoryCache = new Map<number, TaskMemory>()

export function getTaskMemory(taskId: number): TaskMemory | null {
  if (memoryCache.has(taskId)) {
    return memoryCache.get(taskId)!
  }
  return null
}

export function updateTaskMemory(
  taskId: number,
  executionTime: number,
  success: boolean,
  strategyUsed: string,
  stackUsed: string[]
): TaskMemory {
  let memory = memoryCache.get(taskId) || {
    task_id: taskId,
    successful_strategies: [],
    failed_strategies: [],
    preferred_stack: [],
    patterns: [],
    last_updated: 0
  }

  if (success) {
    if (!memory.successful_strategies.includes(strategyUsed)) {
      memory.successful_strategies.push(strategyUsed)
    }
    memory.patterns.push(`success_with_${strategyUsed}`)
  } else {
    if (!memory.failed_strategies.includes(strategyUsed)) {
      memory.failed_strategies.push(strategyUsed)
    }
    memory.patterns.push(`failed_with_${strategyUsed}`)
  }

  for (const tech of stackUsed) {
    if (!memory.preferred_stack.includes(tech)) {
      memory.preferred_stack.push(tech)
    }
  }

  memory.avg_execution_time = memory.avg_execution_time
    ? (memory.avg_execution_time * 0.7 + executionTime * 0.3)
    : executionTime

  memory.last_updated = Math.floor(Date.now() / 1000)
  memoryCache.set(taskId, memory)

  persistMemoryToDb(taskId, memory)

  return memory
}

function persistMemoryToDb(taskId: number, memory: TaskMemory): void {
  const db = getDatabase()
  const meta = { task_memory: memory }
  
  const existing = db.prepare('SELECT metadata FROM tasks WHERE id = ?').get(taskId) as any
  let parsedMeta = {}
  if (existing?.metadata) {
    parsedMeta = typeof existing.metadata === 'string' 
      ? JSON.parse(existing.metadata) 
      : existing.metadata
  }
  
  parsedMeta = { ...parsedMeta, task_memory: memory }
  
  db.prepare('UPDATE tasks SET metadata = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(parsedMeta), memory.last_updated, taskId)
}

export function getSimilarTasks(domain: string, limit: number = 5): TaskMemory[] {
  const db = getDatabase()
  const tasks = db.prepare(`
    SELECT t.id, t.metadata 
    FROM tasks t
    WHERE t.task_type = 'mission' AND t.metadata IS NOT NULL
  `).all() as any[]

  const memories: TaskMemory[] = []
  
  for (const t of tasks) {
    const meta = t.metadata ? (typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata) : {}
    const memory = meta.task_memory as TaskMemory
    if (memory && memory.preferred_stack.includes(domain)) {
      memories.push(memory)
    }
  }

  return memories
    .sort((a, b) => (b.last_updated || 0) - (a.last_updated || 0))
    .slice(0, limit)
}

export function suggestFromMemory(goal: string): { strategies: string[], stack: string[] } {
  const db = getDatabase()
  const tasks = db.prepare(`
    SELECT t.metadata 
    FROM tasks t
    WHERE t.task_type = 'mission' AND t.metadata LIKE '%task_memory%'
    ORDER BY t.updated_at DESC
    LIMIT 20
  `).all() as any[]

  const strategies: string[] = []
  const stack: string[] = []
  const patterns = new Set<string>()

  for (const t of tasks) {
    const meta = t.metadata ? (typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata) : {}
    const memory = meta.task_memory as TaskMemory
    if (memory) {
      strategies.push(...memory.successful_strategies.slice(0, 3))
      stack.push(...memory.preferred_stack.slice(0, 5))
      memory.patterns?.slice(0, 5).forEach((p: string) => patterns.add(p))
    }
  }

  return {
    strategies: [...new Set(strategies)].slice(0, 5),
    stack: [...new Set(stack)].slice(0, 5)
  }
}