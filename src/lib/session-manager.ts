import { getDatabase } from './db'
import { eventBus } from './event-bus'
import { logger } from './logger'

/** Session phase in the Observe-Reflect-Adapt loop */
export type SessionPhase = 
  | 'initializing'
  | 'planning'
  | 'executing'
  | 'observing'
  | 'reflecting'
  | 'adapting'
  | 'completed'
  | 'failed'

// Session status for tracking agent execution
export type SessionStatus = 
  | 'initializing'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

// Error classification from error-analyzer patterns
export type ErrorType = 
  | 'syntax'
  | 'dependency'
  | 'runtime'
  | 'config'
  | 'file_missing'
  | 'type_error'
  | 'timeout'
  | 'logic'
  | 'unknown'

// Observation result from executing an action
export interface Observation {
  phase: 'planning' | 'executing' | 'build' | 'test' | 'deploy'
  success: boolean
  output: string
  errors: Array<{
    type: ErrorType
    message: string
    file?: string
    line?: number
    column?: number
    autoFixable: boolean
  }>
  artifacts?: Array<{
    type: 'file' | 'url' | 'config' | 'log'
    path: string
    content?: string
  }>
  timestamp: number
  durationMs: number
}

// Reflection result from analyzing observation
export interface Reflection {
  isSuccess: boolean
  confidence: number // 0-1
  summary: string
  issues: Array<{
    severity: 'critical' | 'warning' | 'info'
    description: string
    suggestedAction?: string
  }>
  nextAction: 'continue' | 'adapt' | 'retry' | 'escalate' | 'complete'
  shouldAdapt: boolean
  adaptationType?: 'fix_error' | 'refine_plan' | 'change_approach' | 'request_help'
}

// Adaptation applied based on reflection
export interface Adaptation {
  type: 'fix_error' | 'refine_plan' | 'change_approach' | 'request_help'
  description: string
  changes: Array<{
    file?: string
    action: 'create' | 'modify' | 'delete'
    content?: string
    patch?: string
  }>
  reasoning: string
  attemptNumber: number
}

// Session checkpoint for persistence
export interface SessionCheckpoint {
  taskId: number
  workspaceId: number
  status: SessionStatus
  phase: SessionPhase
  startedAt: number
  lastHeartbeat: number
  attemptCount: number
  maxAttempts: number
  
  // Current execution state
  currentPlan?: {
    steps: Array<{
      id: string
      description: string
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
      startedAt?: number
      completedAt?: number
      output?: string
    }>
    currentStepIndex: number
  }
  
  // Last observation result
  lastObservation?: Observation
  
  // Last reflection analysis
  lastReflection?: Reflection
  
  // Last adaptation applied (if any)
  lastAdaptation?: Adaptation
  
  // Error history
  errorHistory: Array<{
    attemptNumber: number
    error: string
    errorType: ErrorType
    timestamp: number
    recovered: boolean
  }>
  
  // Session logs
  sessionLogs: Array<{
    timestamp: number
    phase: SessionPhase
    type: 'info' | 'warning' | 'error' | 'success' | 'adaptation'
    message: string
    data?: Record<string, unknown>
  }>
  
  // Configuration
  config: {
    autoFixEnabled: boolean
    timeoutMs: number
    stopOnHardFailure: boolean
    escalateAfterNAttempts: boolean
    heartbeatIntervalMs: number
    checkpointIntervalMs: number
  }
}

// Session creation options
export interface SessionConfig {
  taskId: number
  workspaceId: number
  maxAttempts?: number
  autoFixEnabled?: boolean
  timeoutMs?: number
  stopOnHardFailure?: boolean
  escalateAfterNAttempts?: boolean
  heartbeatIntervalMs?: number
  checkpointIntervalMs?: number
}

// Session result after completion
export interface SessionResult {
  sessionId: string
  taskId: number
  status: 'completed' | 'failed' | 'cancelled' | 'timeout'
  finalObservation?: Observation
  finalReflection?: Reflection
  totalAttempts: number
  totalDurationMs: number
  artifacts: Array<{ type: string; path: string; content?: string }>
  summary: string
  lessons?: string[] // Learned patterns for memory system
}

// Active session tracking (in-memory)
const activeSessions = new Map<string, {
  checkpoint: SessionCheckpoint
  abortController: AbortController
  heartbeatInterval?: NodeJS.Timeout
}>()

/**
 * Create a new agent session
 */
export function createSession(config: SessionConfig): string {
  const sessionId = `session-${config.taskId}-${Date.now()}`
  const now = Date.now()
  
  const checkpoint: SessionCheckpoint = {
    taskId: config.taskId,
    workspaceId: config.workspaceId,
    status: 'initializing',
    phase: 'initializing',
    startedAt: now,
    lastHeartbeat: now,
    attemptCount: 0,
    maxAttempts: config.maxAttempts ?? 5,
    errorHistory: [],
    sessionLogs: [],
    config: {
      autoFixEnabled: config.autoFixEnabled ?? true,
      timeoutMs: config.timeoutMs ?? 30 * 60 * 1000, // 30 min default
      stopOnHardFailure: config.stopOnHardFailure ?? true,
      escalateAfterNAttempts: config.escalateAfterNAttempts ?? true,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000, // 30 sec
      checkpointIntervalMs: config.checkpointIntervalMs ?? 5000 // 5 sec
    }
  }
  
  // Track in memory
  activeSessions.set(sessionId, {
    checkpoint,
    abortController: new AbortController()
  })
  
  // Persist to database
  saveCheckpoint(sessionId)
  
  // Broadcast session start
  eventBus.broadcast('session.started', {
    session_id: sessionId,
    task_id: config.taskId,
    workspace_id: config.workspaceId,
    timestamp: now
  })
  
  addSessionLog(sessionId, 'initializing', 'info', 'Session created', {
    maxAttempts: checkpoint.maxAttempts,
    autoFixEnabled: checkpoint.config.autoFixEnabled
  })
  
  logger.info({ sessionId, taskId: config.taskId }, 'Agent session created')
  return sessionId
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): SessionCheckpoint | undefined {
  const active = activeSessions.get(sessionId)
  return active?.checkpoint
}

/**
 * Update session phase
 */
export function updatePhase(sessionId: string, phase: SessionPhase, data?: Record<string, unknown>): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  session.checkpoint.phase = phase
  session.checkpoint.lastHeartbeat = Date.now()
  
  addSessionLog(sessionId, phase, 'info', `Phase: ${phase}`, data)
  
  // Persist checkpoint
  saveCheckpoint(sessionId)
  
  // Broadcast phase change
  eventBus.broadcast('session.phase_changed', {
    session_id: sessionId,
    task_id: session.checkpoint.taskId,
    phase,
    timestamp: session.checkpoint.lastHeartbeat
  })
}

/**
 * Update session status
 */
export function updateStatus(sessionId: string, status: SessionStatus): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  session.checkpoint.status = status
  session.checkpoint.lastHeartbeat = Date.now()
  
  addSessionLog(sessionId, session.checkpoint.phase, 'info', `Status: ${status}`)
  
  saveCheckpoint(sessionId)
  
  eventBus.broadcast('session.status_changed', {
    session_id: sessionId,
    task_id: session.checkpoint.taskId,
    status,
    timestamp: session.checkpoint.lastHeartbeat
  })
}

/**
 * Record observation in session
 */
export function recordObservation(sessionId: string, observation: Observation): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  session.checkpoint.lastObservation = observation
  session.checkpoint.lastHeartbeat = Date.now()
  
  // Track errors in history
  if (!observation.success && observation.errors.length > 0) {
    for (const error of observation.errors) {
      session.checkpoint.errorHistory.push({
        attemptNumber: session.checkpoint.attemptCount,
        error: error.message,
        errorType: error.type,
        timestamp: observation.timestamp,
        recovered: false
      })
    }
  }
  
  addSessionLog(sessionId, 'observing', observation.success ? 'success' : 'error', 
    `Observation: ${observation.phase} ${observation.success ? 'succeeded' : 'failed'}`,
    { errors: observation.errors.length, durationMs: observation.durationMs }
  )
  
  saveCheckpoint(sessionId)
}

/**
 * Record reflection in session
 */
export function recordReflection(sessionId: string, reflection: Reflection): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  session.checkpoint.lastReflection = reflection
  session.checkpoint.lastHeartbeat = Date.now()
  
  addSessionLog(sessionId, 'reflecting', reflection.isSuccess ? 'success' : 'warning',
    `Reflection: ${reflection.summary}`,
    { confidence: reflection.confidence, nextAction: reflection.nextAction }
  )
  
  saveCheckpoint(sessionId)
}

/**
 * Record adaptation in session
 */
export function recordAdaptation(sessionId: string, adaptation: Adaptation): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  session.checkpoint.lastAdaptation = adaptation
  session.checkpoint.attemptCount++
  session.checkpoint.lastHeartbeat = Date.now()
  
  // Mark matching error in history as recovered
  const matchingError = session.checkpoint.errorHistory.find(
    e => !e.recovered && e.attemptNumber === adaptation.attemptNumber - 1
  )
  if (matchingError) {
    matchingError.recovered = true
  }
  
  addSessionLog(sessionId, 'adapting', 'adaptation',
    `Adaptation: ${adaptation.description}`,
    { type: adaptation.type, changesCount: adaptation.changes.length }
  )
  
  saveCheckpoint(sessionId)
}

/**
 * Increment attempt counter
 */
export function incrementAttempt(sessionId: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  session.checkpoint.attemptCount++
  session.checkpoint.lastHeartbeat = Date.now()
  
  addSessionLog(sessionId, session.checkpoint.phase, 'info', 
    `Attempt ${session.checkpoint.attemptCount}/${session.checkpoint.maxAttempts}`
  )
  
  saveCheckpoint(sessionId)
}

/**
 * Add log entry to session
 */
export function addSessionLog(
  sessionId: string, 
  phase: SessionPhase, 
  type: 'info' | 'warning' | 'error' | 'success' | 'adaptation',
  message: string,
  data?: Record<string, unknown>
): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  session.checkpoint.sessionLogs.push({
    timestamp: Date.now(),
    phase,
    type,
    message,
    data
  })
  
  // Keep last 1000 logs in memory
  if (session.checkpoint.sessionLogs.length > 1000) {
    session.checkpoint.sessionLogs = session.checkpoint.sessionLogs.slice(-1000)
  }
}

/**
 * Check if session is complete
 */
export function isSessionComplete(sessionId: string): boolean {
  const session = activeSessions.get(sessionId)
  if (!session) return true
  
  return (
    session.checkpoint.status === 'completed' ||
    session.checkpoint.status === 'failed' ||
    session.checkpoint.status === 'cancelled' ||
    session.checkpoint.phase === 'completed' ||
    session.checkpoint.phase === 'failed'
  )
}

/**
 * Check if session should stop (max attempts or hard failure)
 */
export function shouldStopSession(sessionId: string): { stop: boolean; reason: string } {
  const session = activeSessions.get(sessionId)
  if (!session) return { stop: true, reason: 'Session not found' }
  
  // Max attempts reached
  if (session.checkpoint.attemptCount >= session.checkpoint.maxAttempts) {
    return { stop: true, reason: `Max attempts (${session.checkpoint.maxAttempts}) reached` }
  }
  
  // Total session timeout
  const elapsed = Date.now() - session.checkpoint.startedAt
  if (elapsed > session.checkpoint.config.timeoutMs) {
    return { stop: true, reason: 'Session timeout' }
  }
  
  // Hard failure (non-auto-fixable error) with stopOnHardFailure config
  const lastError = session.checkpoint.errorHistory[session.checkpoint.errorHistory.length - 1]
  if (lastError && session.checkpoint.config.stopOnHardFailure) {
    // Check if last error is non-recoverable (config, timeout, etc)
    const nonRecoverableTypes: ErrorType[] = ['config', 'timeout']
    if (nonRecoverableTypes.includes(lastError.errorType)) {
      return { stop: true, reason: `Non-recoverable error: ${lastError.errorType}` }
    }
  }
  
  return { stop: false, reason: '' }
}

/**
 * Cancel session
 */
export function cancelSession(sessionId: string, reason?: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  session.abortController.abort()
  session.checkpoint.status = 'cancelled'
  session.checkpoint.phase = 'failed'
  session.checkpoint.lastHeartbeat = Date.now()
  
  addSessionLog(sessionId, 'failed', 'error', `Session cancelled: ${reason ?? 'User requested'}`)
  
  saveCheckpoint(sessionId)
  
  eventBus.broadcast('session.cancelled', {
    session_id: sessionId,
    task_id: session.checkpoint.taskId,
    reason,
    timestamp: Date.now()
  })
}

/**
 * Complete session successfully
 */
export function completeSession(sessionId: string, result: Omit<SessionResult, 'sessionId' | 'taskId' | 'totalDurationMs'>): SessionResult {
  const session = activeSessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  
  session.checkpoint.status = 'completed'
  session.checkpoint.phase = 'completed'
  session.checkpoint.lastHeartbeat = Date.now()
  
  const totalDurationMs = Date.now() - session.checkpoint.startedAt
  
  addSessionLog(sessionId, 'completed', 'success', 
    `Session completed: ${result.summary}`,
    { totalAttempts: result.totalAttempts, artifactsCount: result.artifacts.length }
  )
  
  saveCheckpoint(sessionId)
  
  eventBus.broadcast('session.completed', {
    session_id: sessionId,
    task_id: session.checkpoint.taskId,
    total_attempts: result.totalAttempts,
    total_duration_ms: totalDurationMs,
    timestamp: Date.now()
  })
  
  // Cleanup from active sessions
  activeSessions.delete(sessionId)
  
  return {
    sessionId,
    taskId: session.checkpoint.taskId,
    totalDurationMs,
    ...result
  }
}

/**
 * Fail session
 */
export function failSession(sessionId: string, error: string, lessons?: string[]): SessionResult {
  const session = activeSessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  
  session.checkpoint.status = 'failed'
  session.checkpoint.phase = 'failed'
  session.checkpoint.lastHeartbeat = Date.now()
  
  const totalDurationMs = Date.now() - session.checkpoint.startedAt
  
  addSessionLog(sessionId, 'failed', 'error', `Session failed: ${error}`)
  
  saveCheckpoint(sessionId)
  
  eventBus.broadcast('session.failed', {
    session_id: sessionId,
    task_id: session.checkpoint.taskId,
    error,
    total_attempts: session.checkpoint.attemptCount,
    timestamp: Date.now()
  })
  
  // Cleanup
  activeSessions.delete(sessionId)
  
  return {
    sessionId,
    taskId: session.checkpoint.taskId,
    status: 'failed',
    totalAttempts: session.checkpoint.attemptCount,
    totalDurationMs,
    artifacts: [],
    summary: error,
    lessons
  }
}

/**
 * Get session logs
 */
export function getSessionLogs(sessionId: string, options?: { limit?: number; since?: number }): SessionCheckpoint['sessionLogs'] {
  const session = activeSessions.get(sessionId)
  if (!session) return []
  
  let logs = [...session.checkpoint.sessionLogs]
  
  if (options?.since) {
    logs = logs.filter(l => l.timestamp >= options.since!)
  }
  
  if (options?.limit) {
    logs = logs.slice(-options.limit)
  }
  
  return logs
}

/**
 * List active sessions for a task
 */
export function getActiveSessionsForTask(taskId: number): string[] {
  const sessions: string[] = []
  for (const [sessionId, session] of activeSessions) {
    if (session.checkpoint.taskId === taskId) {
      sessions.push(sessionId)
    }
  }
  return sessions
}

/**
 * List all active sessions
 */
export function listActiveSessions(): Array<{ sessionId: string; taskId: number; workspaceId: number; status: SessionStatus; phase: SessionPhase }> {
  const sessions: Array<{ sessionId: string; taskId: number; workspaceId: number; status: SessionStatus; phase: SessionPhase }> = []
  for (const [sessionId, session] of activeSessions) {
    sessions.push({
      sessionId,
      taskId: session.checkpoint.taskId,
      workspaceId: session.checkpoint.workspaceId,
      status: session.checkpoint.status,
      phase: session.checkpoint.phase
    })
  }
  return sessions
}

/**
 * Get abort signal for session
 */
export function getSessionAbortSignal(sessionId: string): AbortSignal | undefined {
  return activeSessions.get(sessionId)?.abortController.signal
}

/**
 * Persist checkpoint to database
 */
function saveCheckpoint(sessionId: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  
  try {
    const db = getDatabase()
    db.prepare(`
      UPDATE tasks 
      SET checkpoint_data = ?, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify({
        sessionId,
        ...session.checkpoint
      }),
      Math.floor(Date.now() / 1000),
      session.checkpoint.taskId
    )
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to save session checkpoint')
  }
}

/**
 * Load checkpoint from database
 */
export function loadCheckpoint(taskId: number): SessionCheckpoint | null {
  try {
    const db = getDatabase()
    const row = db.prepare(
      'SELECT checkpoint_data FROM tasks WHERE id = ?'
    ).get(taskId) as { checkpoint_data: string } | undefined
    
    if (!row?.checkpoint_data) return null
    
    const parsed = JSON.parse(row.checkpoint_data) as SessionCheckpoint & { sessionId?: string }
    return parsed
  } catch (error) {
    logger.error({ error, taskId }, 'Failed to load session checkpoint')
    return null
  }
}

/**
 * Resume session from checkpoint
 */
export function resumeSession(taskId: number): string | null {
  const checkpoint = loadCheckpoint(taskId)
  if (!checkpoint) return null
  
  const sessionId = `session-${taskId}-${Date.now()}-resumed`
  
  activeSessions.set(sessionId, {
    checkpoint: {
      ...checkpoint,
      status: 'running',
      lastHeartbeat: Date.now()
    },
    abortController: new AbortController()
  })
  
  addSessionLog(sessionId, checkpoint.phase, 'info', 'Session resumed from checkpoint')
  
  eventBus.broadcast('session.resumed', {
    session_id: sessionId,
    task_id: taskId,
    previous_phase: checkpoint.phase,
    timestamp: Date.now()
  })
  
  return sessionId
}

/**
 * Cleanup stale sessions (call periodically)
 */
export function cleanupStaleSessions(maxAgeMs: number = 30 * 60 * 1000): number {
  const now = Date.now()
  let cleaned = 0
  
  for (const [sessionId, session] of activeSessions) {
    if (now - session.checkpoint.lastHeartbeat > maxAgeMs) {
      activeSessions.delete(sessionId)
      cleaned++
      
      logger.warn({ sessionId, taskId: session.checkpoint.taskId }, 'Cleaned up stale session')
    }
  }
  
  return cleaned
}

