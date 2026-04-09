# Session 2: Memory System + Unified Stores Agent Prompt

## Background
You are Agent 2 implementing Session 2 of Mission Control's agent orchestration feature expansion.

## Goal
Implement Unified Memory System with short-term, long-term, entity, and contextual memory types for persistent agent context across sessions.

## File Assignments

### NEW Files to Create
1. `src/lib/memory.ts` - Unified memory API with remember(), recall(), forget(), clear()
2. `src/lib/memory-backends/sqlite.ts` - SQLite backend for long-term memory
3. `src/lib/memory-backends/chroma.ts` - Chroma vector search backend
4. `src/lib/memory-backends/postgres.ts` - PostgreSQL backend (production)
5. `src/app/api/memory/route.ts` - Memory CRUD API
6. `src/components/panels/memory-browser-panel.tsx` - Memory viewer UI (enhance existing)

### EXISTING Files to Update
1. `src/lib/db.ts` - Add columns: `memory_enabled INTEGER`, `persona_id TEXT`
2. `src/lib/migrations.ts` - Add migration `052_memory_schema`
3. `src/lib/event-bus.ts` - Add events: `memory.saved`, `memory.recalled`, `memory.flushed`

## Implementation Tasks

### Task 1: Unified Memory API (src/lib/memory.ts)
```typescript
export interface Memory {
  id: string;
  scope: 'short-term' | 'long-term' | 'entity' | 'contextual';
  content: string;
  embedding?: number[]; // JSON array
  metadata: Record<string, any>;
  created_at: number;
  expires_at?: number; // For short-term memory
}

export interface MemoryClient {
  // Save a memory with LLM-inferred scope/categories/importance
  remember(content: string, metadata?: Record<string, any>): Promise<void>;
  
  // Recall with composite scoring (semantic + recency + importance)
  recall(query: string, options?: {
    types?: ('short-term' | 'long-term' | 'entity' | 'contextual')[];
    limit?: number;
    recencyWeight?: number;
    importanceThreshold?: number;
  }): Promise<MemoryMatch[]>;
  
  // Forget specific memories
  forget(ids: string[]): Promise<void>;
  
  // Clear memories by type
  clear(type?: 'short-term' | 'long-term' | 'entity' | 'contextual' | 'all'): Promise<void>;
  
  // Search by semantic similarity
  search(query: string, options: SearchOptions): Promise<MemoryMatch[]>;
}

export interface MemoryMatch extends Memory {
  score: number; // 0-1 similarity score
  relevance: 'high' | 'medium' | 'low';
}
```

### Task 2: SQLite Backend (src/lib/memory-backends/sqlite.ts)
```typescript
export class SQLiteMemoryBackend implements MemoryBackend {
  async remember(content: string, metadata: Record<string, any>): Promise<void> {
    const id = generateUUID();
    const embedding = await generateEmbedding(content); // Use OpenAI embeddings or similar
    const now = Math.floor(Date.now() / 1000);
    
    this.db.prepare(`
      INSERT INTO memory (id, scope, content, embedding, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, metadata.scope, content, JSON.stringify(embedding), JSON.stringify(metadata), now);
  }
  
  async recall(query: string, options: RecallOptions): Promise<MemoryMatch[]> {
    const queryEmbedding = await generateEmbedding(query);
    
    // Get recent memories
    const recent = this.db.prepare(`
      SELECT id, scope, content, embedding, metadata, created_at
      FROM memory WHERE created_at > ? AND scope IN (${options.types.map(() => '?').join(',')})
      ORDER BY created_at DESC LIMIT 100
    `).all(...options.types, Date.now() / 1000 - 86400 * 7) as Memory[];
    
    // Calculate relevance scores
    return recent.map(m => ({
      ...m,
      score: this.calculateRelevance(queryEmbedding, JSON.parse(m.embedding)),
      relevance: this.determineRelevance(m, options)
    })).filter(m => m.score >= 0.3).slice(0, options.limit);
  }
  
  calculateRelevance(queryEmb: number[], contentEmb: number[]): number {
    // Cosine similarity
    const dotProduct = queryEmb.reduce((sum, v, i) => sum + v * contentEmb[i], 0);
    const norm1 = Math.sqrt(queryEmb.reduce((sum, v) => sum + v * v, 0));
    const norm2 = Math.sqrt(contentEmb.reduce((sum, v) => sum + v * v, 0));
    return dotProduct / (norm1 * norm2);
  }
  
  determineRelevance(memory: Memory, options: RecallOptions): 'high' | 'medium' | 'low' {
    // Determine relevance based on recency, importance, and query match
    const ageDays = (Date.now() / 1000 - memory.created_at) / 86400;
    if (ageDays < 1) return 'high';
    if (ageDays < 7) return 'medium';
    return 'low';
  }
}
```

### Task 3: Chroma Backend (src/lib/memory-backends/chroma.ts)
```typescript
export class ChromaMemoryBackend implements MemoryBackend {
  private client: ChromaClient;
  private collection: Collection;
  
  constructor(options: ChromaOptions) {
    this.client = new ChromaClient(options.host, options.port);
    this.collection = this.client.getOrCreateCollection({
      name: 'mission_control_memory',
      metadata: { distance: 'cosine' }
    });
  }
  
  async remember(content: string, metadata: Record<string, any>): Promise<void> {
    const id = generateUUID();
    const embedding = await generateEmbedding(content);
    
    await this.collection.add({
      ids: [id],
      embeddings: [embedding],
      metadatas: [metadata],
      documents: [content]
    });
  }
  
  async recall(query: string, options: RecallOptions): Promise<MemoryMatch[]> {
    const queryEmbedding = await generateEmbedding(query);
    
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: options.limit || 10,
      where: options.types ? { scope: { $in: options.types } } : undefined
    });
    
    return results.documents[0].map((doc, i) => ({
      id: results.ids[0][i],
      scope: results.metadatas[0][i].scope,
      content: doc,
      metadata: results.metadatas[0][i],
      created_at: results.metadatas[0][i].created_at,
      score: 1 - (results.distances[0][i] || 0), // Convert distance to similarity
      relevance: this.determineRelevance({ scope: results.metadatas[0][i].scope })
    }));
  }
}
```

### Task 4: Memory API Routes (src/app/api/memory/route.ts)
```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const limit = parseInt(searchParams.get('limit') || '10');
  
  const db = getDatabase();
  const memories = db.prepare(`
    SELECT * FROM memory WHERE scope = ? ORDER BY created_at DESC LIMIT ?
  `).all(type || 'all', limit) as Memory[];
  
  // Parse embeddings
  const enhanced = memories.map(m => ({
    ...m,
    embedding: JSON.parse(m.embedding || '[]')
  }));
  
  return NextResponse.json(enhanced);
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  
  const body = await request.json();
  const memory: Memory = {
    id: generateUUID(),
    scope: body.scope,
    content: body.content,
    embedding: JSON.stringify(body.embedding || []),
    metadata: JSON.stringify(body.metadata || {}),
    created_at: Math.floor(Date.now() / 1000)
  };
  
  const db = getDatabase();
  db.prepare(`
    INSERT INTO memory (id, scope, content, embedding, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(memory.id, memory.scope, memory.content, memory.embedding, memory.metadata, memory.created_at);
  
  eventBus.broadcast('memory.saved', { id: memory.id, memory });
  
  return NextResponse.json({ ok: true, id: memory.id });
}

export async function DELETE(request: Request) {
  const auth = requireRole(request, 'admin');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  
  const body = await request.json();
  const ids = Array.isArray(body.ids) ? body.ids : [body.ids];
  
  const db = getDatabase();
  db.prepare(`
    DELETE FROM memory WHERE id IN (${ids.map(() => '?').join(',')})
  `).run(...ids);
  
  eventBus.broadcast('memory.flushed', { count: ids.length });
  
  return NextResponse.json({ ok: true, deleted: ids.length });
}
```

### Task 5: Memory Browser UI (src/components/panels/memory-browser-panel.tsx)
```typescript
const MemoryBrowserPanel: React.FC = () => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filter, setFilter] = useState<'all' | 'short-term' | 'long-term' | 'entity' | 'contextual'>('all');
  const [search, setSearch] = useState('');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  
  useEffect(() => {
    fetchMemories(filter);
  }, [filter]);
  
  const fetchMemories = async (type: string) => {
    const res = await fetch(`/api/memory?type=${type}&limit=50`);
    const data = await res.json();
    setMemories(data);
  };
  
  const handleSearch = async () => {
    // Implement search with semantic recall
    if (!search) {
      fetchMemories(filter);
      return;
    }
    
    const res = await fetch(`/api/memory/search?query=${encodeURIComponent(search)}&types=${filter === 'all' ? 'all' : filter}`);
    const data = await res.json();
    setMemories(data);
  };
  
  return (
    <div className="p-4">
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Search memories..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
        />
        <button
          onClick={() => handleSearch()}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Search
        </button>
      </div>
      
      <div className="flex gap-2 mb-4">
        {['all', 'short-term', 'long-term', 'entity', 'contextual'].map(type => (
          <button
            key={type}
            onClick={() => setFilter(type as any)}
            className={`px-3 py-1 rounded text-sm ${
              filter === type ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            {type}
          </button>
        ))}
      </div>
      
      <div className="space-y-2">
        {memories.map(memory => (
          <div
            key={memory.id}
            onClick={() => setSelectedMemory(memory)}
            className="p-3 bg-gray-800 rounded hover:bg-gray-700 cursor-pointer"
          >
            <div className="flex justify-between text-sm">
              <span className="text-blue-400">{memory.scope}</span>
              <span className="text-gray-500">{formatDate(memory.created_at)}</span>
            </div>
            <p className="mt-2 text-gray-300 truncate">{memory.content}</p>
          </div>
        ))}
      </div>
      
      {selectedMemory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 p-4 flex items-center justify-center">
          <div className="bg-gray-800 rounded p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Memory Details</h3>
            <div className="mb-4">
              <span className="inline-block px-2 py-1 bg-blue-600 rounded text-sm mb-2">
                {selectedMemory.scope}
              </span>
              <span className="text-gray-500 text-sm">
                Created: {formatDate(selectedMemory.created_at)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-gray-300 mb-4">
              {selectedMemory.content}
            </p>
            <p className="text-xs text-gray-500">
              Metadata: {JSON.stringify(selectedMemory.metadata)}
            </p>
            <button
              onClick={() => setSelectedMemory(null)}
              className="mt-4 px-4 py-2 bg-gray-600 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
```

### Task 6: Migration (src/lib/migrations.ts)
```typescript
{
  id: '052_memory_schema',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        expires_at INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory(scope);
      CREATE INDEX IF NOT EXISTS idx_memory_created ON memory(created_at);
      CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory(expires_at);
    `);
    
    // Add agent columns
    const cols = db.prepare('PRAGMA table_info(agents)').all() as any[];
    if (!cols.some(c => c.name === 'memory_enabled')) {
      db.exec(`ALTER TABLE agents ADD COLUMN memory_enabled INTEGER DEFAULT 0`);
    }
  }
}
```

## Success Criteria
Complete when:
- [ ] Memory remember() saves content with embedding to SQLite
- [ ] Memory recall() returns results with semantic search scoring
- [ ] Chroma backend returns similar memories with cosine similarity
- [ ] Memory browser UI displays filtered memories by scope
- [ ] Search function works with semantic recall
- [ ] Cross-session memory persists (save → restart → restore)
- [ ] Tests pass for all new functionality

## Key Constraints
- Use OpenAI embeddings API or local embedding model
- Store embeddings as JSON arrays (TEXT in SQLite)
- Implement composite scoring (recency + importance + semantic)
- Memory retention policies: short-term expires, long-term persists
- Use existing database abstraction and eventBus

## Dependencies
- OpenAI API key for embeddings (or use alternative like local model)
- Chroma server (if using Chroma backend)

Good luck! You're building persistent context that agents can use across sessions.