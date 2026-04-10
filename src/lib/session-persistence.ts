import { getDatabase } from './db'
import { logger } from './logger'
import { config } from './config'
import { join } from 'path'
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'

export interface SessionCheckpoint {
  sessionId: string
  taskId: number
  timestamp: number
  state: SessionState
}

export interface SessionState {
  messages: Message[]
  filesModified: string[]
  decisions: Decision[]
  toolsUsed: string[]
  context: Record<string, any>
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface Decision {
  id: string
  description: string
  rationale: string
  timestamp: number
}

export interface Learning {
  id: string
  type: 'error_prevention' | 'best_practice' | 'tool_optimization'
  pattern: string
  solution?: string
  context: string
  effectiveness?: number
  createdAt: number
}

export interface SessionPersistenceOptions {
  maxMessages: number
  checkpointIntervalMs: number
  learningRetentionDays: number
}

const DEFAULT_OPTIONS: SessionPersistenceOptions = {
  maxMessages: 100,
  checkpointIntervalMs: 30000,
  learningRetentionDays: 90
}

export class SessionPersistence {
  private options: SessionPersistenceOptions
  private sessionsDir: string
  private learningsDir: string

  constructor(options?: Partial<SessionPersistenceOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.sessionsDir = join(config.dataDir, 'sessions')
    this.learningsDir = join(config.dataDir, 'learnings')
  }

  async ensureDirectories(): Promise<void> {
    if (!existsSync(this.sessionsDir)) {
      await mkdir(this.sessionsDir, { recursive: true })
    }
    if (!existsSync(this.learningsDir)) {
      await mkdir(this.learningsDir, { recursive: true })
    }
  }

  async saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
    await this.ensureDirectories()
    const filePath = join(this.sessionsDir, `${checkpoint.sessionId}.json`)
    
    try {
      await writeFile(filePath, JSON.stringify(checkpoint, null, 2))
      logger.debug({ sessionId: checkpoint.sessionId }, 'Checkpoint saved')
    } catch (err) {
      logger.error({ err, sessionId: checkpoint.sessionId }, 'Failed to save checkpoint')
    }
  }

  async loadCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    const filePath = join(this.sessionsDir, `${sessionId}.json`)
    
    if (!existsSync(filePath)) {
      return null
    }

    try {
      const content = await readFile(filePath, 'utf-8')
      return JSON.parse(content) as SessionCheckpoint
    } catch (err) {
      logger.error({ err, sessionId }, 'Failed to load checkpoint')
      return null
    }
  }

  async saveLearning(learning: Learning): Promise<void> {
    await this.ensureDirectories()
    const filePath = join(this.learningsDir, `${learning.id}.json`)
    
    try {
      await writeFile(filePath, JSON.stringify(learning, null, 2))
      logger.debug({ learningId: learning.id }, 'Learning saved')
    } catch (err) {
      logger.error({ err, learningId: learning.id }, 'Failed to save learning')
    }
  }

  async searchLearnings(query: string, types?: Learning['type'][]): Promise<Learning[]> {
    await this.ensureDirectories()
    const learnings: Learning[] = []

    try {
      const files = await readdir(this.learningsDir)
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        
        const content = await readFile(join(this.learningsDir, file), 'utf-8')
        const learning = JSON.parse(content) as Learning
        
        if (types && types.length > 0 && !types.includes(learning.type)) {
          continue
        }
        
        const queryLower = query.toLowerCase()
        if (
          learning.pattern.toLowerCase().includes(queryLower) ||
          learning.context.toLowerCase().includes(queryLower)
        ) {
          learnings.push(learning)
        }
      }
    } catch (err) {
      logger.error({ err, query }, 'Failed to search learnings')
    }

    return learnings
  }

  async getRelevantLearnings(taskDescription: string, limit: number = 5): Promise<Learning[]> {
    return this.searchLearnings(taskDescription, ['best_practice', 'error_prevention'])
  }

  async extractAndStoreLearnings(
    sessionId: string,
    taskId: number,
    outcome: 'success' | 'failure',
    transcript: Message[]
  ): Promise<void> {
    const learnings: Learning[] = []

    if (outcome === 'success') {
      learnings.push({
        id: `learning-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'best_practice',
        pattern: this.extractPattern(transcript),
        context: taskDescriptionFromTranscript(transcript),
        createdAt: Date.now()
      })
    }

    const errors = transcript.filter(m => 
      m.role === 'assistant' && m.content.includes('error')
    )
    
    for (const error of errors) {
      learnings.push({
        id: `learning-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'error_prevention',
        pattern: this.extractErrorPattern(error.content),
        solution: this.extractErrorSolution(error.content),
        context: taskDescriptionFromTranscript(transcript),
        createdAt: Date.now()
      })
    }

    for (const learning of learnings) {
      await this.saveLearning(learning)
    }

    logger.info({ sessionId, taskId, learningsCount: learnings.length }, 'Extracted learnings from session')
  }

  private extractPattern(transcript: Message[]): string {
    const assistantMessages = transcript.filter(m => m.role === 'assistant')
    if (assistantMessages.length === 0) return ''
    
    const firstAction = assistantMessages[0]?.content.slice(0, 200) || ''
    return firstAction
  }

  private extractErrorPattern(content: string): string {
    const match = content.match(/error[:\s]+(.+?)(?:\n|$)/i)
    return match ? match[1].slice(0, 100) : content.slice(0, 100)
  }

  private extractErrorSolution(content: string): string {
    const fixMatch = content.match(/(?:fix|solved|resolved)[:\s]+(.+?)(?:\n|$)/i)
    return fixMatch ? fixMatch[1].slice(0, 200) : 'Auto-fixed in subsequent attempt'
  }

  async cleanupOldLearnings(): Promise<number> {
    const cutoff = Date.now() - (this.options.learningRetentionDays * 24 * 60 * 60 * 1000)
    let cleaned = 0

    try {
      const files = await readdir(this.learningsDir)
      
      for (const file of files) {
        const filePath = join(this.learningsDir, file)
        const content = await readFile(filePath, 'utf-8')
        const learning = JSON.parse(content) as Learning
        
        if (learning.createdAt < cutoff) {
          await unlink(filePath)
          cleaned++
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to cleanup old learnings')
    }

    logger.info({ cleaned }, 'Cleaned up old learnings')
    return cleaned
  }

  async createHandoffDocument(
    sessionId: string,
    taskDescription: string,
    decisions: Decision[],
    pendingWork: string[]
  ): Promise<string> {
    const checkpoint = await this.loadCheckpoint(sessionId)
    
    const handoff = `
# Session Handoff

## Task
${taskDescription}

## Decisions Made
${decisions.map(d => `- ${d.description} (${d.rationale})`).join('\n')}

## Pending Work
${pendingWork.map(w => `- ${w}`).join('\n')}

## Context
${checkpoint ? JSON.stringify(checkpoint.state.context, null, 2) : 'No checkpoint available'}
`

    return handoff
  }
}

function taskDescriptionFromTranscript(transcript: Message[]): string {
  const userMsg = transcript.find(m => m.role === 'user')
  return userMsg?.content.slice(0, 200) || 'Unknown task'
}

export const sessionPersistence = new SessionPersistence()

export async function saveSessionCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
  return sessionPersistence.saveCheckpoint(checkpoint)
}

export async function loadSessionCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
  return sessionPersistence.loadCheckpoint(sessionId)
}

export async function getRelevantLearnings(taskDescription: string, limit?: number): Promise<Learning[]> {
  return sessionPersistence.getRelevantLearnings(taskDescription, limit)
}

export async function extractLearnings(
  sessionId: string,
  taskId: number,
  outcome: 'success' | 'failure',
  transcript: Message[]
): Promise<void> {
  return sessionPersistence.extractAndStoreLearnings(sessionId, taskId, outcome, transcript)
}