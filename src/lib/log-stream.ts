import { eventBus } from './event-bus'
import { getDatabase } from './db'
import { logger } from './logger'

export interface LogChunk {
  taskId: number
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'warning'
  text: string
  timestamp: number
  source: 'build' | 'terminal' | 'agent' | 'test' | 'deploy'
}

export interface LogHistoryOptions {
  limit?: number
  since?: number
  types?: LogChunk['type'][]
  sources?: LogChunk['source'][]
}

const logBuffers = new Map<number, LogChunk[]>()
const MAX_BUFFER_SIZE = 200

export function broadcastLog(chunk: LogChunk): void {
  const buffer = logBuffers.get(chunk.taskId) || []
  buffer.push(chunk)
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE)
  }
  logBuffers.set(chunk.taskId, buffer)
  
  eventBus.broadcast('task.log', {
    task_id: chunk.taskId,
    type: chunk.type,
    text: chunk.text,
    timestamp: chunk.timestamp,
    source: chunk.source
  })
}

export function getLogHistory(taskId: number, options?: LogHistoryOptions): LogChunk[] {
  const buffer = logBuffers.get(taskId) || []
  let logs = [...buffer]
  
  if (options?.since) {
    logs = logs.filter(l => l.timestamp >= options.since!)
  }
  
  if (options?.types && options.types.length > 0) {
    logs = logs.filter(l => options.types!.includes(l.type))
  }
  
  if (options?.sources && options.sources.length > 0) {
    logs = logs.filter(l => options.sources!.includes(l.source))
  }
  
  if (options?.limit) {
    logs = logs.slice(-options.limit)
  }
  
  return logs
}

export function storeLogChunk(chunk: LogChunk): void {
  try {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)
    
    db.prepare(`
      INSERT INTO task_logs (task_id, type, text, timestamp, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      chunk.taskId,
      chunk.type,
      chunk.text,
      chunk.timestamp,
      chunk.source,
      now
    )
  } catch (error) {
    logger.error({ error, taskId: chunk.taskId }, 'Failed to store log chunk')
  }
}

export function clearLogBuffer(taskId: number): void {
  logBuffers.delete(taskId)
}

export function clearAllLogBuffers(): void {
  logBuffers.clear()
}

export function createLogStream(taskId: number, source: LogChunk['source']): {
  stdout: (text: string) => void
  stderr: (text: string) => void
  info: (text: string) => void
  error: (text: string) => void
  warning: (text: string) => void
} {
  const emit = (type: LogChunk['type'], text: string) => {
    broadcastLog({
      taskId,
      type,
      text,
      timestamp: Date.now(),
      source
    })
  }
  
  return {
    stdout: (text: string) => emit('stdout', text),
    stderr: (text: string) => emit('stderr', text),
    info: (text: string) => emit('info', text),
    error: (text: string) => emit('error', text),
    warning: (text: string) => emit('warning', text)
  }
}

export function createBufferedLogStream(
  taskId: number,
  source: LogChunk['source'],
  options?: { persistToDb?: boolean; bufferSize?: number }
): {
  write: (text: string, type?: LogChunk['type']) => void
  flush: () => LogChunk[]
  getHistory: () => LogChunk[]
} {
  const buffer: LogChunk[] = []
  const persistToDb = options?.persistToDb ?? false
  const maxSize = options?.bufferSize ?? 100
  
  const write = (text: string, type: LogChunk['type'] = 'stdout') => {
    const chunk: LogChunk = {
      taskId,
      type,
      text,
      timestamp: Date.now(),
      source
    }
    
    buffer.push(chunk)
    if (buffer.length > maxSize) {
      buffer.splice(0, buffer.length - maxSize)
    }
    
    broadcastLog(chunk)
    
    if (persistToDb) {
      storeLogChunk(chunk)
    }
  }
  
  return {
    write,
    flush: () => [...buffer],
    getHistory: () => getLogHistory(taskId)
  }
}

export function getRecentLogsForWorkspace(workspaceId: number, limit: number = 100): LogChunk[] {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT tl.task_id, tl.type, tl.text, tl.timestamp, tl.source
      FROM task_logs tl
      JOIN tasks t ON t.id = tl.task_id
      WHERE t.workspace_id = ?
      ORDER BY tl.timestamp DESC
      LIMIT ?
    `).all(workspaceId, limit) as Array<{
      task_id: number
      type: string
      text: string
      timestamp: number
      source: string
    }>
    
    return rows.map(row => ({
      taskId: row.task_id,
      type: row.type as LogChunk['type'],
      text: row.text,
      timestamp: row.timestamp,
      source: row.source as LogChunk['source']
    }))
  } catch (error) {
    logger.error({ error, workspaceId }, 'Failed to get recent logs')
    return []
  }
}

export function cleanupOldLogs(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  try {
    const db = getDatabase()
    const cutoff = Math.floor((Date.now() - maxAgeMs) / 1000)
    
    const result = db.prepare(`
      DELETE FROM task_logs WHERE created_at < ?
    `).run(cutoff)
    
    return result.changes
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup old logs')
    return 0
  }
}