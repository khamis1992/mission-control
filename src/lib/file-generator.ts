import { getDatabase } from './db'
import { createHash } from 'crypto'
import { addArtifact } from './artifact-manager'

export interface GeneratedFile {
  id: number
  task_id: number
  path: string
  content: string
  content_hash: string
  language: string
  version: number
  agent_role: string
  created_at: number
  workspace_id: number
}

export interface GeneratedFileInput {
  path: string
  content: string
  language: string
  agent_role: string
}

export interface FileVersion {
  version: number
  content: string
  created_at: number
  agent_role: string
  checksum: string
}

export async function writeFiles(taskId: number, files: GeneratedFileInput[]): Promise<void> {
  const db = getDatabase()
  const workspaceId = await getWorkspaceId(taskId)
  
  db.transaction(() => {
    for (const file of files) {
      const content = Buffer.from(file.content).toString('utf-8')
      
      db.prepare(`
        INSERT INTO generated_files (
          task_id, path, content, content_hash, language, version, agent_role, created_at, workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        file.path,
        content,
        hashContent(content),
        file.language,
        1,
        file.agent_role,
        Math.floor(Date.now() / 1000),
        workspaceId
      )
    }
  })()
}

export async function trackGeneratedFiles(taskId: number, files: GeneratedFileInput[]): Promise<number[]> {
  const db = getDatabase()
  const workspaceId = await getWorkspaceId(taskId)
  const ids: number[] = []
  
  for (const file of files) {
    const content = Buffer.from(file.content).toString('utf-8')
    const contentHash = hashContent(content)
    
    const result = db.prepare(`
      INSERT INTO generated_files (
        task_id, path, content, content_hash, language, version, agent_role, created_at, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      file.path,
      content,
      contentHash,
      file.language,
      1,
      file.agent_role,
      Math.floor(Date.now() / 1000),
      workspaceId
    )
    
    ids.push(result.lastInsertRowid as number)
    
    await addArtifact(taskId, {
      type: 'file',
      title: file.path,
      content: content,
      metadata: {
        path: file.path,
        language: file.language,
        agent_role: file.agent_role,
        content_hash: contentHash
      }
    })
  }
  
  return ids
}

export async function getFileHistory(taskId: number, path: string): Promise<FileVersion[]> {
  const db = getDatabase()
  
  const files = db.prepare(`
    SELECT version, content, created_at, agent_role, content_hash
    FROM generated_files
    WHERE task_id = ? AND path = ?
    ORDER BY version DESC
  `).all(taskId, path) as any[]
  
  return files.map(f => ({
    version: f.version,
    content: f.content,
    created_at: f.created_at,
    agent_role: f.agent_role,
    checksum: f.content_hash
  }))
}

export async function getLatestFile(taskId: number, path: string): Promise<GeneratedFile | null> {
  const db = getDatabase()
  
  return db.prepare(`
    SELECT *
    FROM generated_files
    WHERE task_id = ? AND path = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(taskId, path) as GeneratedFile | null
}

export async function listGeneratedFiles(taskId: number): Promise<GeneratedFile[]> {
  const db = getDatabase()
  
  return db.prepare(`
    SELECT DISTINCT ON (path) id, task_id, path, content, content_hash, language, version, agent_role, created_at, workspace_id
    FROM generated_files
    WHERE task_id = ?
    ORDER BY path, version DESC
  `).all(taskId) as GeneratedFile[]
}

export async function deleteFile(taskId: number, path: string): Promise<void> {
  const db = getDatabase()
  db.prepare(`DELETE FROM generated_files WHERE task_id = ? AND path = ?`).run(taskId, path)
}

async function getWorkspaceId(taskId: number): Promise<number> {
  const db = getDatabase()
  const task = db.prepare('SELECT workspace_id FROM tasks WHERE id = ?').get(taskId) as { workspace_id: number }
  return task?.workspace_id || 1
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}