import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { logger } from './logger'

export interface Worktree {
  name: string
  path: string
  branch: string
  isMain: boolean
  hasChanges: boolean
  lastCommit?: string
}

export interface WorktreeResult {
  success: boolean
  output?: string
  error?: string
}

export interface Iteration {
  id: string
  name: string
  branch: string
  path: string
  createdAt: number
  taskId?: number
  status: 'active' | 'completed' | 'abandoned'
  parentBranch: string
}

export class GitWorktreeManager {
  private repoRoot: string
  private worktrees: Map<string, Worktree> = new Map()
  private iterations: Map<string, Iteration> = new Map()

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot
  }

  async initialize(): Promise<void> {
    await this.discoverWorktrees()
  }

  private async runGit(args: string[]): Promise<WorktreeResult> {
    return new Promise((resolve) => {
      const proc = spawn('git', ['-C', this.repoRoot, ...args], {
        shell: true,
        stdio: 'pipe',
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout.trim() })
        } else {
          resolve({ success: false, error: stderr.trim() || stdout.trim() || `Git command failed with code ${code}` })
        }
      })

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  }

  async discoverWorktrees(): Promise<Worktree[]> {
    const result = await this.runGit(['worktree', 'list', '--porcelain'])
    
    if (!result.success) {
      logger.error({ error: result.error }, 'Failed to list worktrees')
      return []
    }

    const worktrees: Worktree[] = []
    const lines = result.output?.split('\n') || []
    
    let currentWorktree: Partial<Worktree> = {}
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentWorktree.path = line.slice(9).trim()
        currentWorktree.name = path.basename(currentWorktree.path)
        currentWorktree.isMain = currentWorktree.path === this.repoRoot
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.slice(7).trim().replace(/^\* /, '')
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.lastCommit = line.slice(5).trim()
      } else if (line === '' && currentWorktree.path) {
        worktrees.push(currentWorktree as Worktree)
        currentWorktree = {}
      }
    }

    if (currentWorktree.path) {
      worktrees.push(currentWorktree as Worktree)
    }

    for (const wt of worktrees) {
      this.worktrees.set(wt.path, wt)
    }

    return worktrees
  }

  async createWorktree(branch: string, worktreePath: string, createBranch = true): Promise<WorktreeResult> {
    const args = ['worktree', 'add']
    
    if (createBranch) {
      args.push('-b', branch)
    } else {
      args.push(branch)
    }
    
    args.push(worktreePath)
    
    const result = await this.runGit(args)
    
    if (result.success) {
      const worktree: Worktree = {
        name: path.basename(worktreePath),
        path: worktreePath,
        branch,
        isMain: false,
        hasChanges: false,
      }
      this.worktrees.set(worktreePath, worktree)
    }
    
    return result
  }

  async removeWorktree(worktreePath: string, force = false): Promise<WorktreeResult> {
    const result = await this.runGit(['worktree', 'remove', worktreePath, force ? '--force' : ''])
    
    if (result.success) {
      this.worktrees.delete(worktreePath)
    }
    
    return result
  }

  async pruneWorktrees(): Promise<WorktreeResult> {
    const result = await this.runGit(['worktree', 'prune'])
    if (result.success) {
      await this.discoverWorktrees()
    }
    return result
  }

  async getStatus(worktreePath?: string): Promise<WorktreeResult> {
    const args = ['status', '--porcelain']
    if (worktreePath) {
      return this.runGit(['-C', worktreePath, ...args])
    }
    return this.runGit(args)
  }

  async getBranches(): Promise<string[]> {
    const result = await this.runGit(['branch', '--format=%(refname:short)'])
    if (!result.success) return []
    return result.output?.split('\n').filter(b => b.trim()) || []
  }

  async getCurrentBranch(worktreePath?: string): Promise<string> {
    const args = ['branch', '--show-current']
    if (worktreePath) {
      args.unshift(worktreePath)
      args[0] = '-C'
    }
    const result = await this.runGit(args)
    return result.output?.trim() || 'HEAD'
  }

  async getCurrentCommit(): Promise<string> {
    const result = await this.runGit(['rev-parse', 'HEAD'])
    return result.output?.trim() || ''
  }

  async createBranch(branchName: string, fromCommit?: string): Promise<WorktreeResult> {
    const args = ['checkout', '-b', branchName]
    if (fromCommit) {
      args.push(fromCommit)
    }
    return this.runGit(args)
  }

  async checkout(branchOrCommit: string, worktreePath?: string): Promise<WorktreeResult> {
    const args = worktreePath ? ['-C', worktreePath, 'checkout'] : ['checkout']
    args.push(branchOrCommit)
    return this.runGit(args)
  }

  async getLog(worktreePath: string, maxCount = 10): Promise<string> {
    const result = await this.runGit(['-C', worktreePath, 'log', `--oneline`, `-n`, String(maxCount)])
    return result.output || ''
  }

  async stash(worktreePath?: string, message?: string): Promise<WorktreeResult> {
    const args = worktreePath ? ['-C', worktreePath, 'stash'] : ['stash']
    if (message) {
      args.push('push', '-m', message)
    }
    return this.runGit(args)
  }

  async stashPop(worktreePath?: string): Promise<WorktreeResult> {
    const args = worktreePath ? ['-C', worktreePath, 'stash', 'pop'] : ['stash', 'pop']
    return this.runGit(args)
  }

  async diff(worktreePath?: string, commit1?: string, commit2?: string): Promise<string> {
    const args: string[] = []
    if (worktreePath) {
      args.push('-C', worktreePath)
    }
    args.push('diff')
    if (commit1) {
      args.push(commit1)
      if (commit2) {
        args.push(commit2)
      }
    }
    const result = await this.runGit(args)
    return result.output || ''
  }

  async merge(sourceBranch: string, worktreePath?: string, message?: string): Promise<WorktreeResult> {
    const args = worktreePath ? ['-C', worktreePath, 'merge'] : ['merge']
    args.push(sourceBranch)
    if (message) {
      args.push('-m', message)
    }
    return this.runGit(args)
  }

  async rebase(onto: string, worktreePath?: string): Promise<WorktreeResult> {
    const args = worktreePath ? ['-C', worktreePath, 'rebase'] : ['rebase']
    args.push(onto)
    return this.runGit(args)
  }

  async cherryPick(commit: string, worktreePath?: string): Promise<WorktreeResult> {
    const args = worktreePath ? ['-C', worktreePath, 'cherry-pick'] : ['cherry-pick']
    args.push(commit)
    return this.runGit(args)
  }

  getWorktree(worktreePath: string): Worktree | undefined {
    return this.worktrees.get(worktreePath)
  }

  getAllWorktrees(): Worktree[] {
    return Array.from(this.worktrees.values())
  }
}

export class IterationManager {
  private worktreeManager: GitWorktreeManager
  private iterationDir: string
  private iterations: Map<string, Iteration> = new Map()

  constructor(repoRoot: string, iterationDir?: string) {
    this.worktreeManager = new GitWorktreeManager(repoRoot)
    this.iterationDir = iterationDir || path.join(repoRoot, '.iterations')
    
    if (!fs.existsSync(this.iterationDir)) {
      fs.mkdirSync(this.iterationDir, { recursive: true })
    }
  }

  async initialize(): Promise<void> {
    await this.worktreeManager.initialize()
  }

  async createIteration(taskId: number, baseBranch?: string): Promise<Iteration | null> {
    const iterationId = `iter-${taskId}-${Date.now()}`
    const branchName = `iteration/${iterationId}`
    const worktreePath = path.join(this.iterationDir, iterationId)

    const currentBranch = baseBranch || await this.worktreeManager.getCurrentBranch()
    
    const result = await this.worktreeManager.createWorktree(branchName, worktreePath, true)
    if (!result.success) {
      logger.error({ error: result.error }, 'Failed to create iteration worktree')
      return null
    }

    const iteration: Iteration = {
      id: iterationId,
      name: `Iteration for Task ${taskId}`,
      branch: branchName,
      path: worktreePath,
      createdAt: Date.now(),
      taskId,
      status: 'active',
      parentBranch: currentBranch,
    }

    this.iterations.set(iterationId, iteration)

    this.saveIterationMetadata(iteration)

    return iteration
  }

  async completeIteration(iterationId: string, mergeBack = true): Promise<boolean> {
    const iteration = this.iterations.get(iterationId)
    if (!iteration) {
      return false
    }

    if (mergeBack) {
      const worktreePath = iteration.path
      const result = await this.worktreeManager.merge(iteration.parentBranch, worktreePath)
      if (!result.success) {
        logger.error({ error: result.error }, 'Failed to merge iteration back')
        return false
      }
    }

    iteration.status = 'completed'
    await this.updateIterationMetadata(iteration)

    await this.worktreeManager.removeWorktree(iteration.path, true)

    return true
  }

  async abandonIteration(iterationId: string): Promise<boolean> {
    const iteration = this.iterations.get(iterationId)
    if (!iteration) {
      return false
    }

    iteration.status = 'abandoned'
    await this.updateIterationMetadata(iteration)

    await this.worktreeManager.removeWorktree(iteration.path, true)

    return true
  }

  private saveIterationMetadata(iteration: Iteration): void {
    const metaPath = path.join(iteration.path, '.iteration-meta.json')
    fs.writeFileSync(metaPath, JSON.stringify(iteration, null, 2))
  }

  private async updateIterationMetadata(iteration: Iteration): Promise<void> {
    const metaPath = path.join(iteration.path, '.iteration-meta.json')
    if (fs.existsSync(metaPath)) {
      fs.writeFileSync(metaPath, JSON.stringify(iteration, null, 2))
    }
  }

  async loadIterations(): Promise<Iteration[]> {
    const iterations: Iteration[] = []
    
    if (!fs.existsSync(this.iterationDir)) {
      return iterations
    }

    const entries = fs.readdirSync(this.iterationDir)
    
    for (const entry of entries) {
      const entryPath = path.join(this.iterationDir, entry)
      const metaPath = path.join(entryPath, '.iteration-meta.json')
      
      if (fs.existsSync(metaPath)) {
        try {
          const content = fs.readFileSync(metaPath, 'utf-8')
          const iteration = JSON.parse(content) as Iteration
          iterations.push(iteration)
        } catch (error) {
          logger.warn({ entry }, 'Failed to load iteration metadata')
        }
      }
    }

    return iterations
  }

  getWorktreeManager(): GitWorktreeManager {
    return this.worktreeManager
  }
}

export const createIterationManager = (repoRoot: string, iterationDir?: string) => {
  return new IterationManager(repoRoot, iterationDir)
}