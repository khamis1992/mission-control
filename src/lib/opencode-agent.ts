import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export interface OpenCodeConfig {
  model?: string
  agent?: string
  timeout?: number
  workingDirectory?: string
  env?: Record<string, string>
}

export interface OpenCodeResult {
  success: boolean
  output: string
  errors: string[]
  exitCode: number | null
  duration: number
  filesModified?: string[]
  artifacts?: string[]
}

export interface OpenCodeExecution {
  id: string
  task: string
  config: OpenCodeConfig
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout'
  startTime: number
  endTime?: number
  result?: OpenCodeResult
}

export class OpenCodeAgent extends EventEmitter {
  private runningProcesses: Map<string, ChildProcess> = new Map()
  private executions: Map<string, OpenCodeExecution> = new Map()
  private defaultConfig: OpenCodeConfig = {
    model: process.env.OPENCODE_DEFAULT_MODEL || 'deepseek/deepseek-chat',
    timeout: parseInt(process.env.OPENCODE_TIMEOUT || '300', 10),
    workingDirectory: process.cwd()
  }

  constructor(defaultConfig?: Partial<OpenCodeConfig>) {
    super()
    if (defaultConfig) {
      this.defaultConfig = { ...this.defaultConfig, ...defaultConfig }
    }
  }

  private generateId(): string {
    return `oc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  async execute(task: string, config?: Partial<OpenCodeConfig>): Promise<OpenCodeResult> {
    const executionId = this.generateId()
    const mergedConfig = { ...this.defaultConfig, ...config }
    
    const execution: OpenCodeExecution = {
      id: executionId,
      task,
      config: mergedConfig,
      status: 'pending',
      startTime: Date.now()
    }
    this.executions.set(executionId, execution)
    this.emit('started', execution)

    return new Promise((resolve) => {
      const args = this.buildArgs(task, mergedConfig)
      
      const proc = spawn('npx', ['opencode-ai', ...args], {
        cwd: mergedConfig.workingDirectory || this.defaultConfig.workingDirectory,
        env: {
          ...process.env,
          ...mergedConfig.env,
          OPENCODE_API_KEY: process.env.OPENCODE_API_KEY
        },
        shell: true
      })

      this.runningProcesses.set(executionId, proc)
      execution.status = 'running'
      this.emit('running', execution)

      let stdout = ''
      let stderr = ''
      let output = ''

      proc.stdout?.on('data', (data) => {
        const text = data.toString()
        stdout += text
        output += text
        this.emit('output', { executionId, text, type: 'stdout' })
      })

      proc.stderr?.on('data', (data) => {
        const text = data.toString()
        stderr += text
        output += text
        this.emit('output', { executionId, text, type: 'stderr' })
      })

      const timeout = mergedConfig.timeout || 300000
      const timeoutHandle = setTimeout(() => {
        proc.kill('SIGKILL')
        execution.status = 'timeout'
        this.emit('timeout', execution)
      }, timeout)

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle)
        this.runningProcesses.delete(executionId)
        
        const endTime = Date.now()
        execution.endTime = endTime
        execution.status = code === 0 ? 'completed' : 'failed'
        
        const errors = this.parseErrors(stderr + stdout)
        const filesModified = this.extractFilesModified(output)
        const artifacts = this.extractArtifacts(output)

        const result: OpenCodeResult = {
          success: code === 0 && errors.length === 0,
          output: output.substring(0, 100000),
          errors,
          exitCode: code,
          duration: endTime - execution.startTime,
          filesModified,
          artifacts
        }

        execution.result = result
        this.emit('completed', execution, result)

        resolve(result)
      })

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle)
        this.runningProcesses.delete(executionId)
        
        execution.status = 'failed'
        execution.endTime = Date.now()
        
        const result: OpenCodeResult = {
          success: false,
          output: '',
          errors: [err.message],
          exitCode: null,
          duration: Date.now() - execution.startTime
        }
        
        execution.result = result
        this.emit('error', execution, err)
        
        resolve(result)
      })
    })
  }

  private buildArgs(task: string, config: OpenCodeConfig): string[] {
    const args: string[] = ['run']
    
    if (config.agent) {
      args.push('--agent', config.agent)
    }
    
    if (config.model) {
      args.push('--model', config.model)
    }
    
    args.push('--')
    args.push(task)
    
    return args
  }

  private parseErrors(output: string): string[] {
    const errors: string[] = []
    const errorPatterns = [
      /Error:/gi,
      /error:/gi,
      /FAILED/gi,
      /Exception/gi,
      /failed/gi,
      /SyntaxError/gi,
      /TypeError/gi,
      /ReferenceError/gi
    ]

    const lines = output.split('\n')
    for (const line of lines) {
      for (const pattern of errorPatterns) {
        if (pattern.test(line)) {
          const trimmed = line.trim()
          if (trimmed && !errors.includes(trimmed)) {
            errors.push(trimmed)
          }
        }
      }
    }

    return errors.slice(0, 20)
  }

  private extractFilesModified(output: string): string[] {
    const files: string[] = []
    const patterns = [
      /modified:\s*(.+)/gi,
      /created:\s*(.+)/gi,
      /Writing\s+(.+)/gi,
      /Updated\s+(.+)/gi
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(output)) !== null) {
        const file = match[1]?.trim()
        if (file && !files.includes(file)) {
          files.push(file)
        }
      }
    }

    return files
  }

  private extractArtifacts(output: string): string[] {
    const artifacts: string[] = []
    const patterns = [
      /artifact:\s*(.+)/gi,
      /generated:\s*(.+)/gi,
      /created file:\s*(.+)/gi
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(output)) !== null) {
        const artifact = match[1]?.trim()
        if (artifact && !artifacts.includes(artifact)) {
          artifacts.push(artifact)
        }
      }
    }

    return artifacts
  }

  async executeWithRetry(
    task: string, 
    config?: Partial<OpenCodeConfig>,
    maxRetries: number = 3
  ): Promise<OpenCodeResult> {
    let lastError = ''
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.execute(task, config)
      
      if (result.success) {
        return result
      }
      
      lastError = result.errors.join('\n') || result.output.slice(-500)
      
      if (attempt < maxRetries) {
        const retryTask = `${task}\n\nPrevious attempt failed with errors:\n${lastError}\n\nPlease fix these issues and try again.`
        config = { ...config, model: config?.model || this.defaultConfig.model }
        task = retryTask
        
        this.emit('retry', { attempt: attempt + 1, maxRetries, lastError })
      }
    }

    return {
      success: false,
      output: '',
      errors: [`Failed after ${maxRetries} attempts. Last error: ${lastError}`],
      exitCode: 1,
      duration: 0
    }
  }

  getExecution(id: string): OpenCodeExecution | undefined {
    return this.executions.get(id)
  }

  getRunningExecutions(): OpenCodeExecution[] {
    return Array.from(this.executions.values()).filter(e => e.status === 'running')
  }

  getAllExecutions(): OpenCodeExecution[] {
    return Array.from(this.executions.values())
  }

  killExecution(id: string): boolean {
    const proc = this.runningProcesses.get(id)
    if (proc) {
      proc.kill('SIGKILL')
      this.runningProcesses.delete(id)
      
      const execution = this.executions.get(id)
      if (execution) {
        execution.status = 'failed'
        execution.endTime = Date.now()
      }
      return true
    }
    return false
  }

  killAll(): void {
    for (const [id, proc] of this.runningProcesses) {
      proc.kill('SIGKILL')
      const execution = this.executions.get(id)
      if (execution) {
        execution.status = 'failed'
        execution.endTime = Date.now()
      }
    }
    this.runningProcesses.clear()
  }
}

export const opencodeAgent = new OpenCodeAgent()

export async function executeOpenCodeTask(
  task: string,
  agentRole?: string,
  workingDir?: string
): Promise<OpenCodeResult> {
  const config: OpenCodeConfig = {
    workingDirectory: workingDir || process.cwd(),
    agent: agentRole || 'build'
  }

  return opencodeAgent.executeWithRetry(task, config, 3)
}