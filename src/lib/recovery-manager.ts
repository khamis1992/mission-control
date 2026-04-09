import { getDatabase, db_helpers } from './db';
import { eventBus } from './event-bus';
import { logger } from './logger';

export type RecoveryStrategy = 'retry' | 'rollback' | 'escalate' | 'skip' | 'fallback';
export type FailureType = 
  | 'timeout' 
  | 'rate_limit' 
  | 'authentication' 
  | 'network' 
  | 'resource' 
  | 'logic' 
  | 'dependency' 
  | 'unknown';

export interface RecoveryConfig {
  strategy: RecoveryStrategy;
  maxRetries: number;
  backoffMs: number;
  fallbackAgent?: string;
  fallbackTool?: string;
  escalationPath?: string;
  fallbackStrategy?: RecoveryStrategy;
}

export interface RecoveryContext {
  taskId: number;
  agentId: string;
  error: Error;
  failureType: FailureType;
  attempt: number;
  maxRetries: number;
  checkpoint: any | null;
  recoveryLogs: any[];
}

export interface RecoveryResult {
  ok: boolean;
  strategy: RecoveryStrategy;
  action: string;
  message: string;
  retryDelay?: number;
  error?: Error;
}

export class RecoveryManager {
  private recoveryStrategies: Map<FailureType, RecoveryConfig> = new Map();
  private retryCounts: Map<number, number> = new Map();
  
  constructor() {
    this.initDefaultStrategies();
  }
  
  private initDefaultStrategies() {
    this.recoveryStrategies.set('timeout', {
      strategy: 'retry',
      maxRetries: 3,
      backoffMs: 5000,
      escalationPath: 'operator'
    });
    
    this.recoveryStrategies.set('rate_limit', {
      strategy: 'retry',
      maxRetries: 2,
      backoffMs: 60000,
      escalationPath: 'operator'
    });
    
    this.recoveryStrategies.set('authentication', {
      strategy: 'escalate',
      maxRetries: 0,
      backoffMs: 0,
      escalationPath: 'security'
    });
    
    this.recoveryStrategies.set('network', {
      strategy: 'retry',
      maxRetries: 2,
      backoffMs: 10000,
      fallbackAgent: 'fallback-agent',
      escalationPath: 'operator'
    });
    
    this.recoveryStrategies.set('logic', {
      strategy: 'rollback',
      maxRetries: 1,
      backoffMs: 0,
      escalationPath: 'developer'
    });
    
    this.recoveryStrategies.set('dependency', {
      strategy: 'rollback',
      maxRetries: 1,
      backoffMs: 0,
      fallbackStrategy: 'skip'
    });
    
    this.recoveryStrategies.set('unknown', {
      strategy: 'retry',
      maxRetries: 2,
      backoffMs: 5000
    });
  }
  
  async executeRecovery(context: RecoveryContext): Promise<RecoveryResult> {
    const strategyConfig = this.recoveryStrategies.get(context.failureType);
    if (!strategyConfig) {
      return this.escalate(context, 'Unknown failure type');
    }
    
    const currentRetry = this.retryCounts.get(context.taskId) || 0;
    let action: RecoveryStrategy = strategyConfig.strategy;
    
    if (currentRetry >= strategyConfig.maxRetries) {
      action = 'escalate';
    } else if (action === 'retry' && strategyConfig.maxRetries > 1 && currentRetry > 0) {
      action = 'rollback';
    }
    
    switch (action) {
      case 'retry':
        return await this.retry(context, strategyConfig);
      case 'rollback':
        return await this.rollback(context, strategyConfig);
      case 'escalate':
        return await this.escalate(context, `Max retries exceeded for ${context.failureType}`);
      case 'skip':
        return await this.skip(context);
      case 'fallback':
        return await this.fallback(context, strategyConfig);
      default:
        return this.escalate(context, `Unknown recovery strategy: ${action}`);
    }
  }
  
  private async retry(context: RecoveryContext, config: RecoveryConfig): Promise<RecoveryResult> {
    const delay = config.backoffMs * Math.pow(2, context.attempt - 1);
    
    this.retryCounts.set(context.taskId, (this.retryCounts.get(context.taskId) || 0) + 1);
    
    await this.updateTask(context.taskId, {
      status: 'assigned',
      retry_count: context.attempt,
      recovery_strategy: 'retry',
      updated_at: Math.floor(Date.now() / 1000)
    });
    
    eventBus.broadcast('task.recovering', {
      task_id: context.taskId,
      strategy: 'retry',
      attempt: context.attempt,
      delay_ms: delay
    });
    
    setTimeout(async () => {
      try {
        const { dispatchAssignedTasks } = await import('./task-dispatch');
        await dispatchAssignedTasks();
      } catch (err) {
        logger.error({ taskId: context.taskId, error: err }, 'Delayed retry failed');
      }
    }, delay);
    
    return {
      ok: true,
      strategy: 'retry',
      action: `Retrying in ${delay}ms`,
      message: `Task will be retried after ${delay}ms delay`,
      retryDelay: delay
    };
  }
  
  private async rollback(context: RecoveryContext, config: RecoveryConfig): Promise<RecoveryResult> {
    if (!context.checkpoint) {
      return this.escalate(context, 'No checkpoint available for rollback');
    }
    
    const history: any[] = context.checkpoint.history || [];
    let rollbackStage: string;
    if (history.length > 1) {
      rollbackStage = history[history.length - 2].stage;
    } else {
      rollbackStage = context.checkpoint.stage;
    }
    
    await this.updateTask(context.taskId, {
      status: 'assigned',
      retry_count: context.attempt,
      recovery_strategy: 'rollback',
      updated_at: Math.floor(Date.now() / 1000)
    });
    
    eventBus.broadcast('task.recovering', {
      task_id: context.taskId,
      strategy: 'rollback',
      rollback_stage: rollbackStage,
      checkpoint_stage: context.checkpoint.stage
    });
    
    return {
      ok: true,
      strategy: 'rollback',
      action: `Rolled back to stage: ${rollbackStage}`,
      message: `Task rolled back to ${rollbackStage} for recovery`
    };
  }
  
  private async escalate(context: RecoveryContext, reason: string): Promise<RecoveryResult> {
    const currentAttempt = this.retryCounts.get(context.taskId) || 0;
    
    await this.updateTask(context.taskId, {
      status: 'failed',
      recovery_strategy: 'escalate',
      failure_type: context.failureType,
      error_message: reason,
      updated_at: Math.floor(Date.now() / 1000)
    });
    
    eventBus.broadcast('task.escalated', {
      task_id: context.taskId,
      reason: 'max_retries_exceeded',
      failure_type: context.failureType,
      attempt: currentAttempt
    });
    
    await this.addTaskComment(context.taskId, {
      author: 'system',
      content: `⚠️ Task escalated. Reason: ${reason}. Recovery strategy: escalate.`,
      created_at: Math.floor(Date.now() / 1000)
    });
    
    return {
      ok: true,
      strategy: 'escalate',
      action: 'Escalating to human operator',
      message: reason
    };
  }
  
  private async skip(context: RecoveryContext): Promise<RecoveryResult> {
    await this.updateTask(context.taskId, {
      status: 'done',
      resolution: `Skipped due to: ${context.error.message}`,
      recovery_strategy: 'skip',
      failure_type: context.failureType,
      outcome: 'skipped',
      updated_at: Math.floor(Date.now() / 1000)
    });
    
    eventBus.broadcast('task.skipped', {
      task_id: context.taskId,
      reason: 'dependency_failure'
    });
    
    return {
      ok: true,
      strategy: 'skip',
      action: 'Marked task as skipped',
      message: 'Task marked as skipped due to dependency failure'
    };
  }
  
  private async fallback(context: RecoveryContext, config: RecoveryConfig): Promise<RecoveryResult> {
    if (!config.fallbackAgent) {
      return this.escalate(context, 'No fallback agent configured');
    }
    
    const now = Math.floor(Date.now() / 1000);
    
    const db = getDatabase();
    const fallbackTaskId = db.prepare(`
      INSERT INTO tasks (title, description, status, metadata, assigned_to, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `Fallback for Task ${context.taskId}`,
      `Fallback execution for failed task ${context.taskId}`,
      'assigned',
      JSON.stringify({
        original_task_id: context.taskId,
        original_agent: context.agentId,
        failure_type: context.failureType,
        error: context.error.message
      }),
      config.fallbackAgent,
      now,
      now
    ).lastInsertRowid as number;
    
    await this.updateTask(context.taskId, {
      status: 'assigned',
      recovery_strategy: 'fallback',
      updated_at: now
    });
    
    return {
      ok: true,
      strategy: 'fallback',
      action: 'Fallback task created',
      message: `Fallback task created for ${config.fallbackAgent}`,
      retryDelay: 5000
    };
  }
  
  private async updateTask(taskId: number, updates: Partial<any>): Promise<void> {
    const db = getDatabase();
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), taskId];
    
    db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...values);
  }
  
  private async addTaskComment(taskId: number, comment: any): Promise<void> {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO task_comments (task_id, author, content, created_at)
      VALUES (?, ?, ?, ?)
    `).run(taskId, comment.author, comment.content, comment.created_at);
  }
  
  static classifyError(error: Error): FailureType {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many')) return 'rate_limit';
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) return 'authentication';
    if (message.includes('network') || message.includes('connection') || message.includes('econnrefused') || message.includes('enotfound')) return 'network';
    if (message.includes('memory') || message.includes('oom') || message.includes('heap') || message.includes('resource')) return 'resource';
    if (message.includes('dependency') || message.includes('prerequisite') || message.includes('required')) return 'dependency';
    if (message.includes('logic') || message.includes('invalid') || message.includes('assertion')) return 'logic';
    
    return 'unknown';
  }
}

export const recoveryManager = new RecoveryManager();

export function classifyError(error: Error): FailureType {
  return RecoveryManager.classifyError(error);
}

export function loadTaskCheckpoint(taskId: number): any | null {
  const db = getDatabase();
  const task = db.prepare('SELECT checkpoint_data FROM tasks WHERE id = ?').get(taskId) as any;
  
  if (!task?.checkpoint_data) return null;
  
  try {
    return JSON.parse(task.checkpoint_data);
  } catch {
    return null;
  }
}

export async function buildRecoveryContext(
  taskId: number,
  agentId: string,
  error: Error
): Promise<RecoveryContext> {
  const db = getDatabase();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  
  const checkpoint = loadTaskCheckpoint(taskId);
  const recoveryLogs = task.recovery_logs ? JSON.parse(task.recovery_logs) : [];
  const failureType = RecoveryManager.classifyError(error);
  
  return {
    taskId,
    agentId,
    error,
    failureType,
    attempt: (task.retry_count || 0) + 1,
    maxRetries: task.max_retries || 3,
    checkpoint,
    recoveryLogs
  };
}

export function persistCheckpoint(taskId: number, stage: string, data: any): void {
  const db = getDatabase();
  const existing = db.prepare('SELECT checkpoint_data FROM tasks WHERE id = ?').get(taskId) as any;
  const existingCheckpoint = existing?.checkpoint_data ? JSON.parse(existing.checkpoint_data) : null;
  
  const checkpoint = {
    stage,
    progress: data.progress || 0,
    timestamp: Date.now(),
    data,
    history: [
      ...(existingCheckpoint?.history || []),
      { stage, timestamp: Date.now(), data }
    ].slice(-10)
  };
  
  db.prepare(`
    UPDATE tasks 
    SET checkpoint_data = ?, updated_at = ? 
    WHERE id = ?
  `).run(JSON.stringify(checkpoint), Math.floor(Date.now() / 1000), taskId);
  
  eventBus.broadcast('task.checkpoint_saved', {
    task_id: taskId,
    stage,
    progress: checkpoint.progress
  });
}

export async function initiateRecovery(
  taskId: number,
  agentId: string,
  error: Error
): Promise<RecoveryResult> {
  try {
    const context = await buildRecoveryContext(taskId, agentId, error);
    const result = await recoveryManager.executeRecovery(context);
    
    logger.info({
      taskId,
      agentId,
      failureType: context.failureType,
      strategy: result.strategy,
      action: result.action
    }, 'Recovery initiated');
    
    return result;
  } catch (err: any) {
    logger.error({ taskId, agentId, error: err }, 'Recovery initiation failed');
    return {
      ok: false,
      strategy: 'escalate',
      action: 'Recovery initiation failed',
      message: err.message,
      error: err
    };
  }
}