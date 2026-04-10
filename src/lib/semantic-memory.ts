import { getDatabase } from './db'
import { logger } from './logger'

export interface MemoryEntry {
  id: string
  type: 'pattern' | 'decision' | 'architecture' | 'preference' | 'lesson' | 'fact'
  content: string
  embedding?: number[]
  metadata: Record<string, unknown>
  source?: string
  taskId?: number
  confidence: number
  usageCount: number
  lastUsed: number
  createdAt: number
  updatedAt: number
}

export interface MemoryQuery {
  type?: MemoryEntry['type']
  source?: string
  taskId?: number
  minConfidence?: number
  limit?: number
}

export interface SimilarMemory {
  entry: MemoryEntry
  similarity: number
}

export class SemanticMemoryStore {
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return
    
    const db = getDatabase()
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_memory (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT NOT NULL DEFAULT '{}',
        source TEXT,
        task_id INTEGER,
        confidence REAL NOT NULL DEFAULT 0.5,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_semantic_memory_type ON semantic_memory(type)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_semantic_memory_source ON semantic_memory(source)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_semantic_memory_task_id ON semantic_memory(task_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_semantic_memory_last_used ON semantic_memory(last_used)`)
    
    this.initialized = true
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'usageCount' | 'lastUsed' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
    await this.initialize()
    
    const db = getDatabase()
    const id = entry.id || `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const now = Math.floor(Date.now() / 1000)
    
    db.prepare(`
      INSERT OR REPLACE INTO semantic_memory 
      (id, type, content, embedding, metadata, source, task_id, confidence, usage_count, last_used, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.type,
      entry.content,
      entry.embedding ? JSON.stringify(entry.embedding) : null,
      JSON.stringify(entry.metadata || {}),
      entry.source || null,
      entry.taskId || null,
      entry.confidence,
      0,
      now,
      now,
      now
    )
    
    return id
  }

  async query(filter: MemoryQuery): Promise<MemoryEntry[]> {
    await this.initialize()
    
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []
    
    if (filter.type) {
      conditions.push('type = ?')
      params.push(filter.type)
    }
    
    if (filter.source) {
      conditions.push('source = ?')
      params.push(filter.source)
    }
    
    if (filter.taskId) {
      conditions.push('task_id = ?')
      params.push(filter.taskId)
    }
    
    if (filter.minConfidence !== undefined) {
      conditions.push('confidence >= ?')
      params.push(filter.minConfidence)
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filter.limit || 100
    
    const rows = db.prepare(`
      SELECT * FROM semantic_memory ${whereClause}
      ORDER BY usage_count DESC, last_used DESC
      LIMIT ?
    `).all(...params, limit) as Array<{
      id: string
      type: string
      content: string
      embedding: string | null
      metadata: string
      source: string | null
      task_id: number | null
      confidence: number
      usage_count: number
      last_used: number
      created_at: number
      updated_at: number
    }>
    
    return rows.map(row => this.rowToEntry(row))
  }

  async findSimilar(embedding: number[], threshold = 0.7, limit = 10): Promise<SimilarMemory[]> {
    await this.initialize()
    
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT * FROM semantic_memory 
      WHERE embedding IS NOT NULL 
      ORDER BY last_used DESC
      LIMIT 100
    `).all() as Array<{
      id: string
      type: string
      content: string
      embedding: string | null
      metadata: string
      source: string | null
      task_id: number | null
      confidence: number
      usage_count: number
      last_used: number
      created_at: number
      updated_at: number
    }>
    
    const similarities: SimilarMemory[] = []
    
    for (const row of rows) {
      if (row.embedding) {
        const storedEmbedding = JSON.parse(row.embedding) as number[]
        const similarity = this.cosineSimilarity(embedding, storedEmbedding)
        if (similarity >= threshold) {
          similarities.push({
            entry: this.rowToEntry(row),
            similarity,
          })
        }
      }
    }
    
    return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
  }

  async incrementUsage(id: string): Promise<void> {
    await this.initialize()
    
    const db = getDatabase()
    db.prepare(`
      UPDATE semantic_memory 
      SET usage_count = usage_count + 1, last_used = ?
      WHERE id = ?
    `).run(Math.floor(Date.now() / 1000), id)
  }

  async delete(id: string): Promise<boolean> {
    await this.initialize()
    
    const db = getDatabase()
    const result = db.prepare('DELETE FROM semantic_memory WHERE id = ?').run(id)
    return result.changes > 0
  }

  async updateConfidence(id: string, confidence: number): Promise<void> {
    await this.initialize()
    
    const db = getDatabase()
    db.prepare(`
      UPDATE semantic_memory SET confidence = ?, updated_at = ? WHERE id = ?
    `).run(confidence, Math.floor(Date.now() / 1000), id)
  }

  async getStats(): Promise<{
    total: number
    byType: Record<string, number>
    avgConfidence: number
    totalUsage: number
  }> {
    await this.initialize()
    
    const db = getDatabase()
    
    const total = (db.prepare('SELECT COUNT(*) as count FROM semantic_memory').get() as { count: number }).count
    
    const byTypeRows = db.prepare(`
      SELECT type, COUNT(*) as count FROM semantic_memory GROUP BY type
    `).all() as Array<{ type: string; count: number }>
    
    const byType: Record<string, number> = {}
    for (const row of byTypeRows) {
      byType[row.type] = row.count
    }
    
    const avgRow = db.prepare('SELECT AVG(confidence) as avg FROM semantic_memory').get() as { avg: number }
    const totalUsageRow = db.prepare('SELECT SUM(usage_count) as total FROM semantic_memory').get() as { total: number }
    
    return {
      total,
      byType,
      avgConfidence: avgRow.avg || 0,
      totalUsage: totalUsageRow.total || 0,
    }
  }

  async cleanup(maxAge: number = 90 * 24 * 60 * 60 * 1000, maxUsage = 0): Promise<number> {
    await this.initialize()
    
    const db = getDatabase()
    const cutoff = Math.floor((Date.now() - maxAge) / 1000)
    
    const result = db.prepare(`
      DELETE FROM semantic_memory 
      WHERE (last_used < ? AND usage_count <= ?) 
         OR confidence < 0.1
    `).run(cutoff, maxUsage)
    
    return result.changes
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    
    let dotProduct = 0
    let normA = 0
    let normB = 0
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) return 0
    
    return dotProduct / denominator
  }

  private rowToEntry(row: {
    id: string
    type: string
    content: string
    embedding: string | null
    metadata: string
    source: string | null
    task_id: number | null
    confidence: number
    usage_count: number
    last_used: number
    created_at: number
    updated_at: number
  }): MemoryEntry {
    return {
      id: row.id,
      type: row.type as MemoryEntry['type'],
      content: row.content,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      metadata: JSON.parse(row.metadata),
      source: row.source || undefined,
      taskId: row.task_id || undefined,
      confidence: row.confidence,
      usageCount: row.usage_count,
      lastUsed: row.last_used * 1000,
      createdAt: row.created_at * 1000,
      updatedAt: row.updated_at * 1000,
    }
  }
}

export class MemoryExtractor {
  private memoryStore: SemanticMemoryStore

  constructor(memoryStore: SemanticMemoryStore) {
    this.memoryStore = memoryStore
  }

  async extractFromTask(task: {
    id: number
    title: string
    description?: string
    status: string
    artifacts?: unknown[]
  }): Promise<void> {
    if (task.title) {
      await this.memoryStore.store({
        type: 'fact',
        content: `Task "${task.title}" was ${task.status}`,
        metadata: { taskId: task.id },
        taskId: task.id,
        confidence: 0.8,
      })
    }
  }

  async extractPattern(
    pattern: string,
    context: string,
    source: string,
    taskId?: number
  ): Promise<string> {
    return this.memoryStore.store({
      type: 'pattern',
      content: pattern,
      metadata: { context },
      source,
      taskId,
      confidence: 0.7,
    })
  }

  async extractDecision(
    decision: string,
    rationale: string,
    source: string,
    taskId?: number
  ): Promise<string> {
    return this.memoryStore.store({
      type: 'decision',
      content: `${decision} (Rationale: ${rationale})`,
      metadata: { rationale },
      source,
      taskId,
      confidence: 0.9,
    })
  }

  async extractLesson(
    lesson: string,
    source: string,
    taskId?: number
  ): Promise<string> {
    return this.memoryStore.store({
      type: 'lesson',
      content: lesson,
      metadata: {},
      source,
      taskId,
      confidence: 0.6,
    })
  }

  async extractArchitecture(
    component: string,
    description: string,
    relationships: string[],
    source: string
  ): Promise<string> {
    return this.memoryStore.store({
      type: 'architecture',
      content: `${component}: ${description}. Relationships: ${relationships.join(', ')}`,
      metadata: { component, relationships },
      source,
      confidence: 0.85,
    })
  }

  async extractPreference(
    preference: string,
    context: string,
    source: string
  ): Promise<string> {
    return this.memoryStore.store({
      type: 'preference',
      content: preference,
      metadata: { context },
      source,
      confidence: 0.75,
    })
  }

  async queryRelevant(
    query: string,
    types?: MemoryEntry['type'][]
  ): Promise<MemoryEntry[]> {
    const results = await this.memoryStore.query({
      type: types?.[0],
      minConfidence: 0.5,
      limit: 20,
    })
    
    return results.filter(r => 
      r.content.toLowerCase().includes(query.toLowerCase())
    )
  }
}

export const semanticMemory = new SemanticMemoryStore()
export const memoryExtractor = new MemoryExtractor(semanticMemory)