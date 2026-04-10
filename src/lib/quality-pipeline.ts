import { spawn } from 'child_process'
import { logger } from './logger'
import { eventBus } from './event-bus'

export interface QualityCheckResult {
  passed: boolean
  output: string
  errors: QualityIssue[]
  durationMs: number
}

export interface QualityIssue {
  file?: string
  line?: number
  message: string
  severity: 'error' | 'warning' | 'info'
  tool: 'eslint' | 'typescript' | 'prettier' | 'test' | 'security'
}

export interface QualityGateResult {
  passed: boolean
  checks: Map<string, QualityCheckResult>
  blocked: boolean
  blockedReason?: string
}

export interface QualityPipelineConfig {
  workingDirectory: string
  typescript?: boolean
  eslint?: boolean
  prettier?: boolean
  tests?: boolean
  security?: boolean
  failOnWarning?: boolean
  maxErrors?: number
}

export class QualityPipeline {
  private config: QualityPipelineConfig

  constructor(config: QualityPipelineConfig) {
    this.config = {
      typescript: true,
      eslint: true,
      prettier: true,
      tests: true,
      security: false,
      failOnWarning: false,
      maxErrors: 0,
      ...config,
    }
  }

  async runAll(): Promise<QualityGateResult> {
    const checks = new Map<string, QualityCheckResult>()
    let allPassed = true
    const issues: QualityIssue[] = []

    if (this.config.typescript) {
      const result = await this.runTypeScript()
      checks.set('typescript', result)
      if (!result.passed) allPassed = false
      issues.push(...result.errors)
    }

    if (this.config.eslint) {
      const result = await this.runESLint()
      checks.set('eslint', result)
      if (!result.passed) allPassed = false
      issues.push(...result.errors)
    }

    if (this.config.prettier) {
      const result = await this.runPrettier()
      checks.set('prettier', result)
      if (!result.passed) allPassed = false
      issues.push(...result.errors)
    }

    if (this.config.tests) {
      const result = await this.runTests()
      checks.set('tests', result)
      if (!result.passed) allPassed = false
      issues.push(...result.errors)
    }

    if (this.config.security) {
      const result = await this.runSecurity()
      checks.set('security', result)
      if (!result.passed) allPassed = false
      issues.push(...result.errors)
    }

    const blocked = Boolean(!allPassed && this.config.failOnWarning)
    const blockedReason = blocked ? 'Quality gate failed' : undefined

    if (blocked) {
      eventBus.broadcast('quality.failed', {
        checks: Object.fromEntries(checks),
        issues,
        timestamp: Date.now(),
      })
    } else {
      eventBus.broadcast('quality.passed', {
        checks: Object.fromEntries(checks),
        timestamp: Date.now(),
      })
    }

    return { passed: allPassed, checks, blocked, blockedReason }
  }

  private runCommand(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd: this.config.workingDirectory,
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
        resolve({ code: code || 0, stdout, stderr })
      })

      proc.on('error', (err) => {
        resolve({ code: 1, stdout: '', stderr: err.message })
      })
    })
  }

  async runTypeScript(): Promise<QualityCheckResult> {
    const start = Date.now()

    try {
      const result = await this.runCommand('npx', ['tsc', '--noEmit'])

      const errors: QualityIssue[] = []
      const lines = (result.stdout + result.stderr).split('\n')

      for (const line of lines) {
        const match = line.match(/^(.+?)\((\d+),?\d*\):\s*error\s+(.+)$/)
        if (match) {
          errors.push({
            file: match[1],
            line: parseInt(match[2], 10),
            message: match[3],
            severity: 'error',
            tool: 'typescript',
          })
        }
      }

      return {
        passed: result.code === 0 && errors.length === 0,
        output: result.stdout + result.stderr,
        errors,
        durationMs: Date.now() - start,
      }
    } catch (error) {
      return {
        passed: false,
        output: String(error),
        errors: [{ message: String(error), severity: 'error', tool: 'typescript' }],
        durationMs: Date.now() - start,
      }
    }
  }

  async runESLint(): Promise<QualityCheckResult> {
    const start = Date.now()

    try {
      const result = await this.runCommand('npx', ['eslint', 'src/**/*.{ts,tsx}', '--format=json'])

      const errors: QualityIssue[] = []

      try {
        const eslintOutput = JSON.parse(result.stdout)
        for (const file of eslintOutput) {
          for (const msg of file.messages) {
            errors.push({
              file: file.filePath,
              line: msg.line,
              message: msg.message,
              severity: msg.severity === 2 ? 'error' : 'warning',
              tool: 'eslint',
            })
          }
        }
      } catch {
        if (result.stderr) {
          errors.push({
            message: result.stderr,
            severity: 'error',
            tool: 'eslint',
          })
        }
      }

      return {
        passed: errors.filter(e => e.severity === 'error').length === 0,
        output: result.stdout + result.stderr,
        errors,
        durationMs: Date.now() - start,
      }
    } catch (error) {
      return {
        passed: false,
        output: String(error),
        errors: [{ message: String(error), severity: 'error', tool: 'eslint' }],
        durationMs: Date.now() - start,
      }
    }
  }

  async runPrettier(): Promise<QualityCheckResult> {
    const start = Date.now()

    try {
      const result = await this.runCommand('npx', ['prettier', '--check', 'src/**/*.{ts,tsx}'])

      const errors: QualityIssue[] = []

      if (result.code !== 0) {
        const lines = result.stdout.split('\n')
        for (const line of lines) {
          if (line.includes('src/')) {
            errors.push({
              file: line.trim(),
              message: 'Formatting issues found',
              severity: 'warning',
              tool: 'prettier',
            })
          }
        }
      }

      return {
        passed: result.code === 0,
        output: result.stdout + result.stderr,
        errors,
        durationMs: Date.now() - start,
      }
    } catch (error) {
      return {
        passed: false,
        output: String(error),
        errors: [{ message: String(error), severity: 'error', tool: 'prettier' }],
        durationMs: Date.now() - start,
      }
    }
  }

  async runTests(): Promise<QualityCheckResult> {
    const start = Date.now()

    try {
      const result = await this.runCommand('npm', ['test', '--', '--run'])

      const errors: QualityIssue[] = []

      if (result.code !== 0) {
        const lines = result.stdout.split('\n')
        for (const line of lines) {
          if (line.includes('FAIL') || line.includes('Error')) {
            errors.push({
              message: line.trim(),
              severity: 'error',
              tool: 'test',
            })
          }
        }
      }

      return {
        passed: result.code === 0,
        output: result.stdout + result.stderr,
        errors,
        durationMs: Date.now() - start,
      }
    } catch (error) {
      return {
        passed: false,
        output: String(error),
        errors: [{ message: String(error), severity: 'error', tool: 'test' }],
        durationMs: Date.now() - start,
      }
    }
  }

  async runSecurity(): Promise<QualityCheckResult> {
    const start = Date.now()

    try {
      const result = await this.runCommand('npm', ['audit', '--json'])

      const errors: QualityIssue[] = []

      try {
        const auditOutput = JSON.parse(result.stdout)
        if (auditOutput.metadata?.vulnerabilities) {
          const vulns = auditOutput.metadata.vulnerabilities
          const total = (vulns.critical || 0) + (vulns.high || 0) + (vulns.medium || 0)
          if (total > 0) {
            errors.push({
              message: `${total} vulnerabilities found (${vulns.critical || 0} critical, ${vulns.high || 0} high)`,
              severity: vulns.critical > 0 ? 'error' : 'warning',
              tool: 'security',
            })
          }
        }
      } finally {
        // Ignore
      }

      return {
        passed: errors.filter(e => e.severity === 'error').length === 0,
        output: result.stdout + result.stderr,
        errors,
        durationMs: Date.now() - start,
      }
    } catch (error) {
      return {
        passed: false,
        output: String(error),
        errors: [{ message: String(error), severity: 'error', tool: 'security' }],
        durationMs: Date.now() - start,
      }
    }
  }

  formatResults(result: QualityGateResult): string {
    const lines: string[] = []

    lines.push('=== Quality Gate Results ===')
    lines.push('')

    for (const [name, check] of result.checks) {
      const status = check.passed ? '✓ PASS' : '✗ FAIL'
      lines.push(`${status} ${name} (${check.durationMs}ms)`)

      if (check.errors.length > 0) {
        for (const error of check.errors.slice(0, 5)) {
          const location = error.file && error.line ? `${error.file}:${error.line}` : 'unknown'
          lines.push(`  - [${error.severity}] ${location}: ${error.message}`)
        }
        if (check.errors.length > 5) {
          lines.push(`  ... and ${check.errors.length - 5} more`)
        }
      }
    }

    lines.push('')
    lines.push(`Overall: ${result.passed ? 'PASSED' : 'FAILED'}`)

    return lines.join('\n')
  }
}

export const runQualityGate = async (config: QualityPipelineConfig): Promise<QualityGateResult> => {
  const pipeline = new QualityPipeline(config)
  return pipeline.runAll()
}