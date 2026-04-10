import { getDatabase } from './db'
import { eventBus } from './event-bus'

/**
 * Artifact Manager - Phase 10 of Autonomous Software Factory
 * 
 * Stores and retrieves task artifacts (PRDs, architecture docs, code, tests, etc.)
 * Artifacts are JSON-serialized in the tasks.artifacts column.
 */

export interface Artifact {
  type: 'prd' | 'architecture' | 'code' | 'test' | 'doc' | 'log' | 'schema' | 'config' | 'file'
  title: string
  content: string
  created_at: number
  metadata?: {
    language?: string
    file_path?: string
    size_bytes?: number
    version?: number
    content_hash?: string
    agent_role?: string
    [key: string]: any
  }
}

/**
 * Add an artifact to a task.
 * Appends to the artifacts JSON array and broadcasts an event.
 */
export function addArtifact(taskId: number, artifact: Omit<Artifact, 'created_at'>): void {
  const db = getDatabase()
  
  const task = db.prepare('SELECT artifacts FROM tasks WHERE id = ?').get(taskId) as { artifacts: string | null } | undefined
  const artifacts: Artifact[] = task?.artifacts ? JSON.parse(task.artifacts) : []
  
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

/**
 * Get all artifacts for a task, optionally filtered by type.
 */
export function getArtifacts(taskId: number, type?: Artifact['type']): Artifact[] {
  const db = getDatabase()
  const task = db.prepare('SELECT artifacts FROM tasks WHERE id = ?').get(taskId) as { artifacts: string | null } | undefined
  
  if (!task?.artifacts) return []
  
  const artifacts: Artifact[] = JSON.parse(task.artifacts)
  
  return type ? artifacts.filter(a => a.type === type) : artifacts
}

/**
 * Get the most recent artifact of a specific type.
 */
export function getLatestArtifact(taskId: number, type: Artifact['type']): Artifact | null {
  const artifacts = getArtifacts(taskId, type)
  return artifacts[artifacts.length - 1] || null
}

/**
 * Delete an artifact by its index in the array.
 */
export function deleteArtifact(taskId: number, index: number): void {
  const db = getDatabase()
  const task = db.prepare('SELECT artifacts FROM tasks WHERE id = ?').get(taskId) as { artifacts: string | null } | undefined
  
  if (!task?.artifacts) return
  
  const artifacts: Artifact[] = JSON.parse(task.artifacts)
  artifacts.splice(index, 1)
  
  db.prepare('UPDATE tasks SET artifacts = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(artifacts), Math.floor(Date.now() / 1000), taskId)
}

/**
 * Extract code blocks from an agent response and store as artifacts.
 * Detects fenced code blocks (```language ... ```) and stores each as a separate artifact.
 */
export function extractArtifactsFromResponse(taskId: number, response: string): number {
  const codeBlocks = response.match(/```(\w+)?\n([\s\S]*?)```/g) || []
  let extracted = 0
  
  codeBlocks.forEach((block, idx) => {
    const langMatch = block.match(/```(\w+)?/)
    const lang = langMatch?.[1] || 'text'
    const code = block.replace(/```\w*\n/, '').replace(/```$/, '').trim()
    
    // Only store substantial code blocks (>100 chars)
    if (code.length > 100) {
      addArtifact(taskId, {
        type: lang === 'markdown' || lang === 'md' ? 'doc' : 'code',
        title: `Generated ${lang} code ${idx + 1}`,
        content: code,
        metadata: { language: lang, size_bytes: code.length }
      })
      extracted++
    }
  })
  
  return extracted
}

/**
 * Add a decision record to a task's decisions array.
 * Decisions are stored as structured records in the decisions JSON column.
 */
export interface Decision {
  type: 'planning' | 'architecture' | 'implementation' | 'review' | 'escalation'
  summary: string
  content?: string
  author?: string
  timestamp: number
}

export function addDecision(taskId: number, decision: Omit<Decision, 'timestamp'>): void {
  const db = getDatabase()
  
  const task = db.prepare('SELECT decisions FROM tasks WHERE id = ?').get(taskId) as { decisions: string | null } | undefined
  const decisions: Decision[] = task?.decisions ? JSON.parse(task.decisions) : []
  
  const newDecision: Decision = {
    ...decision,
    timestamp: Date.now()
  }
  
  decisions.push(newDecision)
  
  db.prepare('UPDATE tasks SET decisions = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(decisions), Math.floor(Date.now() / 1000), taskId)
}

/**
 * Get all decisions for a task.
 */
export function getDecisions(taskId: number): Decision[] {
  const db = getDatabase()
  const task = db.prepare('SELECT decisions FROM tasks WHERE id = ?').get(taskId) as { decisions: string | null } | undefined
  
  if (!task?.decisions) return []
  
  return JSON.parse(task.decisions)
}
