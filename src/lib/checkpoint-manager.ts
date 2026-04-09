import { getDatabase } from './db'
import { eventBus } from './event-bus'

export interface Checkpoint {
  stage: string
  progress: number
  timestamp: number
  data?: any
  message?: string
}

export function saveCheckpoint(taskId: number, checkpoint: Checkpoint): void {
  const db = getDatabase()
  
  const existing = db.prepare('SELECT checkpoint_data FROM tasks WHERE id = ?').get(taskId) as any
  const existingCheckpoint = existing?.checkpoint_data 
    ? JSON.parse(existing.checkpoint_data) 
    : null
  
  const merged = existingCheckpoint 
    ? { ...existingCheckpoint, ...checkpoint, timestamp: Date.now() }
    : { ...checkpoint, timestamp: Date.now() }
  
  db.prepare(`
    UPDATE tasks 
    SET checkpoint_data = ?, updated_at = ? 
    WHERE id = ?
  `).run(JSON.stringify(merged), Math.floor(Date.now() / 1000), taskId)
  
  eventBus.broadcast('task.checkpoint_saved', { 
    task_id: taskId, 
    stage: checkpoint.stage,
    progress: checkpoint.progress 
  })
}

export function resumeFromCheckpoint(taskId: number): Checkpoint | null {
  const db = getDatabase()
  const task = db.prepare('SELECT checkpoint_data FROM tasks WHERE id = ?').get(taskId) as any
  
  if (!task?.checkpoint_data) return null
  
  try {
    return JSON.parse(task.checkpoint_data)
  } catch {
    return null
  }
}

export function clearCheckpoint(taskId: number): void {
  const db = getDatabase()
  db.prepare('UPDATE tasks SET checkpoint_data = NULL WHERE id = ?').run(taskId)
}

export function updateProgress(taskId: number, progress: number, message: string): void {
  saveCheckpoint(taskId, { progress, message, stage: 'in_progress', timestamp: Date.now() })
}