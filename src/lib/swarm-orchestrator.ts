import { getDatabase } from './db'
import { logger } from './logger'
import { config } from './config'
import { join } from 'path'
import { mkdir, writeFile, readFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface Subtask {
  id: string
  title: string
  description: string
  files: string[]
  priority: number
  dependencies: string[]
}

export interface SwarmTask {
  parentTaskId: number
  strategy: 'file-based' | 'feature-based' | 'risk-based'
  subtasks: Subtask[]
  coordination: 'merge' | 'sequential' | 'parallel'
  maxParallel: number
}

export interface SwarmResult {
  taskId: number
  status: 'success' | 'partial' | 'failed'
  results: SubtaskResult[]
  mergedAt?: number
  errors: string[]
}

export interface SubtaskResult {
  subtaskId: string
  success: boolean
  output?: string
  error?: string
  duration: number
}

export interface Worktree {
  path: string
  taskId: string
  commit: string
  createdAt: number
}

const WORKTREE_DIR = join(config.dataDir, 'worktrees')

export class SwarmOrchestrator {
  private worktrees: Map<string, Worktree> = new Map()

  async ensureWorktreeDir(): Promise<void> {
    if (!existsSync(WORKTREE_DIR)) {
      await mkdir(WORKTREE_DIR, { recursive: true })
    }
  }

  async decomposeTask(taskId: number, description: string): Promise<Subtask[]> {
    const db = getDatabase()
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any

    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    const subtasks: Subtask[] = [
      {
        id: `subtask-${taskId}-1`,
        title: 'Implementation',
        description: `Implement: ${description}`,
        files: this.suggestFiles(task.title),
        priority: 1,
        dependencies: []
      },
      {
        id: `subtask-${taskId}-2`,
        title: 'Testing',
        description: `Test: ${description}`,
        files: this.suggestTestFiles(task.title),
        priority: 2,
        dependencies: [`subtask-${taskId}-1`]
      }
    ]

    return subtasks
  }

  private suggestFiles(title: string): string[] {
    const titleLower = title.toLowerCase()
    
    if (titleLower.includes('api') || titleLower.includes('route')) {
      return ['src/app/api/**/*.ts', 'src/lib/**/*.ts']
    }
    if (titleLower.includes('ui') || titleLower.includes('component') || titleLower.includes('frontend')) {
      return ['src/components/**/*.tsx', 'src/app/**/*.tsx']
    }
    if (titleLower.includes('auth') || titleLower.includes('login')) {
      return ['src/lib/auth.ts', 'src/components/auth/**']
    }
    
    return ['src/**/*']
  }

  private suggestTestFiles(title: string): string[] {
    return ['**/*.test.ts', '**/*.spec.ts']
  }

  async createWorktree(taskId: string, baseBranch: string = 'main'): Promise<Worktree> {
    await this.ensureWorktreeDir()
    
    const worktreePath = join(WORKTREE_DIR, `task-${taskId}`)
    
    try {
      await execAsync(`git worktree add ${worktreePath} ${baseBranch}`, { cwd: process.cwd() })
      
      const worktree: Worktree = {
        path: worktreePath,
        taskId,
        commit: baseBranch,
        createdAt: Date.now()
      }
      
      this.worktrees.set(taskId, worktree)
      
      logger.info({ taskId, path: worktreePath }, 'Created git worktree')
      return worktree
    } catch (err: any) {
      logger.error({ err, taskId }, 'Failed to create worktree')
      throw new Error(`Failed to create worktree: ${err.message}`)
    }
  }

  async removeWorktree(taskId: string): Promise<void> {
    const worktree = this.worktrees.get(taskId)
    if (!worktree) {
      return
    }

    try {
      await execAsync(`git worktree remove ${worktree.path} --force`, { cwd: process.cwd() })
      this.worktrees.delete(taskId)
      logger.info({ taskId }, 'Removed git worktree')
    } catch (err: any) {
      logger.error({ err, taskId }, 'Failed to remove worktree')
    }
  }

  async executeSwarm(swarm: SwarmTask): Promise<SwarmResult> {
    logger.info({ 
      taskId: swarm.parentTaskId, 
      strategy: swarm.strategy,
      subtaskCount: swarm.subtasks.length 
    }, 'Starting swarm execution')

    const results: SubtaskResult[] = []
    const errors: string[] = []

    if (swarm.coordination === 'parallel') {
      const chunks = this.chunkArray(swarm.subtasks, swarm.maxParallel)
      
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(st => this.executeSubtask(st, swarm))
        )
        results.push(...chunkResults)
      }
    } else {
      for (const subtask of swarm.subtasks) {
        const result = await this.executeSubtask(subtask, swarm)
        results.push(result)
        
        if (!result.success && subtask.dependencies.length > 0) {
          break
        }
      }
    }

    const allSuccess = results.every(r => r.success)
    const anySuccess = results.some(r => r.success)

    const status = allSuccess ? 'success' : anySuccess ? 'partial' : 'failed'

    logger.info({ 
      taskId: swarm.parentTaskId, 
      status,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }, 'Swarm execution complete')

    return {
      taskId: swarm.parentTaskId,
      status,
      results,
      errors
    }
  }

  private async executeSubtask(subtask: Subtask, swarm: SwarmTask): Promise<SubtaskResult> {
    const startTime = Date.now()
    
    logger.info({ subtaskId: subtask.id }, 'Executing subtask')

    await this.createWorktree(subtask.id)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      return {
        subtaskId: subtask.id,
        success: true,
        output: `Completed: ${subtask.title}`,
        duration: Date.now() - startTime
      }
    } catch (err: any) {
      logger.error({ err, subtaskId: subtask.id }, 'Subtask failed')
      
      return {
        subtaskId: subtask.id,
        success: false,
        error: err.message,
        duration: Date.now() - startTime
      }
    } finally {
      await this.removeWorktree(subtask.id)
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  async reserveFiles(subtasks: Subtask[]): Promise<Map<string, string>> {
    const reservations = new Map<string, string>()

    for (const subtask of subtasks) {
      for (const file of subtask.files) {
        if (!reservations.has(file)) {
          reservations.set(file, subtask.id)
        }
      }
    }

    logger.debug({ reservations: reservations.size }, 'Files reserved for subtasks')
    return reservations
  }

  detectConflicts(results: SubtaskResult[]): string[] {
    const conflicts: string[] = []
    return conflicts
  }
}

export const swarmOrchestrator = new SwarmOrchestrator()

export async function executeSwarmTask(swarm: SwarmTask): Promise<SwarmResult> {
  return swarmOrchestrator.executeSwarm(swarm)
}

export async function decomposeIntoSubtasks(taskId: number, description: string): Promise<Subtask[]> {
  return swarmOrchestrator.decomposeTask(taskId, description)
}