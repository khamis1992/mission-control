import { eventBus } from './event-bus'
import { logger } from './logger'
import { listActiveSessions } from './session-manager'

export interface SupervisorConfig {
  checkIntervalMs: number
  maxConcurrentTasks: number
  maxRetriesPerTask: number
  stallThresholdMs: number
  escalationThreshold: number
}

export interface TaskHealth {
  taskId: number
  status: 'healthy' | 'degraded' | 'stalled' | 'failing'
  reason?: string
  attempts: number
  lastProgress: number
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical'
  activeTasks: number
  sessionCount: number
  queueDepth: number
  recentErrors: string[]
  recommendations: string[]
}

export interface Escalation {
  taskId: number
  reason: string
  severity: 'warning' | 'critical'
  timestamp: number
  recommendedAction?: string
}

export class SupervisorAgent {
  private config: SupervisorConfig
  private healthHistory: Map<number, TaskHealth> = new Map()
  private escalations: Escalation[] = []
  private monitorInterval: NodeJS.Timeout | null = null
  private taskHealthCallbacks: Set<(health: SystemHealth) => void> = new Set()

  constructor(config: Partial<SupervisorConfig> = {}) {
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 30000,
      maxConcurrentTasks: config.maxConcurrentTasks ?? 10,
      maxRetriesPerTask: config.maxRetriesPerTask ?? 5,
      stallThresholdMs: config.stallThresholdMs ?? 10 * 60 * 1000,
      escalationThreshold: config.escalationThreshold ?? 3,
    }
  }

  start(): void {
    if (this.monitorInterval) return

    this.monitorInterval = setInterval(() => {
      this.monitor()
    }, this.config.checkIntervalMs)

    logger.info(this.config, 'Supervisor agent started')
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }
    logger.info('Supervisor agent stopped')
  }

  private async monitor(): Promise<void> {
    try {
      const sessions = listActiveSessions()
      const systemHealth = await this.assessSystemHealth(sessions.length)

      for (const session of sessions) {
        const taskHealth = await this.assessTaskHealth(session.taskId)
        this.healthHistory.set(session.taskId, taskHealth)

        if (taskHealth.status === 'failing' || taskHealth.status === 'stalled') {
          this.handleTaskIssue(taskHealth)
        }
      }

      eventBus.broadcast('supervisor.monitor', {
        health: systemHealth,
        timestamp: Date.now(),
      })

      this.taskHealthCallbacks.forEach(cb => cb(systemHealth))
    } catch (error) {
      logger.error({ error }, 'Supervisor monitor cycle failed')
    }
  }

  private async assessSystemHealth(sessionCount: number): Promise<SystemHealth> {
    const recommendations: string[] = []
    const recentErrors: string[] = []

    let overall: SystemHealth['overall'] = 'healthy'

    if (sessionCount > this.config.maxConcurrentTasks) {
      overall = 'degraded'
      recommendations.push(`High task load: ${sessionCount}/${this.config.maxConcurrentTasks} active`)
    }

    const failingTasks = Array.from(this.healthHistory.values())
      .filter(h => h.status === 'failing').length

    if (failingTasks > 0) {
      overall = failingTasks > 2 ? 'critical' : 'degraded'
      recommendations.push(`${failingTasks} tasks are failing`)
    }

    const stalledTasks = Array.from(this.healthHistory.values())
      .filter(h => h.status === 'stalled').length

    if (stalledTasks > 0) {
      overall = 'critical'
      recommendations.push(`${stalledTasks} tasks have stalled`)
    }

    return {
      overall,
      activeTasks: sessionCount,
      sessionCount,
      queueDepth: 0,
      recentErrors,
      recommendations,
    }
  }

  private async assessTaskHealth(taskId: number): Promise<TaskHealth> {
    const attempts = this.getAttemptCount(taskId)
    const lastProgress = this.getLastProgressTime(taskId)
    const now = Date.now()

    if (attempts >= this.config.maxRetriesPerTask) {
      return {
        taskId,
        status: 'failing',
        reason: 'Max retries exceeded',
        attempts,
        lastProgress,
      }
    }

    if (now - lastProgress > this.config.stallThresholdMs) {
      return {
        taskId,
        status: 'stalled',
        reason: 'No progress detected',
        attempts,
        lastProgress,
      }
    }

    if (attempts > this.config.escalationThreshold) {
      return {
        taskId,
        status: 'degraded',
        reason: 'High retry count',
        attempts,
        lastProgress,
      }
    }

    return {
      taskId,
      status: 'healthy',
      attempts,
      lastProgress,
    }
  }

  private handleTaskIssue(health: TaskHealth): void {
    const escalation: Escalation = {
      taskId: health.taskId,
      reason: health.reason || 'Unknown issue',
      severity: health.status === 'failing' ? 'critical' : 'warning',
      timestamp: Date.now(),
      recommendedAction: this.getRecommendedAction(health),
    }

    this.escalations.push(escalation)

    eventBus.broadcast('supervisor.escalate', escalation)

    if (escalation.severity === 'critical') {
      logger.warn({ taskId: health.taskId, reason: health.reason }, 'Task escalated to critical')
    }
  }

  private getRecommendedAction(health: TaskHealth): string {
    switch (health.status) {
      case 'stalled':
        return 'Consider cancelling and retrying with fresh context'
      case 'failing':
        return 'Review error logs and fix root cause before retrying'
      case 'degraded':
        return 'Monitor closely; consider intervention if attempts increase'
      default:
        return 'Continue monitoring'
    }
  }

  private getAttemptCount(taskId: number): number {
    return 0
  }

  private getLastProgressTime(taskId: number): number {
    return Date.now() - 60000
  }

  onHealthUpdate(callback: (health: SystemHealth) => void): void {
    this.taskHealthCallbacks.add(callback)
  }

  offHealthUpdate(callback: (health: SystemHealth) => void): void {
    this.taskHealthCallbacks.delete(callback)
  }

  getEscalations(limit = 10): Escalation[] {
    return this.escalations.slice(-limit)
  }

  getTaskHealth(taskId: number): TaskHealth | undefined {
    return this.healthHistory.get(taskId)
  }

  getAllTaskHealth(): Map<number, TaskHealth> {
    return new Map(this.healthHistory)
  }

  clearEscalations(): void {
    this.escalations = []
  }

  getConfig(): SupervisorConfig {
    return { ...this.config }
  }

  updateConfig(partial: Partial<SupervisorConfig>): void {
    this.config = { ...this.config, ...partial }
    logger.info({ config: this.config }, 'Supervisor config updated')
  }
}

export const supervisorAgent = new SupervisorAgent()