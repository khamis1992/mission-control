# Session 4: HITL Approval + Recovery System Agent Prompt

## Background
You are Agent 4 implementing Session 4 of Mission Control's agent orchestration feature expansion.

## Goal
Implement Human-in-the-Loop approval gates and intelligent error recovery system with 5 recovery strategies.

## File Assignments

### NEW Files to Create
1. `src/lib/approval-gates.ts` - Approval gate configuration and management
2. `src/lib/recovery-manager.ts` - Error recovery strategies and execution
3. `src/app/api/approvals/route.ts` - Approvals API
4. `src/app/api/recovery/[taskId]/route.ts` - Recovery API
5. `src/components/panels/approval-queue-panel.tsx` - Approval queue UI
6. `src/components/panels/recovery-dashboard-panel.tsx` - Recovery dashboard UI

### EXISTING Files to Update
1. `src/lib/task-dispatch.ts` - Add recovery hooks and checkpoints
2. `src/app/api/tasks/route.ts` - Add approval checks before task start
3. `src/lib/scheduler.ts` - Add recovery orchestration job

## Implementation Tasks

### Task 1: Approval Gate Configuration (src/lib/approval-gates.ts)
```typescript
export type HITLMode = 'ALWAYS' | 'TERMINATE' | 'NEVER' | 'ON_CONDITION';
export type ApprovalCondition = 
  | 'before_tool' 
  | 'after_result' 
  | 'on_error' 
  | 'custom';

export interface ApprovalGate {
  id: string;
  task_id: number;
  agent_id: string;
  name: string;
  condition: ApprovalCondition;
  customCondition?: string; // JavaScript expression for 'custom'
  mode: HITLMode;
  approvers: string[]; // User IDs or roles
  timeout: number; // seconds
  escalationPath?: string;
  created_at: number;
  approved_at?: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface ApprovalRequest {
  id: string;
  gate_id: string;
  task_id: number;
  agent_id: string;
  payload: any;
  reason: string;
  created_at: number;
  expires_at: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ApprovalClient {
  createGate(gate: Omit<ApprovalGate, 'id' | 'created_at'>): Promise<string>;
  updateGate(id: string, updates: Partial<ApprovalGate>): Promise<void>;
  deleteGate(id: string): Promise<void>;
  
  createRequest(gateId: string, payload: any): Promise<ApprovalRequest>;
  approveRequest(requestId: string, userId: string): Promise<void>;
  rejectRequest(requestId: string, userId: string, reason: string): Promise<void>;
  expireRequest(requestId: string): Promise<void>;
  
  getActiveGates(taskId: number): Promise<ApprovalGate[]>;
  getPendingRequests(agentId: string): Promise<ApprovalRequest[]>;
  getRequestById(id: string): Promise<ApprovalRequest | null>;
}

export function shouldApprove(gate: ApprovalGate, context: any): boolean {
  switch (gate.mode) {
    case 'ALWAYS':
      return true;
    case 'TERMINATE':
      // Approve only at termination points
      return context.task_status === 'done' || context.last_tool === 'complete';
    case 'NEVER':
      return false;
    case 'ON_CONDITION':
      try {
        // Evaluate custom condition
        const fn = new Function('context', `'use strict'; return (${gate.customCondition})`);
        return fn(context);
      } catch {
        return false;
      }
  }
}
```

### Task 2: Recovery Manager (src/lib/recovery-manager.ts)
```typescript
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
}

export interface RecoveryContext {
  taskId: number;
  agentId: string;
  error: Error;
  failureType: FailureType;
  attempt: number;
  maxRetries: number;
  checkpoint: Checkpoint | null;
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
    // Timeout: retry with backoff, then rollback
    this.recoveryStrategies.set('timeout', {
      strategy: 'retry',
      maxRetries: 3,
      backoffMs: 5000,
      escalationPath: 'operator'
    });
    
    // Rate limit: retry with long backoff
    this.recoveryStrategies.set('rate_limit', {
      strategy: 'retry',
      maxRetries: 2,
      backoffMs: 60000,
      escalationPath: 'operator'
    });
    
    // Auth: escalate immediately
    this.recoveryStrategies.set('authentication', {
      strategy: 'escalate',
      maxRetries: 0,
      backoffMs: 0,
      escalationPath: 'security'
    });
    
    // Network: retry twice, then fallback/rollback
    this.recoveryStrategies.set('network', {
      strategy: 'retry',
      maxRetries: 2,
      backoffMs: 10000,
      fallbackAgent: 'fallback-agent',
      escalationPath: 'operator'
    });
    
    // Logic: rollback or manual
    this.recoveryStrategies.set('logic', {
      strategy: 'rollback',
      maxRetries: 1,
      backoffMs: 0,
      escalationPath: 'developer'
    });
    
    // Dependency: rollback or skip
    this.recoveryStrategies.set('dependency', {
      strategy: 'rollback',
      maxRetries: 1,
      backoffMs: 0,
      fallbackStrategy: 'skip'
    });
    
    // Unknown: retry once
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
    
    // Get current retry count
    const currentRetry = this.retryCounts.get(context.taskId) || 0;
    
    // Determine action based on attempt count
    let action: RecoveryStrategy = strategyConfig.strategy;
    
    // If already tried this strategy, escalate
    if (currentRetry >= strategyConfig.maxRetries) {
      action = 'escalate';
    } else if (action === 'retry' && strategyConfig.maxRetries > 1 && currentRetry > 0) {
      // After first retry, try rollback
      action = 'rollback';
    }
    
    // Execute based on strategy
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
    const delay = config.backoffMs * Math.pow(2, context.attempt - 1); // Exponential backoff
    
    this.retryCounts.set(context.taskId, this.retryCounts.get(context.taskId)! + 1);
    
    // Update task status
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
    
    // Schedule delayed retry
    setTimeout(async () => {
      const { dispatchSingleTask } = await import('./task-dispatch');
      dispatchSingleTask(context.taskId).catch(err => {
        logger.error({ 
          taskId: context.taskId, 
          error: err 
        }, 'Delayed retry failed');
      });
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
    
    // Find previous checkpoint stage
    const checkpoint = context.checkpoint;
    const history: any[] = checkpoint.history || [];
    
    let rollbackStage: string;
    if (history.length > 1) {
      rollbackStage = history[history.length - 2].stage;
    } else {
      rollbackStage = checkpoint.stage;
    }
    
    // Clear current checkpoint and reschedule
    await clearCheckpoint(context.taskId);
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
      checkpoint_stage: checkpoint.stage
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
    const escalationPath = context.checkpoint?.metadata?.escalation_path || 'operator';
    
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
    
    // Add comment for human attention
    await addTaskComment(context.taskId, {
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
    
    // Schedule fallback task
    const fallbackTask = {
      title: `Fallback for Task ${context.taskId}`,
      description: `Fallback execution for failed task`,
      status: 'assigned',
      assigned_to: config.fallbackAgent,
      metadata: JSON.stringify({
        original_task_id: context.taskId,
        original_agent: context.agentId,
        failure_type: context.failureType,
        error: context.error.message
      })
    };
    
    await createTask(fallbackTask);
    
    await this.updateTask(context.taskId, {
      status: 'assigned',
      recovery_strategy: 'fallback',
      updated_at: Math.floor(Date.now() / 1000)
    });
    
    return {
      ok: true,
      strategy: 'fallback',
      action: 'Fallback task created',
      message: `Fallback task created for ${config.fallbackAgent}`
    };
  }
  
  private async updateTask(taskId: number, updates: Partial<Task>): Promise<void> {
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
  
  private async createTask(task: any): Promise<number> {
    const db = getDatabase();
    const.now = Math.floor(Date.now() / 1000);
    
    const stmt = db.prepare(`
      INSERT INTO tasks (title, description, status, metadata, assigned_to, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      task.title,
      task.description,
      task.status,
      JSON.stringify(task.metadata),
      task.assigned_to,
      now,
      now
    );
    
    return result.lastInsertRowid as number;
  }
  
  // Public methods for error classification
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
  
  static getRecoveryStrategy(failureType: FailureType, attempt: number): RecoveryStrategy {
    const config = RecoveryManager.getRecoveryConfig(failureType);
    if (attempt >= config.maxRetries) return 'escalate';
    return config.strategy;
  }
  
  static getRecoveryConfig(failureType: FailureType): RecoveryConfig {
    return RecoveryManager.defaultStrategies.get(failureType) || {
      strategy: 'retry',
      maxRetries: 3,
      backoffMs: 5000
    };
  }
  
  private static defaultStrategies: Map<FailureType, RecoveryConfig> = new Map();
  
  static init() {
    RecoveryManager.defaultStrategies = RecoveryManager.defaultStrategies || RecoveryManager.defaultStrategies;
  }
}
```

### Task 3: Approval Queue UI (src/components/panels/approval-queue-panel.tsx)
```typescript
const ApprovalQueuePanel: React.FC = () => {
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  
  useEffect(() => {
    fetchPendingRequests();
  }, []);
  
  const fetchPendingRequests = async () => {
    setLoading(true);
    const res = await fetch('/api/approvals?status=pending');
    const data = await res.json();
    setPendingRequests(data);
    setLoading(false);
  };
  
  const handleApprove = async (requestId: string) => {
    const res = await fetch(`/api/approvals/${requestId}/approve`, { method: 'POST' });
    await res.json();
    fetchPendingRequests();
  };
  
  const handleReject = async (requestId: string, reason: string) => {
    const res = await fetch(`/api/approvals/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    await res.json();
    fetchPendingRequests();
  };
  
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Approval Queue</h2>
        <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
          {pendingRequests.length} pending
        </span>
      </div>
      
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : pendingRequests.length === 0 ? (
        <div className="text-gray-500 text-center py-8">No pending approvals</div>
      ) : (
        <div className="space-y-4">
          {pendingRequests.map(request => (
            <div key={request.id} className="bg-gray-800 rounded p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-sm text-gray-500">
                    Task {request.task_id} • {request.agent_id}
                  </div>
                  <div className="text-gray-300 font-medium">
                    {request.reason}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Created: {formatTime(request.created_at)}
                  <br />
                  Expires: {formatTime(request.expires_at)}
                </div>
              </div>
              
              <div className="bg-gray-900 rounded p-3 mb-3">
                <div className="text-sm text-gray-400 mb-1">Action Required:</div>
                <pre className="text-xs text-green-400 font-mono overflow-x-auto">
                  {JSON.stringify(request.payload, null, 2)}
                </pre>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedRequest(request)}
                  className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  Details
                </button>
                <button
                  onClick={() => handleApprove(request.id)}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(request.id, 'Rejected by operator')}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 p-4 flex items-center justify-center">
          <div className="bg-gray-800 rounded p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-bold">Approval Request Details</h3>
              <button onClick={() => setSelectedRequest(null)}>Close</button>
            </div>
            
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">Task ID</div>
              <div className="font-mono text-lg">{selectedRequest.task_id}</div>
            </div>
            
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">Request Reason</div>
              <div className="bg-gray-900 p-3 rounded text-gray-300">
                {selectedRequest.reason}
              </div>
            </div>
            
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">Payload</div>
              <pre className="bg-gray-900 p-3 rounded text-green-400 text-sm overflow-x-auto">
                {JSON.stringify(selectedRequest.payload, null, 2)}
              </pre>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(selectedRequest.id)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded"
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(selectedRequest.id, '')}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}
```

### Task 4: Recovery Dashboard (src/components/panels/recovery-dashboard-panel.tsx)
```typescript
const RecoveryDashboardPanel: React.FC = () => {
  const [failures, setFailures] = useState<Task[]>([]);
  const [recoveryStrategies, setRecoveryStrategies] = useState<Record<string, string>>({});
  
  useEffect(() => {
    fetchFailedTasks();
  }, []);
  
  const fetchFailedTasks = async () => {
    const res = await fetch('/api/tasks?status=failed');
    const data = await res.json();
    setFailures(data);
    
    // Count failures by type
    const strategies: Record<string, string> = {};
    data.forEach((task: any) => {
      if (task.recovery_strategy && !strategies[task.recovery_strategy]) {
        strategies[task.recovery_strategy] = '0';
      }
      if (task.recovery_strategy) {
        strategies[task.recovery_strategy] = 
          (parseInt(strategies[task.recovery_strategy] || '0') + 1).toString();
      }
    });
    setRecoveryStrategies(strategies);
  };
  
  const handleRetry = async (taskId: number) => {
    await fetch(`/api/recovery/${taskId}/retry`, { method: 'POST' });
    fetchFailedTasks();
  };
  
  const handleRollback = async (taskId: number) => {
    await fetch(`/api/recovery/${taskId}/rollback`, { method: 'POST' });
    fetchFailedTasks();
  };
  
  const handleEscalate = async (taskId: number) => {
    await fetch(`/api/recovery/${taskId}/escalate`, { method: 'POST' });
    fetchFailedTasks();
  };
  
  const formatStrategyCount = (strategy: string): string => {
    return recoveryStrategies[strategy] || '0';
  };
  
  return (
    <div className="p-4">
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StrategyCard strategy="retry" count={formatStrategyCount('retry')} />
        <StrategyCard strategy="rollback" count={formatStrategyCount('rollback')} />
        <StrategyCard strategy="escalate" count={formatStrategyCount('escalate')} />
        <StrategyCard strategy="skip" count={formatStrategyCount('skip')} />
        <StrategyCard strategy="fallback" count={formatStrategyCount('fallback')} />
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-800 text-gray-200">
            <tr>
              <th className="p-2">Task ID</th>
              <th className="p-2">Title</th>
              <th className="p-2">Failure Type</th>
              <th className="p-2">Strategy</th>
              <th className="p-2">Attempts</th>
              <th className="p-2">Error</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {failures.map(task => (
              <tr key={task.id} className="border-b border-gray-800 hover:bg-gray-800">
                <td className="p-2 font-mono text-blue-400">#{task.id}</td>
                <td className="p-2 text-gray-300">{task.title}</td>
                <td className="p-2 text-yellow-400">{task.failure_type || 'unknown'}</td>
                <td className="p-2 text-purple-400">{task.recovery_strategy || 'none'}</td>
                <td className="p-2">{task.retry_count || 0}</td>
                <td className="p-2 max-w-xs truncate text-gray-500">
                  {task.error_message || '-'}
                </td>
                <td className="p-2 flex gap-2">
                  <button
                    onClick={() => handleRetry(task.id)}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => handleRollback(task.id)}
                    className="text-purple-400 hover:text-purple-300"
                  >
                    Rollback
                  </button>
                  <button
                    onClick={() => handleEscalate(task.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Escalate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StrategyCard: React.FC<{ strategy: string; count: string }> = ({ strategy, count }) => (
  <div className="bg-gray-800 rounded p-4 text-center">
    <div className="text-2xl font-bold text-blue-400 mb-1">{count}</div>
    <div className="text-sm text-gray-300 uppercase">{strategy}</div>
  </div>
);
```

### Task 5: Recovery Manager Initialization
Add to `src/lib/recovery-manager.ts`:
```typescript
// Initialize on module load
RecoveryManager.init();

// Export singleton instance
export const recoveryManager = new RecoveryManager();
```

### Task 6: Update task-dispatch.ts
Add recovery hooks in the err handler:
```typescript
} catch (error: any) {
  const failureType = recoveryManager.classifyError(error);
  
  // Try recovery
  const recoveryResult = await recoveryManager.executeRecovery({
    taskId: task.id,
    agentId: task.assigned_to,
    error,
    failureType,
    attempt: (task.retry_count || 0) + 1,
    maxRetries: task.max_retries || 3,
    checkpoint: resumeFromCheckpoint(task.id),
    recoveryLogs: JSON.parse(task.recovery_logs || '[]')
  });
  
  logger.info({
    taskId: task.id,
    strategy: recoveryResult.strategy,
    error: error.message
  }, 'Recovery strategy executed');
  
  return { ok: false, taskId: task.id };
}
```

## Success Criteria
Complete when:
- [ ] 5 recovery strategies implemented (retry, rollback, escalate, skip, fallback)
- [ ] Exponential backoff works for retry strategy
- [ ] Error classification returns correct FailureType
- [ ] Rollback restores to previous checkpoint stage
- [ ] Approval queue shows pending requests
- [ ] Recovery dashboard shows retry history with breakdown
- [ ] Scheduler job finds and processes stale tasks
- [ ] Tests pass for all recovery scenarios

## Key Constraints
- Recovery must be idempotent (safe to retry)
- Approval requests expire after configurable timeout
- Checkpoint history must be preserved for rollback
- Follow existing patterns in task-dispatch.ts and scheduler.ts
- Use existing logger, eventBus, and getDatabase patterns

## Dependencies
- Session 1: Checkpoint backend must be working for rollback
- Session 3: Telemetry for tracking recovery attempts

Good luck! You're building the resilience system for Mission Control.