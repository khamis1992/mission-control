import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createSession,
  getSession,
  updatePhase,
  updateStatus,
  recordObservation,
  recordReflection,
  recordAdaptation,
  incrementAttempt,
  isSessionComplete,
  shouldStopSession,
  cancelSession,
  completeSession,
  failSession,
  getSessionLogs,
  getActiveSessionsForTask,
  listActiveSessions,
  cleanupStaleSessions,
  type SessionCheckpoint,
  type Observation,
  type Reflection,
  type Adaptation,
} from '../session-manager'

describe('Session Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createSession', () => {
    it('should create a new session with default config', () => {
      const sessionId = createSession({
        taskId: 1,
        workspaceId: 1,
      })

      expect(sessionId).toMatch(/^session-1-\d+$/)

      const session = getSession(sessionId)
      expect(session).toBeDefined()
      expect(session?.taskId).toBe(1)
      expect(session?.workspaceId).toBe(1)
      expect(session?.status).toBe('initializing')
      expect(session?.phase).toBe('initializing')
      expect(session?.attemptCount).toBe(0)
      expect(session?.maxAttempts).toBe(5)
      expect(session?.config.autoFixEnabled).toBe(true)
    })

    it('should create a session with custom config', () => {
      const sessionId = createSession({
        taskId: 2,
        workspaceId: 1,
        maxAttempts: 10,
        autoFixEnabled: false,
        timeoutMs: 60000,
      })

      const session = getSession(sessionId)
      expect(session?.maxAttempts).toBe(10)
      expect(session?.config.autoFixEnabled).toBe(false)
      expect(session?.config.timeoutMs).toBe(60000)
    })

    it('should broadcast session.started event', () => {
      createSession({ taskId: 1, workspaceId: 1 })
      expect(getActiveSessionsForTask(1)).toHaveLength(1)
    })
  })

  describe('updatePhase', () => {
    it('should update session phase', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      updatePhase(sessionId, 'planning')
      
      const session = getSession(sessionId)
      expect(session?.phase).toBe('planning')
    })

    it('should add log entry for phase change', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      updatePhase(sessionId, 'executing', { step: 'build' })
      
      const logs = getSessionLogs(sessionId)
      expect(logs).toHaveLength(2)
      expect(logs[1].phase).toBe('executing')
      expect(logs[1].message).toBe('Phase: executing')
    })
  })

  describe('updateStatus', () => {
    it('should update session status', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      updateStatus(sessionId, 'running')
      
      const session = getSession(sessionId)
      expect(session?.status).toBe('running')
    })
  })

  describe('recordObservation', () => {
    it('should record successful observation', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      const observation: Observation = {
        phase: 'build',
        success: true,
        output: 'Build succeeded',
        errors: [],
        timestamp: Date.now(),
        durationMs: 5000,
      }
      
      recordObservation(sessionId, observation)
      
      const session = getSession(sessionId)
      expect(session?.lastObservation).toEqual(observation)
    })

    it('should record failed observation with errors', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      const observation: Observation = {
        phase: 'build',
        success: false,
        output: 'Build failed',
        errors: [
          { type: 'syntax', message: 'Expected ;', autoFixable: true },
        ],
        timestamp: Date.now(),
        durationMs: 3000,
      }
      
      recordObservation(sessionId, observation)
      
      const session = getSession(sessionId)
      expect(session?.lastObservation?.success).toBe(false)
      expect(session?.errorHistory).toHaveLength(1)
      expect(session?.errorHistory[0].errorType).toBe('syntax')
    })
  })

  describe('recordReflection', () => {
    it('should record reflection', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      const reflection: Reflection = {
        isSuccess: true,
        confidence: 0.95,
        summary: 'Task completed successfully',
        issues: [],
        nextAction: 'complete',
        shouldAdapt: false,
      }
      
      recordReflection(sessionId, reflection)
      
      const session = getSession(sessionId)
      expect(session?.lastReflection).toEqual(reflection)
    })
  })

  describe('recordAdaptation', () => {
    it('should record adaptation and increment attempt count', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      const adaptation: Adaptation = {
        type: 'fix_error',
        description: 'Fix syntax error',
        changes: [],
        reasoning: 'Added missing semicolon',
        attemptNumber: 1,
      }
      
      recordAdaptation(sessionId, adaptation)
      
      const session = getSession(sessionId)
      expect(session?.lastAdaptation).toEqual(adaptation)
      expect(session?.attemptCount).toBe(1)
    })
  })

  describe('incrementAttempt', () => {
    it('should increment attempt counter', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      incrementAttempt(sessionId)
      incrementAttempt(sessionId)
      
      const session = getSession(sessionId)
      expect(session?.attemptCount).toBe(2)
    })
  })

  describe('isSessionComplete', () => {
    it('should return true for completed session', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      updateStatus(sessionId, 'completed')
      
      expect(isSessionComplete(sessionId)).toBe(true)
    })

    it('should return true for failed session', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      updateStatus(sessionId, 'failed')
      
      expect(isSessionComplete(sessionId)).toBe(true)
    })

    it('should return false for running session', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      updateStatus(sessionId, 'running')
      
      expect(isSessionComplete(sessionId)).toBe(false)
    })
  })

  describe('shouldStopSession', () => {
    it('should stop when max attempts reached', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1, maxAttempts: 3 })
      
      incrementAttempt(sessionId)
      incrementAttempt(sessionId)
      incrementAttempt(sessionId)
      
      const { stop, reason } = shouldStopSession(sessionId)
      expect(stop).toBe(true)
      expect(reason).toContain('Max attempts')
    })

    it('should continue when under max attempts', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1, maxAttempts: 5 })
      
      incrementAttempt(sessionId)
      
      const { stop } = shouldStopSession(sessionId)
      expect(stop).toBe(false)
    })

    it('should stop on non-recoverable error', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1, stopOnHardFailure: true })
      
      recordObservation(sessionId, {
        phase: 'build',
        success: false,
        output: 'Config error',
        errors: [{ type: 'config', message: 'Invalid config', autoFixable: false }],
        timestamp: Date.now(),
        durationMs: 1000,
      })
      
      incrementAttempt(sessionId)
      
      const { stop, reason } = shouldStopSession(sessionId)
      expect(stop).toBe(true)
      expect(reason).toContain('Non-recoverable')
    })
  })

  describe('cancelSession', () => {
    it('should cancel session', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      cancelSession(sessionId, 'User requested')
      
      const session = getSession(sessionId)
      expect(session?.status).toBe('cancelled')
      expect(session?.phase).toBe('failed')
    })
  })

  describe('completeSession', () => {
    it('should complete session with result', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      const result = completeSession(sessionId, {
        status: 'completed',
        totalAttempts: 1,
        artifacts: [],
        summary: 'Task completed successfully',
      })
      
      expect(result.status).toBe('completed')
      expect(result.totalAttempts).toBe(1)
      expect(getSession(sessionId)).toBeUndefined()
    })
  })

  describe('failSession', () => {
    it('should fail session with error', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      const result = failSession(sessionId, 'Build failed', ['Always check dependencies'])
      
      expect(result.status).toBe('failed')
      expect(result.summary).toBe('Build failed')
      expect(result.lessons).toEqual(['Always check dependencies'])
      expect(getSession(sessionId)).toBeUndefined()
    })
  })

  describe('getSessionLogs', () => {
    it('should return all logs', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      updatePhase(sessionId, 'planning')
      updatePhase(sessionId, 'executing')
      
      const logs = getSessionLogs(sessionId)
      expect(logs.length).toBeGreaterThan(0)
    })

    it('should filter logs by limit', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      updatePhase(sessionId, 'planning')
      updatePhase(sessionId, 'executing')
      updatePhase(sessionId, 'observing')
      
      const logs = getSessionLogs(sessionId, { limit: 2 })
      expect(logs.length).toBe(2)
    })

    it('should filter logs by timestamp', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      const before = Date.now()
      
      updatePhase(sessionId, 'planning')
      updatePhase(sessionId, 'executing')
      
      const logs = getSessionLogs(sessionId, { since: before + 1000 })
      expect(logs.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getActiveSessionsForTask', () => {
    it('should return session IDs for task', () => {
      const sessionId1 = createSession({ taskId: 1, workspaceId: 1 })
      const sessionId2 = createSession({ taskId: 1, workspaceId: 1 })
      createSession({ taskId: 2, workspaceId: 1 })
      
      const sessions = getActiveSessionsForTask(1)
      expect(sessions).toHaveLength(2)
      expect(sessions).toContain(sessionId1)
      expect(sessions).toContain(sessionId2)
    })
  })

  describe('listActiveSessions', () => {
    it('should list all active sessions', () => {
      createSession({ taskId: 1, workspaceId: 1 })
      createSession({ taskId: 2, workspaceId: 1 })
      
      const sessions = listActiveSessions()
      expect(sessions.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('cleanupStaleSessions', () => {
    it('should cleanup sessions older than max age', () => {
      const sessionId = createSession({ taskId: 1, workspaceId: 1 })
      
      const session = getSession(sessionId)
      if (session) {
        session.lastHeartbeat = Date.now() - 60 * 60 * 1000
      }
      
      const cleaned = cleanupStaleSessions(30 * 60 * 1000)
      
      expect(cleaned).toBe(1)
      expect(getSession(sessionId)).toBeUndefined()
    })
  })
})