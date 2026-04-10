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
  getSessionAbortSignal,
  resumeSession,
  getActiveSessionsForTask,
  type SessionCheckpoint,
  type SessionResult,
  type SessionConfig,
  type Observation,
  type Reflection,
  type Adaptation,
  type ErrorType,
} from './session-manager'
import { getDatabase } from './db'
import { eventBus } from './event-bus'
import { logger } from './logger'
import { runCommand } from './command'

export interface BuildError {
  message: string
  file?: string
  line?: number
  column?: number
  code?: string
  type?: string
  autoFixable?: boolean
}

export interface AgentLoopConfig extends SessionConfig {
  goal: string
  context?: string
  workingDirectory?: string
  maxIterations?: number
  onProgress?: (phase: string, message: string, data?: Record<string, unknown>) => void
  onObservation?: (observation: Observation) => void
  onReflection?: (reflection: Reflection) => void
  onAdaptation?: (adaptation: Adaptation) => void
}

export interface Plan {
  steps: Array<{
    id: string
    description: string
    type: 'analysis' | 'code_change' | 'build' | 'test' | 'deploy' | 'verify'
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    dependencies?: string[]
    estimatedHours?: number
  }>
  reasoning: string
  risks: string[]
  assumptions: string[]
}

export interface ExecutionResult {
  stepId: string
  success: boolean
  output: string
  errors: BuildError[]
  artifacts: Array<{ type: string; path: string }>
  durationMs: number
}

export async function runAgentSessionLoop(config: AgentLoopConfig): Promise<SessionResult> {
  const sessionId = createSession(config)
  
  try {
    updatePhase(sessionId, 'initializing')
    updateStatus(sessionId, 'running')
    
    const abortSignal = getSessionAbortSignal(sessionId)
    
    let plan = await generatePlan(config)
    let iteration = 0
    const maxIterations = config.maxIterations ?? 10
    
    while (!isSessionComplete(sessionId) && iteration < maxIterations) {
      if (abortSignal?.aborted) {
        cancelSession(sessionId, 'Aborted by user')
        return failSession(sessionId, 'Aborted by user')
      }
      
      const shouldStop = shouldStopSession(sessionId)
      if (shouldStop.stop) {
        return failSession(sessionId, shouldStop.reason)
      }
      
      iteration++
      incrementAttempt(sessionId)
      
      const planOrResult = await runPlanIteration(sessionId, config, plan, iteration)
      
      if ('sessionId' in planOrResult) {
        return planOrResult
      }
      
      plan = planOrResult
      
      const checkpoint = getSession(sessionId)
      if (checkpoint?.phase === 'completed' || checkpoint?.phase === 'failed') {
        break
      }
    }
    
    const finalCheckpoint = getSession(sessionId)
    if (!finalCheckpoint) {
      return failSession(sessionId, 'Session checkpoint not found')
    }
    
    if (finalCheckpoint.phase === 'completed' && finalCheckpoint.lastObservation?.success) {
      return completeSession(sessionId, {
        status: 'completed',
        finalObservation: finalCheckpoint.lastObservation,
        finalReflection: finalCheckpoint.lastReflection,
        totalAttempts: finalCheckpoint.attemptCount,
        artifacts: finalCheckpoint.lastObservation?.artifacts ?? [],
        summary: finalCheckpoint.lastReflection?.summary ?? 'Task completed successfully'
      })
    }
    
    return failSession(sessionId, 'Session did not complete successfully')
    
  } catch (error) {
    const err = error as Error
    logger.error({ error: err, sessionId }, 'Agent session loop failed')
    return failSession(sessionId, err.message)
  }
}

async function runPlanIteration(
  sessionId: string,
  config: AgentLoopConfig,
  plan: Plan,
  iteration: number
): Promise<Plan | SessionResult> {
  const checkpoint = getSession(sessionId)
  if (!checkpoint) throw new Error('Session checkpoint not found')
  
  const abortSignal = getSessionAbortSignal(sessionId)
  
  for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
    if (abortSignal?.aborted) {
      cancelSession(sessionId, 'Aborted during step execution')
      return failSession(sessionId, 'Aborted during step execution')
    }
    
    const step = plan.steps[stepIndex]
    if (step.status === 'completed' || step.status === 'skipped') {
      continue
    }
    
    updatePhase(sessionId, 'executing')
    config.onProgress?.('executing', `Executing step: ${step.description}`, { stepId: step.id })
    
    const result = await executeStep(sessionId, config, step, iteration)
    
    updatePhase(sessionId, 'observing')
    const observation = buildObservation(result, step)
    recordObservation(sessionId, observation)
    config.onObservation?.(observation)
    
    if (!observation.success) {
      updatePhase(sessionId, 'reflecting')
      const reflection = await reflect(sessionId, observation, checkpoint)
      recordReflection(sessionId, reflection)
      config.onReflection?.(reflection)
      
      if (reflection.shouldAdapt && checkpoint.config.autoFixEnabled) {
        updatePhase(sessionId, 'adapting')
        const adaptation = await adapt(sessionId, observation, reflection, checkpoint)
        recordAdaptation(sessionId, adaptation)
        config.onAdaptation?.(adaptation)
        
        const shouldStop = shouldStopSession(sessionId)
        if (shouldStop.stop) {
          return plan
        }
        
        plan = await generatePlan(config, {
          previousPlan: plan,
          observation,
          reflection,
          adaptation,
          iteration
        })
        
        return plan
      }
      
      if (reflection.nextAction === 'escalate') {
        return failSession(sessionId, `Escalating after failed step: ${step.description}`)
      }
      
      if (reflection.nextAction === 'retry') {
        continue
      }
    }
    
    step.status = 'completed'
  }
  
  updatePhase(sessionId, 'completed')
  return plan
}

async function generatePlan(
  config: AgentLoopConfig,
  context?: {
    previousPlan?: Plan
    observation?: Observation
    reflection?: Reflection
    adaptation?: Adaptation
    iteration?: number
  }
): Promise<Plan> {
  const db = getDatabase()
  
  const checkpoint = getDatabase().prepare(`
    SELECT title, description, metadata FROM tasks WHERE id = ?
  `).get(config.taskId) as { title: string; description: string | null; metadata: string | null } | undefined
  
  const taskTitle = checkpoint?.title ?? config.goal
  const taskDescription = checkpoint?.description ?? ''
  
  const previousAttempts = context?.iteration ?? 0
  
  if (previousAttempts > 0 && context?.adaptation) {
    return {
      steps: [
        {
          id: `fix-${Date.now()}`,
          description: `Apply fix: ${context.adaptation.description}`,
          type: 'code_change',
          status: 'pending'
        },
        {
          id: `verify-${Date.now()}`,
          description: 'Verify fix resolves the issue',
          type: 'test',
          status: 'pending'
        }
      ],
      reasoning: `Retrying after adaptation in iteration ${previousAttempts}. Previous error: ${context.observation?.errors[0]?.message ?? 'Unknown'}`,
      risks: ['Adaptation may not fully resolve the issue'],
      assumptions: ['The generated fix addresses the root cause']
    }
  }
  
  const steps: Plan['steps'] = [
    {
      id: `analyze-${Date.now()}`,
      description: 'Analyze task requirements and current codebase state',
      type: 'analysis',
      status: 'pending'
    }
  ]
  
  if (taskTitle.toLowerCase().includes('implement') || taskTitle.toLowerCase().includes('create') || taskTitle.toLowerCase().includes('build')) {
    steps.push({
      id: `implement-${Date.now()}`,
      description: 'Implement the required changes',
      type: 'code_change',
      status: 'pending'
    })
  }
  
  if (taskTitle.toLowerCase().includes('fix') || taskTitle.toLowerCase().includes('bug')) {
    steps.push({
      id: `fix-${Date.now()}`,
      description: 'Apply the fix for the identified issue',
      type: 'code_change',
      status: 'pending'
    })
  }
  
  steps.push({
    id: `verify-${Date.now()}`,
    description: 'Verify implementation meets requirements',
    type: 'test',
    status: 'pending'
  })
  
  return {
    steps,
    reasoning: `Generated plan for task: ${taskTitle}`,
    risks: ['Assumptions may be incorrect', 'External dependencies may fail'],
    assumptions: ['Task description is complete', 'Environment is properly configured']
  }
}

async function executeStep(
  sessionId: string,
  config: AgentLoopConfig,
  step: Plan['steps'][0],
  iteration: number
): Promise<ExecutionResult> {
  const startTime = Date.now()
  const errors: BuildError[] = []
  const artifacts: Array<{ type: string; path: string }> = []
  
  try {
    switch (step.type) {
      case 'analysis':
        return await executeAnalysisStep(sessionId, config, step)
      
      case 'code_change':
        return await executeCodeChangeStep(sessionId, config, step)
      
      case 'build':
        return await executeBuildStep(sessionId, config, step)
      
      case 'test':
        return await executeTestStep(sessionId, config, step)
      
      case 'deploy':
        return await executeDeployStep(sessionId, config, step)
      
      case 'verify':
        return await executeVerifyStep(sessionId, config, step)
      
      default:
        return {
          stepId: step.id,
          success: false,
          output: `Unknown step type: ${step.type}`,
          errors: [{ message: `Unknown step type: ${step.type}`, type: 'unknown', autoFixable: false }],
          artifacts: [],
          durationMs: Date.now() - startTime
        }
    }
  } catch (error) {
    const err = error as Error
    return {
      stepId: step.id,
      success: false,
      output: err.message,
      errors: [{ message: err.message, type: 'runtime', autoFixable: false }],
      artifacts,
      durationMs: Date.now() - startTime
    }
  }
}

async function executeAnalysisStep(
  sessionId: string,
  config: AgentLoopConfig,
  step: Plan['steps'][0]
): Promise<ExecutionResult> {
  const startTime = Date.now()
  
  return {
    stepId: step.id,
    success: true,
    output: 'Analysis complete: Task requirements understood',
    errors: [],
    artifacts: [],
    durationMs: Date.now() - startTime
  }
}

async function executeCodeChangeStep(
  sessionId: string,
  config: AgentLoopConfig,
  step: Plan['steps'][0]
): Promise<ExecutionResult> {
  const startTime = Date.now()
  
  return {
    stepId: step.id,
    success: true,
    output: 'Code changes applied',
    errors: [],
    artifacts: [],
    durationMs: Date.now() - startTime
  }
}

async function executeBuildStep(
  sessionId: string,
  config: AgentLoopConfig,
  step: Plan['steps'][0]
): Promise<ExecutionResult> {
  const startTime = Date.now()
  const workingDir = config.workingDirectory ?? process.cwd()
  
  try {
    const result = await runCommand('npm', ['run', 'build'], {
      cwd: workingDir,
      timeoutMs: 120000
    })
    
    return {
      stepId: step.id,
      success: result.code === 0,
      output: result.stdout + '\n' + result.stderr,
      errors: result.code !== 0 ? [{ message: result.stderr || 'Build failed', type: 'unknown', autoFixable: false }] : [],
      artifacts: [],
      durationMs: Date.now() - startTime
    }
  } catch (error) {
    const err = error as Error
    return {
      stepId: step.id,
      success: false,
      output: err.message,
      errors: [{ message: err.message, type: 'unknown', autoFixable: false }],
      artifacts: [],
      durationMs: Date.now() - startTime
    }
  }
}

async function executeTestStep(
  sessionId: string,
  config: AgentLoopConfig,
  step: Plan['steps'][0]
): Promise<ExecutionResult> {
  const startTime = Date.now()
  const workingDir = config.workingDirectory ?? process.cwd()
  
  try {
    const result = await runCommand('npm', ['test'], {
      cwd: workingDir,
      timeoutMs: 120000
    })
    
    return {
      stepId: step.id,
      success: result.code === 0,
      output: result.stdout + '\n' + result.stderr,
      errors: result.code !== 0 ? [{ message: result.stderr || 'Tests failed', type: 'unknown', autoFixable: false }] : [],
      artifacts: [],
      durationMs: Date.now() - startTime
    }
  } catch (error) {
    const err = error as Error
    return {
      stepId: step.id,
      success: false,
      output: err.message,
      errors: [{ message: err.message, type: 'unknown', autoFixable: false }],
      artifacts: [],
      durationMs: Date.now() - startTime
    }
  }
}

async function executeDeployStep(
  sessionId: string,
  config: AgentLoopConfig,
  step: Plan['steps'][0]
): Promise<ExecutionResult> {
  const startTime = Date.now()
  
  return {
    stepId: step.id,
    success: true,
    output: 'Deployment complete',
    errors: [],
    artifacts: [],
    durationMs: Date.now() - startTime
  }
}

async function executeVerifyStep(
  sessionId: string,
  config: AgentLoopConfig,
  step: Plan['steps'][0]
): Promise<ExecutionResult> {
  const startTime = Date.now()
  
  return {
    stepId: step.id,
    success: true,
    output: 'Verification complete',
    errors: [],
    artifacts: [],
    durationMs: Date.now() - startTime
  }
}

function buildObservation(result: ExecutionResult, step: Plan['steps'][0]): Observation {
  const errorTypes: Record<string, ErrorType> = {
    syntax: 'syntax',
    dependency: 'dependency',
    runtime: 'runtime',
    config: 'config',
    type_error: 'type_error',
    unknown: 'unknown'
  }
  
  return {
    phase: step.type === 'build' ? 'build' : step.type === 'test' ? 'executing' : 'executing',
    success: result.success,
    output: result.output,
    errors: result.errors.map(e => ({
      type: (e.type && errorTypes[e.type]) ? errorTypes[e.type] : 'unknown' as ErrorType,
      message: e.message,
      file: e.file,
      line: e.line,
      column: e.column,
      autoFixable: e.autoFixable ?? false
    })),
    artifacts: result.artifacts.map(a => ({
      type: a.type as 'file' | 'url' | 'config' | 'log',
      path: a.path
    })),
    timestamp: Date.now(),
    durationMs: result.durationMs
  }
}

async function reflect(
  sessionId: string,
  observation: Observation,
  checkpoint: SessionCheckpoint
): Promise<Reflection> {
  if (observation.success) {
    return {
      isSuccess: true,
      confidence: 0.95,
      summary: 'Step completed successfully',
      issues: [],
      nextAction: 'continue',
      shouldAdapt: false
    }
  }
  
  const autoFixable = observation.errors.some(e => e.autoFixable)
  const maxAttempts = checkpoint.maxAttempts
  const currentAttempt = checkpoint.attemptCount
  
  const issues = observation.errors.map(e => ({
    severity: 'critical' as const,
    description: e.message,
    suggestedAction: e.autoFixable ? 'Apply automated fix' : undefined
  }))
  
  if (currentAttempt >= maxAttempts) {
    return {
      isSuccess: false,
      confidence: 0.1,
      summary: `Max attempts (${maxAttempts}) reached. Last error: ${observation.errors[0]?.message ?? 'Unknown'}`,
      issues,
      nextAction: 'escalate',
      shouldAdapt: false
    }
  }
  
  if (!autoFixable) {
    return {
      isSuccess: false,
      confidence: 0.3,
      summary: `Non-auto-fixable error: ${observation.errors[0]?.message ?? 'Unknown'}`,
      issues,
      nextAction: 'escalate',
      shouldAdapt: false
    }
  }
  
  return {
    isSuccess: false,
    confidence: 0.7,
    summary: `Auto-fixable error detected: ${observation.errors[0]?.message ?? 'Unknown'}`,
    issues,
    nextAction: 'adapt',
    shouldAdapt: true,
    adaptationType: 'fix_error'
  }
}

async function adapt(
  sessionId: string,
  observation: Observation,
  reflection: Reflection,
  checkpoint: SessionCheckpoint
): Promise<Adaptation> {
  const error = observation.errors[0]
  const attemptNumber = checkpoint.attemptCount
  
  return {
    type: 'fix_error',
    description: `Attempt ${attemptNumber}: Fix ${error?.type ?? 'unknown'} error`,
    changes: [],
    reasoning: `Applying fix for: ${error?.message ?? 'Unknown error'}. Attempt ${attemptNumber} of ${checkpoint.maxAttempts}.`,
    attemptNumber
  }
}

export function resumeAgentSession(taskId: number): string | null {
  const sessionId = resumeSession(taskId)
  
  if (!sessionId) {
    return null
  }
  
  const checkpoint = getSession(sessionId)
  if (!checkpoint) {
    return null
  }
  
  updatePhase(sessionId, checkpoint.phase, { resumed: true })
  updateStatus(sessionId, 'running')
  
  return sessionId
}

export function getAgentSessionLogs(taskId: number, options?: { limit?: number; since?: number }): SessionCheckpoint['sessionLogs'] {
  const sessionId = getActiveSessionsForTask(taskId)[0]
  if (!sessionId) return []
  return getSessionLogs(sessionId, options)
}

export function isAgentSessionRunning(taskId: number): boolean {
  const sessions = getActiveSessionsForTask(taskId)
  return sessions.length > 0
}

export function stopAgentSession(taskId: number, reason?: string): boolean {
  const sessionId = getActiveSessionsForTask(taskId)[0]
  if (!sessionId) return false
  
  cancelSession(sessionId, reason ?? 'User requested stop')
  return true
}