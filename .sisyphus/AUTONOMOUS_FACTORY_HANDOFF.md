# Autonomous Software Factory - Parallel Execution Handoff

## 🎯 Overview

**Completed:** Phases 1-3 (Schema, Migration, TypeScript types)
**Strategy:** Run 5 sessions IN PARALLEL for Phases 4-11
**Final:** Phase 12 (demo) after all sessions complete

---

## ✅ Phase 1-3: COMPLETE

### Database Schema (Migration 050)
**File:** `src/lib/migrations.ts`
- Added 11 new columns to `tasks` table
- Migration auto-applies on `pnpm dev`

### TypeScript Interfaces
- `src/lib/db.ts` - Task interface extended
- `src/store/index.ts` - Store types updated
- `src/lib/validation.ts` - Zod schemas added

**All new fields:**
```typescript
task_type, parent_task_id, execution_mode, agent_role,
parallel_group_id, max_retries, failure_type, 
recovery_strategy, checkpoint_data, artifacts, decisions, recovery_logs
```

---

## 🚀 PARALLEL EXECUTION PLAN

### Session Assignment Matrix

| Session | Phase(s) | Primary Files | Conflicts | Est. Time |
|---------|----------|---------------|-----------|-----------|
| **1** | Phase 4 (UI) | `task-board-panel.tsx` | None | 45 min |
| **2** | Phase 5 (Generator) | `auto-task-generator.ts` (NEW) | None | 30 min |
| **3** | Phase 6+7 (Dispatch+Roles) | `task-dispatch.ts`, `agent-role-matcher.ts`, `scheduler.ts` | Session 4 | 40 min |
| **4** | Phase 8+9 (Checkpoint+Healing) | `checkpoint-manager.ts`, `task-dispatch.ts` | Session 3 | 35 min |
| **5** | Phase 10+11 (Artifacts+Realtime) | `artifact-manager.ts`, `event-bus.ts`, `use-server-events.ts` | None | 30 min |

### Critical Coordination
- **Sessions 3 & 4** share `task-dispatch.ts`
- **Solution:** Session 3 works on lines 1-600, Session 4 works on lines 600+ OR Session 4 waits for Session 3

---

## 📋 SESSION 1: UI EXTENSION (Phase 4)

### Your Mission
Add 6 new tabs to TaskDetailModal component

### Exclusive File Access
✅ `src/components/panels/task-board-panel.tsx` - **ONLY YOU TOUCH THIS**

### Changes Required

#### 1. Update activeTab state (line ~1233)
```typescript
const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'quality' | 'session' | 'subtasks' | 'agents' | 'discussion' | 'artifacts' | 'logs' | 'recovery'>('details')
```

#### 2. Add tab buttons (after line ~1540, inside the tab button map)
```typescript
{task.task_type === 'mission' && (
  <button
    onClick={() => setActiveTab('subtasks')}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      activeTab === 'subtasks' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
    }`}
  >
    Subtasks
  </button>
)}
{task.artifacts && JSON.parse(task.artifacts || '[]').length > 0 && (
  <button
    onClick={() => setActiveTab('artifacts')}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      activeTab === 'artifacts' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
    }`}
  >
    Artifacts
  </button>
)}
{task.decisions && JSON.parse(task.decisions || '[]').length > 0 && (
  <button
    onClick={() => setActiveTab('discussion')}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      activeTab === 'discussion' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
    }`}
  >
    Discussion
  </button>
)}
<button
  onClick={() => setActiveTab('logs')}
  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
    activeTab === 'logs' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
  }`}
>
  Logs
</button>
{(task.recovery_logs || task.status === 'failed') && (
  <button
    onClick={() => setActiveTab('recovery')}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      activeTab === 'recovery' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
    }`}
  >
    Recovery
  </button>
)}
```

#### 3. Add tab panels (after line ~1812, before the closing divs)
```typescript
{activeTab === 'subtasks' && (
  <div id="tabpanel-subtasks" role="tabpanel" className="space-y-3">
    <div className="text-xs text-muted-foreground">
      {task.task_type === 'mission' ? (
        <SubtaskTreeView parentTaskId={task.id} />
      ) : (
        <p>This task is not a mission root task</p>
      )}
    </div>
  </div>
)}

{activeTab === 'artifacts' && (
  <div id="tabpanel-artifacts" role="tabpanel" className="space-y-3">
    <ArtifactList artifacts={JSON.parse(task.artifacts || '[]')} />
  </div>
)}

{activeTab === 'discussion' && (
  <div id="tabpanel-discussion" role="tabpanel" className="space-y-3">
    <DecisionThread decisions={JSON.parse(task.decisions || '[]')} />
  </div>
)}

{activeTab === 'logs' && (
  <div id="tabpanel-logs" role="tabpanel" className="space-y-3">
    <TaskExecutionLogs taskId={task.id} />
  </div>
)}

{activeTab === 'recovery' && (
  <div id="tabpanel-recovery" role="tabpanel" className="space-y-3">
    <RecoveryPanel 
      recoveryLogs={JSON.parse(task.recovery_logs || '[]')}
      failureType={task.failure_type}
      recoveryStrategy={task.recovery_strategy}
      retryCount={task.retry_count}
      maxRetries={task.max_retries}
    />
  </div>
)}
```

#### 4. Create helper components (add before TaskDetailModal function, around line 1190)

```typescript
function SubtaskTreeView({ parentTaskId }: { parentTaskId: number }) {
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tasks?parent_task_id=${parentTaskId}`)
      .then(r => r.json())
      .then(data => {
        setSubtasks(data.tasks || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [parentTaskId])

  if (loading) return <div className="text-muted-foreground">Loading subtasks...</div>
  if (subtasks.length === 0) return <div className="text-muted-foreground">No subtasks yet</div>

  return (
    <div className="space-y-2">
      {subtasks.map(st => (
        <div key={st.id} className="border-l-2 border-primary/30 pl-3 py-1">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{st.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              st.status === 'done' ? 'bg-green-500/20 text-green-400' :
              st.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
              st.status === 'failed' ? 'bg-red-500/20 text-red-400' :
              'bg-surface-2 text-muted-foreground'
            }`}>
              {st.status}
            </span>
          </div>
          {st.agent_role && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Role: {st.agent_role}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ArtifactList({ artifacts }: { artifacts: any[] }) {
  if (artifacts.length === 0) return <div className="text-muted-foreground">No artifacts yet</div>

  return (
    <div className="space-y-2">
      {artifacts.map((artifact, idx) => (
        <div key={idx} className="border border-border/50 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-foreground">{artifact.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              {artifact.type}
            </span>
          </div>
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto">
            {artifact.content?.substring(0, 200)}...
          </div>
        </div>
      ))}
    </div>
  )
}

function DecisionThread({ decisions }: { decisions: any[] }) {
  if (decisions.length === 0) return <div className="text-muted-foreground">No decisions yet</div>

  return (
    <div className="space-y-3">
      {decisions.map((decision, idx) => (
        <div key={idx} className="border-l-2 border-blue-500/30 pl-3">
          <div className="text-xs text-muted-foreground mb-1">
            {decision.type || 'Decision'}
          </div>
          <div className="text-sm text-foreground">{decision.summary || decision.content}</div>
        </div>
      ))}
    </div>
  )
}

function TaskExecutionLogs({ taskId }: { taskId: number }) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/comments`)
      .then(r => r.json())
      .then(data => {
        setLogs(data.comments || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [taskId])

  if (loading) return <div className="text-muted-foreground">Loading logs...</div>
  if (logs.length === 0) return <div className="text-muted-foreground">No execution logs yet</div>

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {logs.map((log, idx) => (
        <div key={idx} className="text-xs border-b border-border/30 pb-2">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span>{log.author}</span>
            <span>{new Date(log.created_at * 1000).toLocaleString()}</span>
          </div>
          <div className="text-foreground font-mono">{log.content.substring(0, 150)}...</div>
        </div>
      ))}
    </div>
  )
}

function RecoveryPanel({ recoveryLogs, failureType, recoveryStrategy, retryCount, maxRetries }: any) {
  return (
    <div className="space-y-4">
      {failureType && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
          <div className="text-xs font-medium text-red-400 mb-1">Failure Type</div>
          <div className="text-sm text-foreground">{failureType}</div>
        </div>
      )}
      
      <div className="bg-surface-2 border border-border/50 rounded p-3">
        <div className="text-xs font-medium text-foreground mb-1">Retry Status</div>
        <div className="text-sm text-muted-foreground">
          {retryCount || 0} / {maxRetries || 3} attempts
        </div>
      </div>

      {recoveryLogs && recoveryLogs.length > 0 && (
        <div>
          <div className="text-xs font-medium text-foreground mb-2">Recovery History</div>
          <div className="space-y-2">
            {recoveryLogs.map((log: any, idx: number) => (
              <div key={idx} className="text-xs border-l-2 border-orange-500/30 pl-2">
                <div className="text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
                <div className="text-foreground">{log.action}: {log.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

### Deliverables
- [ ] 6 new tabs visible in TaskDetailModal
- [ ] Subtasks tab shows child tasks
- [ ] Artifacts tab displays artifact list
- [ ] Discussion tab shows decisions
- [ ] Logs tab shows execution logs
- [ ] Recovery tab shows retry history

### Verification
```bash
pnpm dev
# Open task details modal
# Verify 6 new tabs appear
```

---

## 📋 SESSION 2: AUTO TASK GENERATOR (Phase 5)

### Your Mission
Create the AI-powered task decomposition engine

### Exclusive File Access
✅ `src/lib/auto-task-generator.ts` - **CREATE NEW FILE**

### Implementation

```typescript
import { getDatabase } from './db'
import { eventBus } from './event-bus'
import type { Task } from './db'
import { callClaudeDirectly } from './task-dispatch'

interface GeneratedSubtask {
  title: string
  description?: string
  agent_role: 'planner' | 'architect' | 'backend' | 'frontend' | 'qa' | 'devops' | 'reviewer' | 'recovery'
  execution_mode: 'autonomous'
  parallel_group?: string
}

export async function generateSubtasks(rootTask: Task): Promise<GeneratedSubtask[]> {
  const prompt = `You are a senior software architect. Break down this task into 6-10 subtasks.

Task: ${rootTask.title}
${rootTask.description || ''}

Generate subtasks covering:
1. Product planning (planner role)
2. Architecture design (architect role)
3. Database design (architect role)
4. Backend API (backend role)
5. Frontend UI (frontend role)
6. Testing (qa role)
7. Deployment (devops role)
8. Documentation (planner role)

Return ONLY a JSON array (no markdown, no code blocks):
[
  {
    "title": "Design database schema",
    "description": "Create schema for car rental entities",
    "agent_role": "architect",
    "execution_mode": "autonomous",
    "parallel_group": "phase-1"
  }
]

Group parallel tasks with same parallel_group (e.g., backend + frontend can run together).`

  try {
    const response = await callClaudeDirectly({
      task: { ...rootTask, description: prompt },
      prompt,
      modelOverride: 'sonnet'
    })

    const text = response.text || '[]'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const subtasks = JSON.parse(cleaned)

    return Array.isArray(subtasks) ? subtasks : []
  } catch (error) {
    console.error('Failed to generate subtasks:', error)
    return getDefaultSubtasks(rootTask)
  }
}

function getDefaultSubtasks(rootTask: Task): GeneratedSubtask[] {
  return [
    {
      title: 'Create PRD',
      description: 'Product requirements document',
      agent_role: 'planner',
      execution_mode: 'autonomous',
      parallel_group: 'planning'
    },
    {
      title: 'Design architecture',
      description: 'System architecture document',
      agent_role: 'architect',
      execution_mode: 'autonomous',
      parallel_group: 'planning'
    },
    {
      title: 'Design database schema',
      description: 'Database schema design',
      agent_role: 'architect',
      execution_mode: 'autonomous',
      parallel_group: 'phase-1'
    },
    {
      title: 'Implement backend API',
      description: 'Backend REST API',
      agent_role: 'backend',
      execution_mode: 'autonomous',
      parallel_group: 'phase-2'
    },
    {
      title: 'Implement frontend UI',
      description: 'Frontend components',
      agent_role: 'frontend',
      execution_mode: 'autonomous',
      parallel_group: 'phase-2'
    },
    {
      title: 'Write tests',
      description: 'Test suite',
      agent_role: 'qa',
      execution_mode: 'autonomous',
      parallel_group: 'phase-3'
    },
    {
      title: 'Deploy to staging',
      description: 'Deployment configuration',
      agent_role: 'devops',
      execution_mode: 'autonomous',
      parallel_group: 'phase-4'
    }
  ]
}

export async function createSubtaskGraph(rootTaskId: number, workspaceId: number): Promise<{ ok: boolean; count: number }> {
  const db = getDatabase()
  
  const rootTask = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
    .get(rootTaskId, workspaceId) as Task | undefined
  
  if (!rootTask) {
    throw new Error('Root task not found')
  }

  if (rootTask.task_type !== 'mission') {
    throw new Error('Only mission tasks can generate subtasks')
  }

  const subtasks = await generateSubtasks(rootTask)
  
  const insertStmt = db.prepare(`
    INSERT INTO tasks (
      title, description, status, priority, project_id,
      parent_task_id, task_type, execution_mode, agent_role,
      parallel_group_id, workspace_id, created_by, created_at, updated_at
    ) VALUES (?, ?, 'inbox', 'medium', ?, ?, 'subtask', 'autonomous', ?, ?, ?, 'system', ?, ?)
  `)

  const now = Math.floor(Date.now() / 1000)
  let count = 0

  const transaction = db.transaction(() => {
    for (const subtask of subtasks) {
      insertStmt.run(
        subtask.title,
        subtask.description || '',
        rootTask.project_id,
        rootTaskId,
        subtask.agent_role,
        subtask.parallel_group || null,
        workspaceId,
        now,
        now
      )
      count++
    }
  })

  transaction()

  eventBus.broadcast('task.subtasks_generated', {
    parent_id: rootTaskId,
    count,
    workspace_id: workspaceId
  })

  return { ok: true, count }
}

export function groupByParallelExecution(subtasks: GeneratedSubtask[]): Record<string, GeneratedSubtask[]> {
  const groups: Record<string, GeneratedSubtask[]> = {}
  
  for (const subtask of subtasks) {
    const groupId = subtask.parallel_group || 'sequential'
    if (!groups[groupId]) groups[groupId] = []
    groups[groupId].push(subtask)
  }
  
  return groups
}
```

### API Route Addition
Create `src/app/api/tasks/[id]/generate-subtasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { createSubtaskGraph } from '@/lib/auto-task-generator'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const taskId = parseInt(params.id, 10)
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
  }

  try {
    const result = await createSubtaskGraph(taskId, auth.user.workspace_id)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Trigger Hook
Add to `src/app/api/tasks/route.ts` after task creation (around line 280):

```typescript
// After successful task creation
if (task.task_type === 'mission' && task.execution_mode === 'autonomous') {
  // Trigger subtask generation asynchronously
  fetch(`http://localhost:${process.env.PORT || 3000}/api/tasks/${taskId}/generate-subtasks`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${request.headers.get('authorization')}` }
  }).catch(err => logger.error({ err }, 'Failed to trigger subtask generation'))
}
```

### Deliverables
- [ ] `auto-task-generator.ts` created
- [ ] API route for manual trigger
- [ ] Auto-trigger on mission task creation
- [ ] Event broadcast on generation

### Verification
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Build blog","task_type":"mission","execution_mode":"autonomous"}'

# Should auto-generate 6-10 subtasks
```

---

## 📋 SESSION 3: PARALLEL DISPATCH + ROLE SYSTEM (Phase 6+7)

### Your Mission
Implement parallel agent execution and role-based task assignment

### Files to Modify
✅ `src/lib/agent-role-matcher.ts` (NEW - exclusive)
✅ `src/lib/scheduler.ts` (add new job)
⚠️ `src/lib/task-dispatch.ts` (COORDINATE WITH SESSION 4)
   - You work on lines 1-600 (top half)
   - Session 4 works on lines 600+ (bottom half)

### Part 1: Agent Role Matcher

**Create:** `src/lib/agent-role-matcher.ts`

```typescript
import type { Agent, Task } from './db'

export const ROLE_CAPABILITIES: Record<string, string[]> = {
  planner: ['requirements', 'prd', 'roadmap', 'planning', 'documentation', 'spec'],
  architect: ['design', 'architecture', 'database', 'schema', 'structure', 'system'],
  backend: ['api', 'server', 'database', 'auth', 'integration', 'rest', 'graphql'],
  frontend: ['ui', 'component', 'page', 'styling', 'react', 'vue', 'angular', 'css'],
  qa: ['test', 'testing', 'e2e', 'integration', 'coverage', 'quality', 'verify'],
  devops: ['deploy', 'ci', 'cd', 'docker', 'kubernetes', 'infrastructure', 'pipeline'],
  reviewer: ['review', 'audit', 'quality', 'approval', 'check', 'validate'],
  recovery: ['fix', 'debug', 'recover', 'retry', 'heal', 'error', 'resolve']
}

export function matchAgentToRole(agent: Agent, task: Task): number {
  if (agent.status === 'offline' || agent.status === 'error') return -1
  
  const taskText = `${task.title} ${task.description || ''}`.toLowerCase()
  
  let score = 0
  
  if (task.agent_role) {
    const roleKeywords = ROLE_CAPABILITIES[task.agent_role] || []
    for (const keyword of roleKeywords) {
      if (taskText.includes(keyword)) score += 10
    }
    
    if (agent.role === task.agent_role) score += 30
  }
  
  if (agent.status === 'idle') score += 5
  
  return Math.max(score, 1)
}

export function findBestAgentForRole(
  agents: Agent[],
  role: Task['agent_role'],
  taskText: string
): Agent | null {
  const candidates = agents
    .filter(a => a.status !== 'offline' && a.status !== 'error')
    .map(agent => ({
      agent,
      score: matchAgentToRole(agent, { agent_role: role } as Task)
    }))
    .sort((a, b) => b.score - a.score)
  
  return candidates[0]?.agent || null
}
```

### Part 2: Parallel Dispatch Engine

**Modify:** `src/lib/task-dispatch.ts` (ADD TO TOP, lines 50-150)

```typescript
export async function dispatchParallelGroups(): Promise<{ ok: boolean; dispatched: number; message: string }> {
  const db = getDatabase()
  const config = getConfig()
  
  if (!config.features.parallel_dispatch) {
    return { ok: true, dispatched: 0, message: 'Parallel dispatch disabled' }
  }

  const groups = db.prepare(`
    SELECT DISTINCT parallel_group_id 
    FROM tasks 
    WHERE status = 'assigned' 
      AND parallel_group_id IS NOT NULL
      AND execution_mode = 'autonomous'
      AND workspace_id = ?
  `).all(getWorkspaceId()) as { parallel_group_id: string }[]

  let totalDispatched = 0

  for (const group of groups) {
    const tasks = db.prepare(`
      SELECT * FROM tasks 
      WHERE parallel_group_id = ? 
        AND status = 'assigned'
        AND workspace_id = ?
    `).all(group.parallel_group_id, getWorkspaceId()) as Task[]

    if (tasks.length === 0) continue

    const dispatchPromises = tasks.map(task => dispatchSingleTask(task))
    const results = await Promise.allSettled(dispatchPromises)
    
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    totalDispatched += succeeded

    logger.info({
      group: group.parallel_group_id,
      total: tasks.length,
      succeeded
    }, 'Parallel group dispatched')
  }

  return { 
    ok: true, 
    dispatched: totalDispatched, 
    message: `Dispatched ${totalDispatched} tasks across ${groups.length} parallel groups` 
  }
}

async function dispatchSingleTask(task: Task): Promise<{ ok: boolean; taskId: number }> {
  const db = getDatabase()
  
  db.prepare(`UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ?`)
    .run(Math.floor(Date.now() / 1000), task.id)
  
  eventBus.broadcast('task.status_changed', {
    id: task.id,
    status: 'in_progress',
    previous_status: 'assigned'
  })

  try {
    const result = await callClaudeDirectly({
      task,
      prompt: buildTaskPrompt(task),
      modelOverride: classifyTaskModel(task)
    })

    db.prepare(`
      UPDATE tasks 
      SET status = 'review',
          resolution = ?,
          outcome = 'success',
          updated_at = ?
      WHERE id = ?
    `).run(result.text, Math.floor(Date.now() / 1000), task.id)

    eventBus.broadcast('task.status_changed', {
      id: task.id,
      status: 'review',
      previous_status: 'in_progress'
    })

    return { ok: true, taskId: task.id }
  } catch (error: any) {
    db.prepare(`
      UPDATE tasks 
      SET status = 'assigned',
          error_message = ?,
          retry_count = retry_count + 1,
          updated_at = ?
      WHERE id = ?
    `).run(error.message, Math.floor(Date.now() / 1000), task.id)

    return { ok: false, taskId: task.id }
  }
}

function buildTaskPrompt(task: Task): string {
  let prompt = `Task: ${task.title}\n`
  if (task.description) prompt += `\n${task.description}\n`
  if (task.agent_role) prompt += `\nRole: ${task.agent_role}\n`
  return prompt
}

function getWorkspaceId(): number {
  const db = getDatabase()
  const ws = db.prepare('SELECT id FROM workspaces LIMIT 1').get() as { id: number }
  return ws?.id || 1
}
```

### Part 3: Update Scheduler

**Modify:** `src/lib/scheduler.ts` (add new task around line 380)

```typescript
tasks.set('parallel_dispatch', {
  name: 'Parallel Dispatch',
  intervalMs: TICK_MS,
  handler: async () => {
    const { dispatchParallelGroups } = await import('./task-dispatch')
    return dispatchParallelGroups()
  }
})
```

### Deliverables
- [ ] `agent-role-matcher.ts` created
- [ ] `dispatchParallelGroups()` function added
- [ ] Scheduler updated with new job
- [ ] Role matching integrated

### Verification
```bash
# Create parallel tasks manually
curl -X POST http://localhost:3000/api/tasks \
  -d '{"title":"Backend API","parallel_group_id":"phase-1","status":"assigned"}'
curl -X POST http://localhost:3000/api/tasks \
  -d '{"title":"Frontend UI","parallel_group_id":"phase-1","status":"assigned"}'

# Both should dispatch simultaneously (check logs)
```

---

## 📋 SESSION 4: CHECKPOINT + SELF-HEALING (Phase 8+9)

### Your Mission
Implement checkpoint/resume and enhanced recovery system with full stage tracking

### Files to Modify
✅ `src/lib/checkpoint-manager.ts` (NEW - exclusive)
⚠️ `src/lib/task-dispatch.ts` (COORDINATE WITH SESSION 3)
   - You work on lines 600+ (bottom half)
   - Session 3 works on lines 1-600 (top half)

### Part 1: Enhanced Checkpoint Manager

**Create:** `src/lib/checkpoint-manager.ts`

```typescript
import { getDatabase } from './db'
import { eventBus } from './event-bus'

export interface Checkpoint {
  stage: string
  progress: number
  timestamp: number
  data?: any
  message?: string
  // Enhanced fields
  stage_version?: number
  rollback_data?: any
  artifacts_generated?: string[]
  dependencies_satisfied?: boolean
}

export interface CheckpointStage {
  name: string
  version: number
  required: boolean
  dependencies: string[]
  estimated_progress: number
}

export const CHECKPOINT_STAGES: CheckpointStage[] = [
  { name: 'initialization', version: 1, required: true, dependencies: [], estimated_progress: 5 },
  { name: 'planning', version: 1, required: true, dependencies: ['initialization'], estimated_progress: 15 },
  { name: 'analysis', version: 1, required: false, dependencies: ['planning'], estimated_progress: 25 },
  { name: 'design', version: 1, required: false, dependencies: ['analysis'], estimated_progress: 35 },
  { name: 'implementation', version: 1, required: true, dependencies: ['design'], estimated_progress: 60 },
  { name: 'testing', version: 1, required: false, dependencies: ['implementation'], estimated_progress: 75 },
  { name: 'review', version: 1, required: true, dependencies: ['testing'], estimated_progress: 90 },
  { name: 'completion', version: 1, required: true, dependencies: ['review'], estimated_progress: 100 }
]

export function saveCheckpoint(taskId: number, checkpoint: Checkpoint): void {
  const db = getDatabase()
  
  const existingTask = db.prepare('SELECT checkpoint_data FROM tasks WHERE id = ?').get(taskId) as any
  const existingCheckpoint = existingTask?.checkpoint_data 
    ? JSON.parse(existingTask.checkpoint_data) 
    : null
  
  // Merge with history tracking
  const history = existingCheckpoint?.history || []
  if (existingCheckpoint) {
    history.push({
      stage: existingCheckpoint.stage,
      progress: existingCheckpoint.progress,
      timestamp: existingCheckpoint.timestamp
    })
  }
  
  const mergedCheckpoint: Checkpoint & { history: any[] } = {
    ...existingCheckpoint,
    ...checkpoint,
    timestamp: Date.now(),
    stage_version: checkpoint.stage_version || 1,
    history: history.slice(-10) // Keep last 10 checkpoints
  }
  
  db.prepare(`
    UPDATE tasks 
    SET checkpoint_data = ?, updated_at = ? 
    WHERE id = ?
  `).run(JSON.stringify(mergedCheckpoint), Math.floor(Date.now() / 1000), taskId)
  
  eventBus.broadcast('task.checkpoint_saved', { 
    task_id: taskId, 
    stage: checkpoint.stage,
    progress: checkpoint.progress,
    stage_version: mergedCheckpoint.stage_version
  })
}

export function resumeFromCheckpoint(taskId: number): Checkpoint | null {
  const db = getDatabase()
  const task = db.prepare('SELECT checkpoint_data FROM tasks WHERE id = ?').get(taskId) as any
  
  if (!task?.checkpoint_data) return null
  
  try {
    return JSON.parse(task.checkpoint_data)
  } catch {
    return null
  }
}

export function clearCheckpoint(taskId: number): void {
  const db = getDatabase()
  db.prepare('UPDATE tasks SET checkpoint_data = NULL WHERE id = ?').run(taskId)
}

// ===== ENHANCED CHECKPOINT UTILITIES =====

export function getCheckpointHistory(taskId: number): any[] {
  const checkpoint = resumeFromCheckpoint(taskId)
  return checkpoint?.history || []
}

export function validateCheckpointIntegrity(checkpoint: Checkpoint): boolean {
  if (!checkpoint.stage || !checkpoint.timestamp) return false
  if (checkpoint.progress < 0 || checkpoint.progress > 100) return false
  return true
}

export function findCheckpointForStage(taskId: number, stage: string): Checkpoint | null {
  const history = getCheckpointHistory(taskId)
  return history.find(h => h.stage === stage) || null
}

export function getStageDependencies(stageName: string): string[] {
  const stage = CHECKPOINT_STAGES.find(s => s.name === stageName)
  return stage?.dependencies || []
}

export function canResumeFromStage(checkpoint: Checkpoint, targetStage: string): boolean {
  const targetStageInfo = CHECKPOINT_STAGES.find(s => s.name === targetStage)
  if (!targetStageInfo) return false
  
  const history = (checkpoint as any).history || []
  const completedStages = history.map((h: any) => h.stage)
  
  return targetStageInfo.dependencies.every(dep => completedStages.includes(dep))
}

export function buildResumePrompt(checkpoint: Checkpoint): string {
  let prompt = `\n\n## Checkpoint Recovery`
  prompt += `\nPrevious stage: ${checkpoint.stage}`
  prompt += `\nProgress: ${checkpoint.progress}%`
  if (checkpoint.message) prompt += `\nLast message: ${checkpoint.message}`
  if (checkpoint.data) prompt += `\nRecovered data: ${JSON.stringify(checkpoint.data).substring(0, 500)}`
  
  const stageInfo = CHECKPOINT_STAGES.find(s => s.name === checkpoint.stage)
  if (stageInfo) {
    prompt += `\n\nNext expected stages: ${stageInfo.dependencies.join(' → ')}`
  }
  
  prompt += `\n\nContinue from this point. Do not repeat completed work.`
  return prompt
}

export function saveRollbackPoint(taskId: number, stage: string, data: any): void {
  const checkpoint = resumeFromCheckpoint(taskId)
  
  const rollbackPoints = (checkpoint as any)?.rollback_points || {}
  rollbackPoints[stage] = {
    data,
    timestamp: Date.now()
  }
  
  saveCheckpoint(taskId, {
    ...checkpoint,
    stage,
    progress: checkpoint?.progress || 0,
    rollback_points: rollbackPoints
  } as any)
}

export function rollbackToStage(taskId: number, stage: string): any | null {
  const checkpoint = resumeFromCheckpoint(taskId)
  const rollbackPoints = (checkpoint as any)?.rollback_points || {}
  
  if (!rollbackPoints[stage]) return null
  
  // Restore checkpoint to that stage
  saveCheckpoint(taskId, {
    stage,
    progress: CHECKPOINT_STAGES.find(s => s.name === stage)?.estimated_progress || 0,
    data: rollbackPoints[stage].data,
    message: `Rolled back to stage: ${stage}`
  })
  
  return rollbackPoints[stage].data
}
```

### Part 2: Enhanced Recovery System with Strategies

**Modify:** `src/lib/task-dispatch.ts` (ADD TO BOTTOM, after existing functions)

```typescript
// ===== RECOVERY STRATEGY TYPES =====
export type RecoveryStrategy = 'retry' | 'rollback' | 'escalate' | 'manual' | 'skip'
export type FailureType = 'timeout' | 'rate_limit' | 'authentication' | 'network' | 'resource' | 'logic' | 'dependency' | 'unknown'

export interface RecoveryContext {
  taskId: number
  error: Error
  failureType: FailureType
  attempt: number
  maxRetries: number
  checkpoint: Checkpoint | null
  recoveryLogs: any[]
  strategy: RecoveryStrategy
}

export const RECOVERY_STRATEGIES: Record<FailureType, { strategies: RecoveryStrategy[]; backoffMs: number }> = {
  timeout: { 
    strategies: ['retry', 'rollback', 'escalate'], 
    backoffMs: 5000 
  },
  rate_limit: { 
    strategies: ['retry', 'escalate'], 
    backoffMs: 60000  // 1 minute for rate limits
  },
  authentication: { 
    strategies: ['escalate', 'manual'], 
    backoffMs: 0 
  },
  network: { 
    strategies: ['retry', 'retry', 'rollback', 'escalate'], 
    backoffMs: 10000 
  },
  resource: { 
    strategies: ['retry', 'rollback', 'escalate'], 
    backoffMs: 30000 
  },
  logic: { 
    strategies: ['rollback', 'manual', 'escalate'], 
    backoffMs: 0 
  },
  dependency: { 
    strategies: ['rollback', 'skip', 'escalate'], 
    backoffMs: 5000 
  },
  unknown: { 
    strategies: ['retry', 'escalate'], 
    backoffMs: 5000 
  }
}

export function classifyError(error: Error): FailureType {
  const message = error.message.toLowerCase()
  
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout'
  if (message.includes('rate limit') || message.includes('429') || message.includes('too many')) return 'rate_limit'
  if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) return 'authentication'
  if (message.includes('network') || message.includes('connection') || message.includes('econnrefused') || message.includes('enotfound')) return 'network'
  if (message.includes('memory') || message.includes('oom') || message.includes('heap') || message.includes('resource')) return 'resource'
  if (message.includes('dependency') || message.includes('prerequisite') || message.includes('required')) return 'dependency'
  if (message.includes('logic') || message.includes('invalid') || message.includes('assertion')) return 'logic'
  
  return 'unknown'
}

export function selectRecoveryStrategy(
  failureType: FailureType, 
  attempt: number,
  hasCheckpoint: boolean
): RecoveryStrategy {
  const config = RECOVERY_STRATEGIES[failureType]
  const strategyIndex = Math.min(attempt, config.strategies.length - 1)
  let strategy = config.strategies[strategyIndex]
  
  // Prefer rollback if checkpoint exists and strategy allows
  if (hasCheckpoint && config.strategies.includes('rollback') && attempt > 1) {
    strategy = 'rollback'
  }
  
  return strategy
}

export async function requeueWithRecovery(
  taskId: number, 
  error: Error,
  workspaceId: number
): Promise<{ ok: boolean; action: RecoveryStrategy; strategy: RecoveryStrategy }> {
  const db = getDatabase()
  
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
    .get(taskId, workspaceId) as Task | undefined
  
  if (!task) {
    throw new Error('Task not found')
  }

  const checkpoint = resumeFromCheckpoint(taskId)
  const failureType = classifyError(error)
  const attempt = (task.retry_count || 0) + 1
  const maxRetries = task.max_retries || 3
  const strategy = selectRecoveryStrategy(failureType, attempt, !!checkpoint)
  
  const recoveryLog = {
    timestamp: Date.now(),
    error: error.message,
    failure_type: failureType,
    strategy,
    attempt,
    checkpoint_stage: checkpoint?.stage || null
  }
  
  const existingLogs = JSON.parse(task.recovery_logs || '[]')
  existingLogs.push(recoveryLog)
  
  // Execute recovery strategy
  switch (strategy) {
    case 'retry':
      return executeRetryStrategy(taskId, task, error, failureType, existingLogs, attempt, maxRetries, workspaceId)
    
    case 'rollback':
      return executeRollbackStrategy(taskId, task, error, failureType, existingLogs, checkpoint, workspaceId)
    
    case 'escalate':
      return executeEscalateStrategy(taskId, task, error, failureType, existingLogs, workspaceId)
    
    case 'manual':
      return executeManualStrategy(taskId, task, error, failureType, existingLogs, workspaceId)
    
    case 'skip':
      return executeSkipStrategy(taskId, task, error, failureType, existingLogs, workspaceId)
    
    default:
      return executeEscalateStrategy(taskId, task, error, failureType, existingLogs, workspaceId)
  }
}

async function executeRetryStrategy(
  taskId: number,
  task: Task,
  error: Error,
  failureType: FailureType,
  logs: any[],
  attempt: number,
  maxRetries: number,
  workspaceId: number
): Promise<{ ok: boolean; action: RecoveryStrategy; strategy: RecoveryStrategy }> {
  const db = getDatabase()
  const backoffMs = RECOVERY_STRATEGIES[failureType].backoffMs
  
  // Apply exponential backoff
  const delayMs = backoffMs * Math.pow(2, attempt - 1)
  
  db.prepare(`
    UPDATE tasks 
    SET status = 'assigned', 
        retry_count = ?,
        recovery_logs = ?,
        recovery_strategy = 'retry',
        failure_type = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    attempt,
    JSON.stringify(logs),
    failureType,
    Math.floor(Date.now() / 1000),
    taskId
  )
  
  // Schedule delayed retry if backoff > 0
  if (delayMs > 0) {
    setTimeout(async () => {
      const { dispatchSingleTask } = await import('./task-dispatch')
      dispatchSingleTask(task).catch(err => 
        logger.error({ taskId, error: err }, 'Delayed retry failed')
      )
    }, delayMs)
  }
  
  eventBus.broadcast('task.recovering', { 
    task_id: taskId, 
    strategy: 'retry',
    attempt,
    max_retries: maxRetries,
    delay_ms: delayMs,
    error: error.message
  })
  
  logger.info({ taskId, attempt, delayMs, error: error.message }, 'Task queued for retry with backoff')
  
  return { ok: true, action: 'retry', strategy: 'retry' }
}

async function executeRollbackStrategy(
  taskId: number,
  task: Task,
  error: Error,
  failureType: FailureType,
  logs: any[],
  checkpoint: Checkpoint | null,
  workspaceId: number
): Promise<{ ok: boolean; action: RecoveryStrategy; strategy: RecoveryStrategy }> {
  const db = getDatabase()
  
  if (!checkpoint) {
    // No checkpoint, fall back to escalate
    return executeEscalateStrategy(taskId, task, error, failureType, logs, workspaceId)
  }
  
  // Find safe rollback point
  const rollbackStage = findSafeRollbackStage(checkpoint)
  const rollbackData = rollbackToStage(taskId, rollbackStage)
  
  db.prepare(`
    UPDATE tasks 
    SET status = 'assigned', 
        retry_count = retry_count + 1,
        recovery_logs = ?,
        recovery_strategy = 'rollback',
        failure_type = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(logs),
    failureType,
    Math.floor(Date.now() / 1000),
    taskId
  )
  
  eventBus.broadcast('task.recovering', { 
    task_id: taskId, 
    strategy: 'rollback',
    rollback_stage: rollbackStage,
    checkpoint_stage: checkpoint.stage,
    error: error.message
  })
  
  logger.info({ taskId, rollbackStage, originalStage: checkpoint.stage }, 'Task rolled back to previous checkpoint')
  
  return { ok: true, action: 'rollback', strategy: 'rollback' }
}

async function executeEscalateStrategy(
  taskId: number,
  task: Task,
  error: Error,
  failureType: FailureType,
  logs: any[],
  workspaceId: number
): Promise<{ ok: boolean; action: RecoveryStrategy; strategy: RecoveryStrategy }> {
  const db = getDatabase()
  
  db.prepare(`
    UPDATE tasks 
    SET status = 'failed',
        recovery_logs = ?,
        recovery_strategy = 'escalate',
        failure_type = ?,
        error_message = ?,
        outcome = 'failed',
        updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(logs),
    failureType,
    error.message,
    Math.floor(Date.now() / 1000),
    taskId
  )
  
  eventBus.broadcast('task.escalated', { 
    task_id: taskId, 
    reason: 'recovery_exhausted',
    failure_type: failureType,
    error: error.message,
    retry_count: task.retry_count,
    recovery_logs: logs
  })
  
  logger.error({ taskId, failureType, error: error.message, logs }, 'Task escalated after recovery exhausted')
  
  return { ok: true, action: 'escalate', strategy: 'escalate' }
}

async function executeManualStrategy(
  taskId: number,
  task: Task,
  error: Error,
  failureType: FailureType,
  logs: any[],
  workspaceId: number
): Promise<{ ok: boolean; action: RecoveryStrategy; strategy: RecoveryStrategy }> {
  const db = getDatabase()
  
  // Create a special "needs_manual_intervention" status or use blocked
  db.prepare(`
    UPDATE tasks 
    SET status = 'blocked',
        recovery_logs = ?,
        recovery_strategy = 'manual',
        failure_type = ?,
        error_message = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(logs),
    failureType,
    `MANUAL INTERVENTION REQUIRED: ${error.message}`,
    Math.floor(Date.now() / 1000),
    taskId
  )
  
  // Add a comment for human attention
  db.prepare(`
    INSERT INTO task_comments (task_id, author, content, created_at)
    VALUES (?, 'system', ?, ?)
  `).run(taskId, `⚠️ Manual intervention required. Error: ${error.message}. Recovery strategy: manual.`, Math.floor(Date.now() / 1000))
  
  eventBus.broadcast('task.manual_intervention', { 
    task_id: taskId, 
    failure_type: failureType,
    error: error.message,
    checkpoint: resumeFromCheckpoint(taskId)
  })
  
  logger.warn({ taskId, failureType, error: error.message }, 'Task flagged for manual intervention')
  
  return { ok: true, action: 'manual', strategy: 'manual' }
}

async function executeSkipStrategy(
  taskId: number,
  task: Task,
  error: Error,
  failureType: FailureType,
  logs: any[],
  workspaceId: number
): Promise<{ ok: boolean; action: RecoveryStrategy; strategy: RecoveryStrategy }> {
  const db = getDatabase()
  
  // Mark as skipped with resolution
  db.prepare(`
    UPDATE tasks 
    SET status = 'done',
        resolution = ?,
        recovery_logs = ?,
        recovery_strategy = 'skip',
        failure_type = ?,
        outcome = 'skipped',
        updated_at = ?
    WHERE id = ?
  `).run(
    `Skipped due to: ${error.message}`,
    JSON.stringify(logs),
    failureType,
    Math.floor(Date.now() / 1000),
    taskId
  )
  
  eventBus.broadcast('task.skipped', { 
    task_id: taskId, 
    reason: 'dependency_failure',
    error: error.message
  })
  
  logger.info({ taskId, failureType, error: error.message }, 'Task skipped due to dependency issue')
  
  return { ok: true, action: 'skip', strategy: 'skip' }
}

function findSafeRollbackStage(checkpoint: Checkpoint): string {
  const history = (checkpoint as any).history || []
  if (history.length < 2) return checkpoint.stage
  
  // Roll back to the stage before the current one
  return history[history.length - 2].stage || checkpoint.stage
}

export async function enhancedRequeueStaleTasks(): Promise<{ ok: boolean; requeued: number; strategies: Record<string, number> }> {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  const timeoutMinutes = 10
  const threshold = now - (timeoutMinutes * 60)
  
  const staleTasks = db.prepare(`
    SELECT t.*, a.status as agent_status
    FROM tasks t
    LEFT JOIN agents a ON a.name = t.assigned_to
    WHERE t.status = 'in_progress'
      AND t.updated_at < ?
      AND (a.status = 'offline' OR a.status IS NULL)
  `).all(threshold) as Task[]
  
  let requeued = 0
  const strategies: Record<string, number> = {}
  
  for (const task of staleTasks) {
    try {
      const result = await requeueWithRecovery(
        task.id,
        new Error(`Agent offline or unresponsive for ${timeoutMinutes} minutes`),
        task.workspace_id || 1
      )
      requeued++
      strategies[result.strategy] = (strategies[result.strategy] || 0) + 1
    } catch (error) {
      logger.error({ taskId: task.id, error }, 'Failed to requeue stale task')
    }
  }
  
  return { ok: true, requeued, strategies }
}

// ===== RECOVERY ORCHESTRATION =====

export async function orchestrateRecovery(taskId: number, workspaceId: number): Promise<{
  ok: boolean
  strategy: RecoveryStrategy
  message: string
}> {
  const db = getDatabase()
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?')
    .get(taskId, workspaceId) as Task | undefined
  
  if (!task) {
    return { ok: false, strategy: 'escalate', message: 'Task not found' }
  }
  
  const checkpoint = resumeFromCheckpoint(taskId)
  const logs = JSON.parse(task.recovery_logs || '[]')
  const lastLog = logs[logs.length - 1]
  
  // If manually resolved, clear recovery state
  if (task.status === 'done' || task.status === 'cancelled') {
    clearCheckpoint(taskId)
    return { ok: true, strategy: 'skip', message: 'Task already resolved' }
  }
  
  // Attempt recovery with intelligent strategy selection
  const error = new Error(lastLog?.error || 'Unknown error during execution')
  const result = await requeueWithRecovery(taskId, error, workspaceId)
  
  return {
    ok: result.ok,
    strategy: result.strategy,
    message: `Recovery ${result.strategy} initiated for task ${taskId}`
  }
}
```

### Part 3: Enhanced Checkpoint Integration in Dispatch

**Add to dispatchSingleTask** (modify Session 3's function):

```typescript
import { 
  saveCheckpoint, 
  resumeFromCheckpoint, 
  buildResumePrompt,
  saveRollbackPoint,
  CHECKPOINT_STAGES 
} from './checkpoint-manager'
import { broadcastProgress } from './task-dispatch'

async function dispatchSingleTask(task: Task): Promise<{ ok: boolean; taskId: number }> {
  const db = getDatabase()
  
  // ===== CHECKPOINT RECOVERY =====
  const checkpoint = resumeFromCheckpoint(task.id)
  let prompt = buildTaskPrompt(task)
  
  if (checkpoint && validateCheckpointIntegrity(checkpoint)) {
    prompt += buildResumePrompt(checkpoint)
    
    logger.info({ 
      taskId: task.id, 
      checkpointStage: checkpoint.stage, 
      progress: checkpoint.progress 
    }, 'Resuming from checkpoint')
    
    eventBus.broadcast('task.checkpoint_resumed', {
      task_id: task.id,
      stage: checkpoint.stage,
      progress: checkpoint.progress
    })
  }
  
  // Update status to in_progress
  db.prepare(`UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ?`)
    .run(Math.floor(Date.now() / 1000), task.id)
  
  eventBus.broadcast('task.status_changed', {
    id: task.id,
    status: 'in_progress',
    previous_status: 'assigned'
  })

  try {
    // ===== STAGE 1: INITIALIZATION =====
    saveCheckpoint(task.id, {
      stage: 'initialization',
      progress: 5,
      message: 'Starting task execution',
      stage_version: 1
    })
    broadcastProgress(task.id, 5, 'Initializing task execution')
    
    // ===== STAGE 2: PLANNING =====
    saveCheckpoint(task.id, {
      stage: 'planning',
      progress: 15,
      message: 'Analyzing requirements and creating plan',
      stage_version: 1
    })
    saveRollbackPoint(task.id, 'planning', { planStarted: true })
    broadcastProgress(task.id, 15, 'Planning approach')
    
    // ===== EXECUTE WITH CLAUDE =====
    const result = await callClaudeDirectly({
      task,
      prompt,
      modelOverride: classifyTaskModel(task),
      onProgress: (progress: number, message: string) => {
        // Real-time progress updates
        const mappedProgress = 15 + Math.floor(progress * 0.75) // Map 0-100 to 15-90
        broadcastProgress(task.id, mappedProgress, message)
      }
    })

    // ===== STAGE 7: REVIEW =====
    saveCheckpoint(task.id, {
      stage: 'review',
      progress: 90,
      message: 'Reviewing generated output',
      stage_version: 1,
      artifacts_generated: extractArtifactsFromResponse(task.id, result.text)
    })
    broadcastProgress(task.id, 90, 'Reviewing output')
    
    // ===== STAGE 8: COMPLETION =====
    db.prepare(`
      UPDATE tasks 
      SET status = 'review',
          resolution = ?,
          outcome = 'success',
          updated_at = ?
      WHERE id = ?
    `).run(result.text, Math.floor(Date.now() / 1000), task.id)

    saveCheckpoint(task.id, {
      stage: 'completion',
      progress: 100,
      message: 'Task completed successfully',
      stage_version: 1
    })
    broadcastProgress(task.id, 100, 'Task completed')

    eventBus.broadcast('task.status_changed', {
      id: task.id,
      status: 'review',
      previous_status: 'in_progress'
    })

    return { ok: true, taskId: task.id }
    
  } catch (error: any) {
    // ===== ERROR HANDLING WITH RECOVERY =====
    const failureType = classifyError(error)
    
    // Save error state as checkpoint for potential recovery
    saveCheckpoint(task.id, {
      stage: 'error',
      progress: checkpoint?.progress || 50,
      message: `Error: ${error.message}`,
      data: {
        error: error.message,
        failureType,
        stack: error.stack
      }
    })
    
    // Trigger intelligent recovery
    const recoveryResult = await requeueWithRecovery(
      task.id,
      error,
      task.workspace_id || 1
    )
    
    logger.info({ 
      taskId: task.id, 
      strategy: recoveryResult.strategy, 
      error: error.message 
    }, 'Recovery strategy executed')

    return { ok: false, taskId: task.id }
  }
}

// ===== PROGRESS BROADCAST HELPER =====
export function broadcastProgress(taskId: number, progress: number, message: string): void {
  eventBus.broadcast('task.progress', {
    task_id: taskId,
    progress,
    message,
    timestamp: Date.now()
  })
}
```

### Part 4: Recovery Dashboard API

**Create:** `src/app/api/tasks/[id]/recovery/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { 
  resumeFromCheckpoint, 
  getCheckpointHistory,
  orchestrateRecovery 
} from '@/lib/checkpoint-manager'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const taskId = parseInt(params.id, 10)
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
  }

  const db = getDatabase()
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any
  
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const checkpoint = resumeFromCheckpoint(taskId)
  const history = getCheckpointHistory(taskId)
  const recoveryLogs = JSON.parse(task.recovery_logs || '[]')

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      retry_count: task.retry_count,
      max_retries: task.max_retries,
      failure_type: task.failure_type,
      recovery_strategy: task.recovery_strategy
    },
    checkpoint,
    checkpoint_history: history,
    recovery_logs,
    available_strategies: ['retry', 'rollback', 'manual', 'skip']
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const taskId = parseInt(params.id, 10)
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
  }

  const body = await request.json()
  const { strategy } = body

  // Manual recovery trigger
  const result = await orchestrateRecovery(taskId, auth.user.workspace_id)

  return NextResponse.json(result)
}
```

### Part 5: Update Scheduler with Recovery Job

**Modify:** `src/lib/scheduler.ts` (add around line 400)

```typescript
// Recovery orchestration job - runs every 5 minutes
tasks.set('recovery_orchestration', {
  name: 'Recovery Orchestration',
  intervalMs: 5 * 60 * 1000,
  handler: async () => {
    const db = getDatabase()
    
    // Find tasks stuck in error state
    const stuckTasks = db.prepare(`
      SELECT id, workspace_id 
      FROM tasks 
      WHERE status = 'failed' 
        AND recovery_strategy IS NOT NULL
        AND updated_at < ?
    `).all(Math.floor(Date.now() / 1000) - 300) as Task[]
    
    let recovered = 0
    for (const task of stuckTasks) {
      try {
        const result = await orchestrateRecovery(task.id, task.workspace_id)
        if (result.ok && result.strategy !== 'escalate') {
          recovered++
        }
      } catch (error) {
        logger.error({ taskId: task.id, error }, 'Recovery orchestration failed')
      }
    }
    
    return { 
      ok: true, 
      checked: stuckTasks.length, 
      recovered,
      message: `Checked ${stuckTasks.length} tasks, recovered ${recovered}` 
    }
  }
})
```

### Deliverables
- [ ] `checkpoint-manager.ts` created with enhanced stage tracking
- [ ] `requeueWithRecovery()` with 5 recovery strategies (retry, rollback, escalate, manual, skip)
- [ ] `orchestrateRecovery()` for intelligent recovery coordination
- [ ] Recovery Dashboard API (`/api/tasks/[id]/recovery`)
- [ ] Scheduler updated with `recovery_orchestration` job
- [ ] Checkpoint integration with progress broadcasting
- [ ] Rollback point system for safe state restoration
- [ ] Exponential backoff for retry strategies
- [ ] Manual intervention workflow with task comments

### Verification

```bash
# 1. Test checkpoint saving
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"title":"Test checkpoint","status":"assigned"}'

# Check checkpoint_data in database
sqlite3 .data/mission-control.db "SELECT checkpoint_data FROM tasks WHERE title='Test checkpoint'"

# 2. Test recovery strategies
# Simulate a failure
curl -X PUT http://localhost:3000/api/tasks/123 \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"status":"failed","error_message":"Test timeout error"}'

# Trigger recovery
curl -X POST http://localhost:3000/api/tasks/123/recovery \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"strategy":"retry"}'

# 3. Check recovery logs
curl http://localhost:3000/api/tasks/123/recovery \
  -H "Authorization: Bearer $API_KEY"

# 4. Test stale task recovery
# Manually age a task
sqlite3 .data/mission-control.db "UPDATE tasks SET updated_at = $(date -d '15 minutes ago' +%s) WHERE id = 123"

# Run scheduler (should trigger recovery)
# Check logs for "Recovery strategy executed"

# 5. Test rollback
# Create task with multiple checkpoints
# Force failure and verify rollback to previous stage
```

### Recovery Strategy Decision Matrix

| Failure Type | Attempt 1 | Attempt 2 | Attempt 3 | Attempt 4+ |
|-------------|-----------|-----------|-----------|------------|
| timeout | retry (5s) | retry (10s) | rollback | escalate |
| rate_limit | retry (60s) | retry (120s) | escalate | escalate |
| authentication | escalate | escalate | escalate | escalate |
| network | retry (10s) | retry (20s) | rollback | escalate |
| resource | retry (30s) | rollback | escalate | escalate |
| logic | rollback | manual | escalate | escalate |
| dependency | rollback | skip | escalate | escalate |
| unknown | retry (5s) | escalate | escalate | escalate |

### Checkpoint Stage Flow

```
initialization (5%) → planning (15%) → analysis (25%) → design (35%)
                                                    ↓
completion (100%) ← review (90%) ← testing (75%) ← implementation (60%)
```

Each stage:
- Saves progress checkpoint
- Creates rollback point (optional)
- Broadcasts progress event
- Validates dependencies

---

## 📋 SESSION 5: ARTIFACTS + REALTIME (Phase 10+11)

### Your Mission
Implement artifact storage and extend realtime events

### Exclusive File Access
✅ `src/lib/artifact-manager.ts` (NEW)
✅ `src/lib/event-bus.ts` (minor additions)
✅ `src/lib/use-server-events.ts` (minor additions)

### Part 1: Artifact Manager

**Create:** `src/lib/artifact-manager.ts`

```typescript
import { getDatabase } from './db'
import { eventBus } from './event-bus'

export interface Artifact {
  type: 'prd' | 'architecture' | 'code' | 'test' | 'doc' | 'log' | 'schema' | 'config'
  title: string
  content: string
  created_at: number
  metadata?: {
    language?: string
    file_path?: string
    size_bytes?: number
    [key: string]: any
  }
}

export function addArtifact(taskId: number, artifact: Omit<Artifact, 'created_at'>): void {
  const db = getDatabase()
  
  const task = db.prepare('SELECT artifacts FROM tasks WHERE id = ?').get(taskId) as any
  const artifacts: Artifact[] = JSON.parse(task?.artifacts || '[]')
  
  const newArtifact: Artifact = {
    ...artifact,
    created_at: Date.now()
  }
  
  artifacts.push(newArtifact)
  
  db.prepare('UPDATE tasks SET artifacts = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(artifacts), Math.floor(Date.now() / 1000), taskId)
  
  eventBus.broadcast('task.artifact_created', { 
    task_id: taskId, 
    type: artifact.type,
    title: artifact.title
  })
}

export function getArtifacts(taskId: number, type?: Artifact['type']): Artifact[] {
  const db = getDatabase()
  const task = db.prepare('SELECT artifacts FROM tasks WHERE id = ?').get(taskId) as any
  
  if (!task?.artifacts) return []
  
  const artifacts: Artifact[] = JSON.parse(task.artifacts)
  
  return type ? artifacts.filter(a => a.type === type) : artifacts
}

export function getLatestArtifact(taskId: number, type: Artifact['type']): Artifact | null {
  const artifacts = getArtifacts(taskId, type)
  return artifacts[artifacts.length - 1] || null
}

export function deleteArtifact(taskId: number, index: number): void {
  const db = getDatabase()
  const task = db.prepare('SELECT artifacts FROM tasks WHERE id = ?').get(taskId) as any
  
  if (!task?.artifacts) return
  
  const artifacts: Artifact[] = JSON.parse(task.artifacts)
  artifacts.splice(index, 1)
  
  db.prepare('UPDATE tasks SET artifacts = ? WHERE id = ?')
    .run(JSON.stringify(artifacts), taskId)
}

export function extractArtifactsFromResponse(taskId: number, response: string): void {
  const codeBlocks = response.match(/```(\w+)?\n([\s\S]*?)```/g) || []
  
  codeBlocks.forEach((block, idx) => {
    const langMatch = block.match(/```(\w+)?/)
    const lang = langMatch?.[1] || 'text'
    const code = block.replace(/```\w*\n/, '').replace(/```$/, '').trim()
    
    if (code.length > 100) {
      addArtifact(taskId, {
        type: lang === 'markdown' ? 'doc' : 'code',
        title: `Generated ${lang} code ${idx + 1}`,
        content: code,
        metadata: { language: lang, size_bytes: code.length }
      })
    }
  })
}
```

### Part 2: Extend Event Bus

**Modify:** `src/lib/event-bus.ts` (update EventType union around line 15)

```typescript
export type EventType =
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'task.subtasks_generated'
  | 'task.checkpoint_saved'
  | 'task.recovering'
  | 'task.escalated'
  | 'task.artifact_created'
  | 'task.progress'
  | 'task.parallel_group_completed'
  | 'chat.message'
  | 'chat.message.deleted'
  | 'notification.created'
  | 'notification.read'
  | 'activity.created'
  | 'agent.updated'
  | 'agent.created'
  | 'agent.deleted'
  | 'agent.synced'
  | 'agent.status_changed'
  | 'audit.security'
  | 'security.event'
  | 'connection.created'
  | 'connection.disconnected'
  | 'github.synced'
  | 'run.created'
  | 'run.updated'
  | 'run.completed'
  | 'run.eval_attached'
  | 'session.updated'
```

### Part 3: Extend Client Event Handling

**Modify:** `src/lib/use-server-events.ts` (add cases to dispatch function around line 60)

```typescript
case 'task.subtasks_generated':
  // Refresh task list
  if (get().activeProject?.id === data.project_id) {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(tasksData => set({ tasks: tasksData.tasks || [] }))
      .catch(() => {})
  }
  break

case 'task.checkpoint_saved':
  // Update task in place
  updateTask(data.task_id, { 
    checkpoint_data: JSON.stringify({ 
      stage: data.stage, 
      progress: data.progress 
    })
  })
  break

case 'task.recovering':
  // Show notification
  addNotification({
    type: 'warning',
    title: 'Task Recovering',
    message: `Task #${data.task_id} retry attempt ${data.attempt}/${data.max_retries}`
  })
  break

case 'task.artifact_created':
  // Refresh task details if open
  if (get().selectedTask?.id === data.task_id) {
    fetch(`/api/tasks/${data.task_id}`)
      .then(r => r.json())
      .then(taskData => setSelectedTask(taskData))
      .catch(() => {})
  }
  break

case 'task.progress':
  // Update progress (if you add progress UI)
  updateTask(data.task_id, { 
    metadata: { 
      ...get().selectedTask?.metadata,
      progress: data.progress 
    }
  })
  break
```

### Part 4: Add Progress Broadcast Helper

**Add to `src/lib/task-dispatch.ts`**:

```typescript
export function broadcastProgress(taskId: number, progress: number, message: string): void {
  eventBus.broadcast('task.progress', {
    task_id: taskId,
    progress,
    message,
    timestamp: Date.now()
  })
}
```

### Deliverables
- [ ] `artifact-manager.ts` created
- [ ] Event bus extended with 5 new event types
- [ ] Client event handlers added
- [ ] Progress broadcast helper added

### Verification
```typescript
// Test artifact creation
import { addArtifact } from '@/lib/artifact-manager'

addArtifact(taskId, {
  type: 'code',
  title: 'REST API',
  content: 'export function handler() { ... }'
})

// Check event in browser console
// Refresh task details, should see artifact
```

---

## 🎯 PHASE 12: FINAL INTEGRATION & DEMO

### Run AFTER All Sessions Complete

#### 1. Test Migration
```bash
pnpm dev
# Check console for: "Migration 050_autonomous_task_factory applied"
```

#### 2. Create Autonomous Mission
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build car rental system",
    "description": "Create a full-stack car rental platform with:\n- Vehicle inventory management\n- Booking system\n- Payment processing\n- Customer portal\n- Admin dashboard",
    "task_type": "mission",
    "execution_mode": "autonomous",
    "status": "inbox",
    "priority": "high"
  }'
```

#### 3. Expected Behavior
1. ✅ Root task created with `task_type='mission'`
2. ✅ Auto-generates 6-10 subtasks (Phase 5)
3. ✅ Subtasks assigned roles: planner, architect, backend, frontend, qa, devops
4. ✅ Parallel groups created: phase-1, phase-2, phase-3
5. ✅ Agents dispatched in parallel (Phase 6)
6. ✅ Artifacts created: PRD, architecture, code, tests (Phase 10)
7. ✅ Checkpoints saved during execution (Phase 8)
8. ✅ Realtime updates in UI (Phase 11)
9. ✅ Self-healing on failures (Phase 9)
10. ✅ Quality review by Aegis (existing)

#### 4. UI Verification
- [ ] Open root task → see "Subtasks" tab
- [ ] Subtasks display in tree view
- [ ] Click subtask → see "Artifacts" tab with generated files
- [ ] "Discussion" tab shows decisions
- [ ] "Logs" tab shows execution history
- [ ] "Recovery" tab shows retry attempts (if any)

#### 5. Stress Test
```bash
# Create 3 parallel missions
for i in {1..3}; do
  curl -X POST http://localhost:3000/api/tasks \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"title\":\"Mission $i\",\"task_type\":\"mission\",\"execution_mode\":\"autonomous\"}"
done

# Verify all generate subtasks and dispatch in parallel
```

---

## 🚨 COORDINATION RULES

### Session 3 & 4 Conflict Resolution
**Shared File:** `src/lib/task-dispatch.ts`

**Option A:** Sequential
1. Session 3 completes first (30 min)
2. Session 4 starts after Session 3 commits

**Option B:** Parallel with boundaries
1. Session 3: Add functions at lines 50-150 (TOP)
2. Session 4: Add functions at end of file (BOTTOM 600+)
3. No overlapping edits

**Recommended:** Option A (safer)

---

## 📊 PROGRESS TRACKING

Each session updates this checklist:

### Session 1 (UI)
- [ ] TaskDetailModal tabs added
- [ ] 6 helper components created
- [ ] UI verified in browser

### Session 2 (Generator)
- [ ] `auto-task-generator.ts` created
- [ ] API route added
- [ ] Auto-trigger tested

### Session 3 (Dispatch)
- [ ] `agent-role-matcher.ts` created
- [ ] Parallel dispatch added
- [ ] Scheduler updated

### Session 4 (Recovery)
- [ ] `checkpoint-manager.ts` created with stages
- [ ] 5 recovery strategies implemented
- [ ] Recovery orchestration added
- [ ] Recovery Dashboard API created
- [ ] Scheduler recovery job added
- [ ] Checkpoint integration tested
- [ ] Rollback system verified
- [ ] Manual intervention workflow tested

### Session 5 (Artifacts)
- [x] `artifact-manager.ts` created
- [x] Event bus extended (6 new event types added)
- [x] Client handlers added (7 new handlers in use-server-events.ts)
- [x] broadcastProgress helper added to task-dispatch.ts

### Final Integration
- [ ] All sessions complete
- [ ] Migration applied
- [ ] Demo scenario passed

---

## 🎯 SUCCESS CRITERIA

**Phase 4:** 6 new tabs functional in TaskDetailModal
**Phase 5:** Mission task auto-generates subtasks
**Phase 6:** Parallel groups dispatch simultaneously
**Phase 7:** Agents matched to roles correctly
**Phase 8:** Checkpoints save/restore with 8-stage tracking, rollback points, and history
**Phase 9:** Failed tasks auto-retry with 5 strategies, exponential backoff, and manual intervention
**Phase 10:** Artifacts stored and displayed
**Phase 11:** Realtime events broadcast
**Phase 12:** Car rental demo completes end-to-end

---

## 📝 NOTES

- All new columns are nullable (backward compatible)
- JSON fields use string storage (parse/stringify)
- Events broadcast via existing SSE infrastructure
- No database schema changes needed beyond migration 050
- All code follows existing project patterns

---

**Estimated Total Time:** 3 hours (45 min × 5 sessions in parallel)
**Sequential Time:** 4+ hours
**Time Saved:** 25%+

Start sessions NOW. Meet back here for Phase 12 integration! 🚀
