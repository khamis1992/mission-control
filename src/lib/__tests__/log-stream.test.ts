import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  broadcastLog,
  getLogHistory,
  storeLogChunk,
  clearLogBuffer,
  clearAllLogBuffers,
  createLogStream,
  createBufferedLogStream,
  type LogChunk,
} from '../log-stream'

describe('Log Stream', () => {
  beforeEach(() => {
    clearAllLogBuffers()
  })

  afterEach(() => {
    clearAllLogBuffers()
    vi.restoreAllMocks()
  })

  describe('broadcastLog', () => {
    it('should add log to buffer', () => {
      const log: LogChunk = {
        taskId: 1,
        type: 'stdout',
        text: 'Build started',
        timestamp: Date.now(),
        source: 'build',
      }

      broadcastLog(log)

      const history = getLogHistory(1)
      expect(history).toHaveLength(1)
      expect(history[0]).toEqual(log)
    })

    it('should limit buffer size to MAX_BUFFER_SIZE', () => {
      for (let i = 0; i < 250; i++) {
        broadcastLog({
          taskId: 1,
          type: 'stdout',
          text: `Log ${i}`,
          timestamp: Date.now(),
          source: 'build',
        })
      }

      const history = getLogHistory(1)
      expect(history.length).toBe(200)
      expect(history[0].text).toBe('Log 50')
      expect(history[199].text).toBe('Log 249')
    })

    it('should store logs for multiple tasks separately', () => {
      broadcastLog({
        taskId: 1,
        type: 'stdout',
        text: 'Task 1 log',
        timestamp: Date.now(),
        source: 'build',
      })

      broadcastLog({
        taskId: 2,
        type: 'stderr',
        text: 'Task 2 log',
        timestamp: Date.now(),
        source: 'test',
      })

      const history1 = getLogHistory(1)
      const history2 = getLogHistory(2)

      expect(history1).toHaveLength(1)
      expect(history1[0].text).toBe('Task 1 log')
      expect(history2).toHaveLength(1)
      expect(history2[0].text).toBe('Task 2 log')
    })
  })

  describe('getLogHistory', () => {
    it('should return empty array for unknown task', () => {
      const history = getLogHistory(999)
      expect(history).toEqual([])
    })

    it('should filter by limit', () => {
      for (let i = 0; i < 10; i++) {
        broadcastLog({
          taskId: 1,
          type: 'stdout',
          text: `Log ${i}`,
          timestamp: Date.now(),
          source: 'build',
        })
      }

      const history = getLogHistory(1, { limit: 5 })
      expect(history).toHaveLength(5)
    })

    it('should filter by since timestamp', () => {
      const oldTimestamp = Date.now() - 10000
      
      broadcastLog({
        taskId: 1,
        type: 'stdout',
        text: 'Old log',
        timestamp: oldTimestamp,
        source: 'build',
      })

      broadcastLog({
        taskId: 1,
        type: 'stdout',
        text: 'New log',
        timestamp: Date.now(),
        source: 'build',
      })

      const history = getLogHistory(1, { since: Date.now() - 5000 })
      expect(history).toHaveLength(1)
      expect(history[0].text).toBe('New log')
    })

    it('should filter by types', () => {
      broadcastLog({
        taskId: 1,
        type: 'stdout',
        text: 'Stdout',
        timestamp: Date.now(),
        source: 'build',
      })

      broadcastLog({
        taskId: 1,
        type: 'stderr',
        text: 'Stderr',
        timestamp: Date.now(),
        source: 'build',
      })

      broadcastLog({
        taskId: 1,
        type: 'info',
        text: 'Info',
        timestamp: Date.now(),
        source: 'agent',
      })

      const history = getLogHistory(1, { types: ['stdout', 'stderr'] })
      expect(history).toHaveLength(2)
    })

    it('should filter by sources', () => {
      broadcastLog({
        taskId: 1,
        type: 'stdout',
        text: 'Build log',
        timestamp: Date.now(),
        source: 'build',
      })

      broadcastLog({
        taskId: 1,
        type: 'stdout',
        text: 'Test log',
        timestamp: Date.now(),
        source: 'test',
      })

      const history = getLogHistory(1, { sources: ['build'] })
      expect(history).toHaveLength(1)
      expect(history[0].text).toBe('Build log')
    })
  })

  describe('clearLogBuffer', () => {
    it('should clear logs for specific task', () => {
      broadcastLog({
        taskId: 1,
        type: 'stdout',
        text: 'Log for task 1',
        timestamp: Date.now(),
        source: 'build',
      })

      broadcastLog({
        taskId: 2,
        type: 'stdout',
        text: 'Log for task 2',
        timestamp: Date.now(),
        source: 'build',
      })

      clearLogBuffer(1)

      expect(getLogHistory(1)).toEqual([])
      expect(getLogHistory(2)).toHaveLength(1)
    })
  })

  describe('clearAllLogBuffers', () => {
    it('should clear all logs', () => {
      broadcastLog({
        taskId: 1,
        type: 'stdout',
        text: 'Log 1',
        timestamp: Date.now(),
        source: 'build',
      })

      broadcastLog({
        taskId: 2,
        type: 'stdout',
        text: 'Log 2',
        timestamp: Date.now(),
        source: 'build',
      })

      clearAllLogBuffers()

      expect(getLogHistory(1)).toEqual([])
      expect(getLogHistory(2)).toEqual([])
    })
  })

  describe('createLogStream', () => {
    it('should create stream with all output methods', () => {
      const stream = createLogStream(1, 'build')

      expect(stream.stdout).toBeDefined()
      expect(stream.stderr).toBeDefined()
      expect(stream.info).toBeDefined()
      expect(stream.error).toBeDefined()
      expect(stream.warning).toBeDefined()
    })

    it('should broadcast logs when methods are called', () => {
      const stream = createLogStream(1, 'build')

      stream.stdout('stdout text')
      stream.stderr('stderr text')
      stream.info('info text')
      stream.error('error text')
      stream.warning('warning text')

      const history = getLogHistory(1)
      expect(history).toHaveLength(5)
      expect(history[0].type).toBe('stdout')
      expect(history[1].type).toBe('stderr')
      expect(history[2].type).toBe('info')
      expect(history[3].type).toBe('error')
      expect(history[4].type).toBe('warning')
    })
  })

  describe('createBufferedLogStream', () => {
    it('should create buffered stream', () => {
      const stream = createBufferedLogStream(1, 'build')

      stream.write('log text', 'stdout')

      const history = stream.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].text).toBe('log text')
    })

    it('should limit buffer size', () => {
      const stream = createBufferedLogStream(1, 'build', { bufferSize: 5 })

      for (let i = 0; i < 10; i++) {
        stream.write(`log ${i}`, 'stdout')
      }

      const history = stream.getHistory()
      expect(history).toHaveLength(5)
    })

    it('should return flushed logs', () => {
      const stream = createBufferedLogStream(1, 'build')

      stream.write('log 1', 'stdout')
      stream.write('log 2', 'stdout')

      const flushed = stream.flush()
      expect(flushed).toHaveLength(2)
    })
  })
})