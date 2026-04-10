import { getDatabase } from './db'
import { createHash } from 'crypto'

export interface StoredFile {
  id: number
  task_id: number
  path: string
  content: string
  content_hash: string
  version: number
  diff_from_previous?: string
  created_at: number
  agent_role: string
  workspace_id: number
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
}

export interface Diff {
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

export async function getFileVersions(taskId: number, path: string): Promise<StoredFile[]> {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, task_id, path, content, content_hash, version, diff_from_previous, created_at, agent_role, workspace_id
    FROM generated_files
    WHERE task_id = ? AND path = ?
    ORDER BY version DESC
  `).all(taskId, path) as StoredFile[]
}

export async function getLatestVersion(taskId: number, path: string): Promise<StoredFile | null> {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, task_id, path, content, content_hash, version, diff_from_previous, created_at, agent_role, workspace_id
    FROM generated_files
    WHERE task_id = ? AND path = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(taskId, path) as StoredFile | null
}

export async function diffVersions(v1: StoredFile, v2: StoredFile): Promise<Diff> {
  const lines1 = v1.content.split('\n')
  const lines2 = v2.content.split('\n')
  
  const hunks: DiffHunk[] = []
  let additions = 0
  let deletions = 0
  
  // Simple line-by-line diff
  const maxLen = Math.max(lines1.length, lines2.length)
  let currentHunk: DiffHunk | null = null
  
  for (let i = 0; i < maxLen; i++) {
    const line1 = lines1[i]
    const line2 = lines2[i]
    
    if (line1 === line2) {
      // Lines match - no diff
      if (currentHunk) {
        hunks.push(currentHunk)
        currentHunk = null
      }
    } else {
      // Lines differ
      if (!currentHunk) {
        currentHunk = {
          oldStart: i + 1,
          oldLines: 0,
          newStart: i + 1,
          newLines: 0,
          content: ''
        }
      }
      
      if (line1 !== undefined && line1 !== line2) {
        currentHunk.content += `-${line1}\n`
        currentHunk.oldLines++
        deletions++
      }
      if (line2 !== undefined && line2 !== line1) {
        currentHunk.content += `+${line2}\n`
        currentHunk.newLines++
        additions++
      }
    }
  }
  
  if (currentHunk) {
    hunks.push(currentHunk)
  }
  
  return { additions, deletions, hunks }
}

export async function rollbackFile(taskId: number, path: string, version: number): Promise<void> {
  const db = getDatabase()
  const targetVersion = await getFileVersions(taskId, path)
  const target = targetVersion.find(f => f.version === version)
  
  if (!target) {
    throw new Error(`Version ${version} not found for file ${path}`)
  }
  
  // Create new version with old content
  const newVersion = targetVersion[0].version + 1
  
  db.prepare(`
    INSERT INTO generated_files (
      task_id, path, content, content_hash, language, version, agent_role, created_at, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    path,
    target.content,
    target.content_hash,
    'typescript', // Assume same language
    newVersion,
    'rollback',
    Math.floor(Date.now() / 1000),
    target.workspace_id
  )
}

export async function storeFileVersion(
  taskId: number,
  path: string,
  content: string,
  agentRole: string,
  language: string = 'typescript'
): Promise<number> {
  const db = getDatabase()
  
  // Get latest version
  const latest = await getLatestVersion(taskId, path)
  const version = latest ? latest.version + 1 : 1
  const contentHash = createHash('sha256').update(content).digest('hex')
  
  // Get workspace_id
  const task = db.prepare('SELECT workspace_id FROM tasks WHERE id = ?').get(taskId) as { workspace_id: number }
  const workspaceId = task?.workspace_id || 1
  
  // Calculate diff from previous
  let diffFromPrevious: string | null = null
  if (latest && latest.content_hash !== contentHash) {
    const diff = await diffVersions(latest, { ...latest, content, content_hash: contentHash })
    diffFromPrevious = JSON.stringify(diff)
  }
  
  const result = db.prepare(`
    INSERT INTO generated_files (
      task_id, path, content, content_hash, language, version, agent_role, diff_from_previous, created_at, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    path,
    content,
    contentHash,
    language,
    version,
    agentRole,
    diffFromPrevious,
    Math.floor(Date.now() / 1000),
    workspaceId
  )
  
  return result.lastInsertRowid as number
}

export async function getAllFilesForTask(taskId: number): Promise<StoredFile[]> {
  const db = getDatabase()
  
  // Get latest version of each file
  return db.prepare(`
    SELECT gf.*
    FROM generated_files gf
    INNER JOIN (
      SELECT path, MAX(version) as max_version
      FROM generated_files
      WHERE task_id = ?
      GROUP BY path
    ) latest ON gf.path = latest.path AND gf.version = latest.max_version
    WHERE gf.task_id = ?
    ORDER BY gf.path
  `).all(taskId, taskId) as StoredFile[]
}