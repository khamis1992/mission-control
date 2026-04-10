export type BuildState = 
  | 'analyzing'
  | 'scaffolding'
  | 'executing'
  | 'github_pushing'
  | 'building'
  | 'deploying'
  | 'completed'
  | 'failed'

export type BuildEventType =
  | 'analysis_complete'
  | 'scaffold_created'
  | 'execution_complete'
  | 'files_pushed'
  | 'build_complete'
  | 'deployment_ready'
  | 'error'

export interface BuildEvent {
  type: BuildEventType
  data?: any
}

export interface StateHistory {
  state: BuildState
  timestamp: number
  event?: BuildEvent
}

export interface BuildStateMachine {
  taskId: number
  currentState: BuildState
  history: StateHistory[]
  transition(event: BuildEvent): Promise<void>
  onError(error: Error): Promise<void>
  saveCheckpoint(): Promise<void>
}

export function createBuildStateMachine(taskId: number): BuildStateMachine {
  const transitions: Record<BuildState, Partial<Record<BuildEventType, BuildState>>> = {
    analyzing: { analysis_complete: 'scaffolding', error: 'failed' },
    scaffolding: { scaffold_created: 'executing', error: 'failed' },
    executing: { execution_complete: 'github_pushing', error: 'failed' },
    github_pushing: { files_pushed: 'building', error: 'failed' },
    building: { build_complete: 'deploying', error: 'failed' },
    deploying: { deployment_ready: 'completed', error: 'failed' },
    completed: {},
    failed: {}
  }
  
  const machine: BuildStateMachine = {
    taskId,
    currentState: 'analyzing',
    history: [{ state: 'analyzing', timestamp: Date.now() }],
    
    async transition(event: BuildEvent): Promise<void> {
      const next = transitions[this.currentState]?.[event.type] || this.currentState
      this.history.push({ 
        state: next, 
        timestamp: Date.now(), 
        event 
      })
      this.currentState = next
      await this.saveCheckpoint()
    },
    
    async onError(error: Error): Promise<void> {
      this.currentState = 'failed'
      this.history.push({ 
        state: 'failed', 
        timestamp: Date.now(),
        event: { type: 'error', data: { message: error.message } }
      })
      await this.saveCheckpoint()
    },
    
    async saveCheckpoint(): Promise<void> {
      const { getDatabase } = await import('./db')
      const db = getDatabase()
      
      db.prepare(`
        UPDATE tasks SET 
          checkpoint_data = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        JSON.stringify({
          state: this.currentState,
          history: this.history.slice(-10)
        }),
        Math.floor(Date.now() / 1000),
        this.taskId
      )
    }
  }
  
  return machine
}

export function loadBuildStateMachine(taskId: number, checkpointData: string | null): BuildStateMachine {
  const machine = createBuildStateMachine(taskId)
  
  if (checkpointData) {
    try {
      const parsed = JSON.parse(checkpointData)
      machine.currentState = parsed.state || 'analyzing'
      machine.history = parsed.history || [{ state: 'analyzing', timestamp: Date.now() }]
    } catch {
    }
  }
  
  return machine
}