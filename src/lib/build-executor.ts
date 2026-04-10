import { spawn } from 'child_process'
import { getDatabase } from './db'
import { broadcastLog, type LogChunk } from './log-stream'

export type ProjectType = 'nextjs' | 'react' | 'node' | 'python' | 'static'

export interface BuildOptions {
  onLogChunk?: (chunk: { type: 'stdout' | 'stderr' | 'info'; text: string; timestamp: number }) => void
  taskId?: number
}

export interface BuildResult {
  success: boolean
  output: string
  errors: BuildError[]
  warnings: BuildWarning[]
  duration_ms: number
  artifacts: string[]
}

export interface BuildError {
  file?: string
  line?: number
  column?: number
  message: string
  code?: string
  severity: 'error' | 'fatal'
}

export interface BuildWarning {
  file?: string
  line?: number
  message: string
}

export async function detectProjectType(cwd: string): Promise<ProjectType> {
  const fs = await import('fs')
  const path = await import('path')
  
  try {
    const packageJsonPath = path.join(cwd, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
      
      if (deps['next']) return 'nextjs'
      if (deps['react'] && !deps['next']) return 'react'
      if (deps['express'] || deps['fastify']) return 'node'
    }
    
    const requirementsPath = path.join(cwd, 'requirements.txt')
    const pyprojectPath = path.join(cwd, 'pyproject.toml')
    
    if (fs.existsSync(requirementsPath) || fs.existsSync(pyprojectPath)) {
      return 'python'
    }
    
    const indexPath = path.join(cwd, 'index.html')
    if (fs.existsSync(indexPath)) {
      return 'static'
    }
    
    return 'node'
  } catch {
    return 'node'
  }
}

export async function installDependencies(cwd: string, projectType: ProjectType, options?: BuildOptions): Promise<BuildResult> {
  const startTime = Date.now()
  
  const commands: Record<ProjectType, { cmd: string; args: string[] }> = {
    nextjs: { cmd: 'pnpm', args: ['install'] },
    react: { cmd: 'pnpm', args: ['install'] },
    node: { cmd: 'pnpm', args: ['install'] },
    python: { cmd: 'pip', args: ['install', '-r', 'requirements.txt'] },
    static: { cmd: '', args: [] }
  }
  
  const { cmd, args } = commands[projectType]
  
  if (!cmd) {
    return {
      success: true,
      output: 'No dependencies to install for static project',
      errors: [],
      warnings: [],
      duration_ms: 0,
      artifacts: []
    }
  }
  
  try {
    const output = await runCommandWithStreaming(cmd, args, cwd, options)
    
    return {
      success: true,
      output,
      errors: [],
      warnings: [],
      duration_ms: Date.now() - startTime,
      artifacts: []
    }
  } catch (error: unknown) {
    const err = error as Error
    return {
      success: false,
      output: err.message,
      errors: [{ message: err.message, severity: 'error' }],
      warnings: [],
      duration_ms: Date.now() - startTime,
      artifacts: []
    }
  }
}

export async function runBuild(cwd: string, projectType: ProjectType, options?: BuildOptions): Promise<BuildResult> {
  const startTime = Date.now()
  
  const buildCommands: Record<ProjectType, { cmd: string; args: string[] }> = {
    nextjs: { cmd: 'pnpm', args: ['run', 'build'] },
    react: { cmd: 'pnpm', args: ['run', 'build'] },
    node: { cmd: 'pnpm', args: ['run', 'build'] },
    python: { cmd: '', args: [] },
    static: { cmd: '', args: [] }
  }
  
  const { cmd, args } = buildCommands[projectType]
  
  if (!cmd) {
    return {
      success: true,
      output: 'No build step for this project type',
      errors: [],
      warnings: [],
      duration_ms: 0,
      artifacts: []
    }
  }
  
  try {
    const output = await runCommandWithStreaming(cmd, args, cwd, options)
    const errors = detectErrors(output, projectType)
    
    return {
      success: errors.length === 0,
      output,
      errors,
      warnings: [],
      duration_ms: Date.now() - startTime,
      artifacts: []
    }
  } catch (error: unknown) {
    const err = error as Error
    const errors = detectErrors(err.message, projectType)
    
    return {
      success: false,
      output: err.message,
      errors: errors.length > 0 ? errors : [{ message: err.message, severity: 'error' }],
      warnings: [],
      duration_ms: Date.now() - startTime,
      artifacts: []
    }
  }
}

export function detectErrors(output: string, projectType: ProjectType): BuildError[] {
  const errors: BuildError[] = []
  const lines = output.split('\n')
  
  const patterns = [
    { regex: /Error:\s*(.+)/i, severity: 'error' as const },
    { regex: /ERROR in (.+)/i, severity: 'error' as const },
    { regex: /Failed to compile\.\s*(.+)/i, severity: 'error' as const },
    { regex: /Type error:\s*(.+)/i, severity: 'error' as const },
    { regex: /(\w+\.tsx?)\((\d+),(\d+)\):\s*error\s+(.+)/i, severity: 'error' as const },
    { regex: /SyntaxError:\s*(.+)/i, severity: 'fatal' as const },
  ]
  
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern.regex)
      if (match) {
        const error: BuildError = {
          message: match[1] || match[0],
          severity: pattern.severity
        }
        
        if (match.length >= 4) {
          error.file = match[1]
          error.line = parseInt(match[2])
          error.column = parseInt(match[3])
          error.message = match[4]
        }
        
        errors.push(error)
      }
    }
  }
  
  return errors
}

export async function storeBuildRun(
  taskId: number,
  commitSha: string | null,
  result: BuildResult
): Promise<number> {
  const db = getDatabase()
  const task = db.prepare('SELECT workspace_id FROM tasks WHERE id = ?').get(taskId) as { workspace_id: number }
  
  const buildResult = db.prepare(`
    INSERT INTO build_runs (task_id, commit_sha, status, output, errors, duration_ms, created_at, completed_at, workspace_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    commitSha,
    result.success ? 'success' : 'failed',
    result.output,
    JSON.stringify(result.errors),
    result.duration_ms,
    Math.floor(Date.now() / 1000),
    Math.floor(Date.now() / 1000),
    task?.workspace_id || 1
  )
  
  return buildResult.lastInsertRowid as number
}

export async function getBuildRuns(taskId: number): Promise<any[]> {
  const db = getDatabase()
  return db.prepare(`
    SELECT * FROM build_runs WHERE task_id = ? ORDER BY created_at DESC
  `).all(taskId)
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<string> {
  return runCommandWithStreaming(cmd, args, cwd, undefined)
}

function runCommandWithStreaming(cmd: string, args: string[], cwd: string, options?: BuildOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: 'pipe'
    })
    
    let stdout = ''
    let stderr = ''
    
    proc.stdout?.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      
      if (options?.onLogChunk) {
        options.onLogChunk({
          type: 'stdout',
          text: chunk,
          timestamp: Date.now()
        })
      }
      
      if (options?.taskId) {
        broadcastLog({
          taskId: options.taskId,
          type: 'stdout',
          text: chunk,
          timestamp: Date.now(),
          source: 'build'
        })
      }
    })
    
    proc.stderr?.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      
      if (options?.onLogChunk) {
        options.onLogChunk({
          type: 'stderr',
          text: chunk,
          timestamp: Date.now()
        })
      }
      
      if (options?.taskId) {
        broadcastLog({
          taskId: options.taskId,
          type: 'stderr',
          text: chunk,
          timestamp: Date.now(),
          source: 'build'
        })
      }
    })
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout + stderr)
      } else {
        reject(new Error(stderr || stdout || `Command failed with code ${code}`))
      }
    })
    
    proc.on('error', (err) => {
      reject(err)
    })
  })
}