# Memory Browser Panel Enhancement - Implementation Notes

## Code Changes Required

### 1. File: `src/app/api/search/unified/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { readLimiter } from '@/lib/rate-limit';
import { getDatabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = readLimiter(request);
  if (rateCheck) return rateCheck;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const limit = Number.parseInt(searchParams.get('limit') || '20', 10);
  const offset = Number.parseInt(searchParams.get('offset') || '0', 10);
  const type = searchParams.get('type') || 'all'; // all|task|memory

  const results = {
    query,
    results: [],
    total: 0,
    page: Math.floor(offset / limit) + 1,
    pages: 0,
  };

  // Query tasks
  if (type === 'all' || type === 'task') {
    const taskResults = await searchTasks(query, limit, offset);
    results.results.push(...taskResults.results);
    results.total += taskResults.total;
  }

  // Query memory
  if (type === 'all' || type === 'memory') {
    // Use existing memory search
    // Import searchMemory from src/lib/memory-search
  }

  // Sort by score (unified ranking)
  results.results.sort((a, b) => b.score - a.score);
  results.results = results.results.slice(0, limit);
  results.total = results.results.length;
  results.pages = Math.ceil(results.total / limit);

  return NextResponse.json(results);
}

async function searchTasks(query: string, limit: number, offset: number) {
  const db = getDatabase();
  const searchQuery = `%${query}%`;
  
  const rowCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks 
    WHERE title LIKE ? OR description LIKE ?
  `).get(searchQuery, searchQuery) as { cnt: number };

  const rows = db.prepare(`
    SELECT id, title, description, priority, status, created_at
    FROM tasks 
    WHERE title LIKE ? OR description LIKE ?
    ORDER BY priority DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(searchQuery, searchQuery, limit, offset);

  return {
    total: rowCount.cnt,
    results: rows.map(r => ({
      type: 'task',
      id: r.id,
      title: r.title,
      description: r.description,
      score: calculateTaskScore(r),
      priority: r.priority,
      status: r.status,
    })),
  };
}

function calculateTaskScore(task: any): number {
  // Simple scoring: priority weight * recency factor
  const priorityWeights = { critical: 1.0, high: 0.8, medium: 0.5, low: 0.2 };
  const ageFactor = Math.max(0.1, 1 - (Date.now() - task.created_at * 1000) / (30 * 24 * 3600 * 1000));
  return (priorityWeights[task.priority as keyof typeof priorityWeights] || 0.5) * ageFactor;
}
```

---

### 2. File: `src/app/api/search/web/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { webSearchRateLimit } from '@/lib/rate-limit';
import { getMemoryConfig } from '@/lib/config';

const WEB_SEARCH_API = {
  google: 'https://www.googleapis.com/customsearch/v1',
  bing: 'https://api.bing.microsoft.com/v7.0/search',
};

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = webSearchRateLimit(request);
  if (rateCheck) return rateCheck;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const engine = searchParams.get('engine') || 'google';
  const limit = Number.parseInt(searchParams.get('limit') || '10', 10);

  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }

  const config = getMemoryConfig();
  if (engine === 'google' && !config.webSearch.apiKey) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
  }

  try {
    const apiEndpoint = WEB_SEARCH_API[engine as keyof typeof WEB_SEARCH_API];
    let url = `${apiEndpoint}?q=${encodeURIComponent(query)}&key=${config.webSearch.apiKey}&cx=${config.webSearch.engineId}&num=${limit}`;
    if (engine === 'bing') {
      url = `${apiEndpoint}?q=${encodeURIComponent(query)}&count=${limit}`;
    }

    const response = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': config.webSearch.apiKey,
      },
    });

    if (!response.ok) throw new Error(`Web search API error: ${response.status}`);

    const data = await response.json();
    const results = data.items?.map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet || item.description,
    })) || [];

    return NextResponse.json({ query, engine, results,总results: results.length });
  } catch (error) {
    console.error('Web search failed:', error);
    return NextResponse.json({ error: 'Web search failed' }, { status: 500 });
  }
}
```

---

### 3. File: `src/components/panels/memory-browser-panel.tsx` (MODIFY)

**Additions:**

```typescript
// Import external resources
import { createClientLogger } from '@/lib/client-logger';
import { useMissionControl } from '@/store';

const log = createClientLogger('MemoryBrowser');

// Add state for unified search
const [unifiedQuery, setUnifiedQuery] = useState('');
const [unifiedResults, setUnifiedResults] = useState<any[]>([]);
const [unifiedTab, setUnifiedTab] = useState<'all'|'tasks'|'memory'>('all');
const [isSearchingUnified, setIsSearchingUnified] = useState(false);

// Unified search function
const searchUnified = async (query: string) => {
  if (!query.trim()) return;
  setIsSearchingUnified(true);
  try {
    const url = new URL('/api/search/unified', window.location.origin);
    url.searchParams.set('q', query);
    url.searchParams.set('type', unifiedTab === 'all' ? 'all' : unifiedTab);
    url.searchParams.set('limit', '20');
    
    const response = await fetch(url.href);
    if (response.ok) {
      const data = await response.json();
      setUnifiedResults(data.results || []);
    }
  } catch (error) {
    log.error('Unified search failed:', error);
    setUnifiedResults([]);
  } finally {
    setIsSearchingUnified(false);
  }
};

// Add web search state
const [webSearchQuery, setWebSearchQuery] = useState('');
const [webSearchResults, setWebSearchResults] = useState<any[]>([]);
const [isWebSearching, setIsWebSearching] = useState(false);

const searchWeb = async (query: string) => {
  if (!query.trim()) return;
  setIsWebSearching(true);
  try {
    const response = await fetch(`/api/search/web?q=${encodeURIComponent(query)}&limit=10`);
    if (response.ok) {
      const data = await response.json();
      setWebSearchResults(data.results || []);
    }
  } catch (error) {
    log.error('Web search failed:', error);
  } finally {
    setIsWebSearching(false);
  }
};

// Add search tabs UI
const [searchTab, setSearchTab] = useState<'memory'|'unified'|'web'>('memory');
```

**Modify searchFiles function:**

```typescript
const searchFiles = async () => {
  if (!searchQuery.trim()) return;
  setIsSearching(true);
  try {
    const response = await fetch(`/api/memory?action=search&query=${encodeURIComponent(searchQuery)}`);
    const data = await response.json();
    setSearchResults(data.results || []);
    // Store search history
    fetch('/api/search/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, results: data.total }),
    });
  } catch (error) {
    log.error('Search failed:', error);
    setSearchResults([]);
  } finally {
    setIsSearching(false);
  }
};
```

**Add search tabs UI in render:**

```typescript
// After the top bar, add search tab selection
<div className="flex gap-2 px-3 py-2 border-b border-border bg-[hsl(var(--surface-0))]">
  {(['memory', 'unified'] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setSearchTab(tab)}
      className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
        searchTab === tab ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
      }`}
    >
      {tab === 'memory' ? 'Memory Search' : 'Unified Search'}
    </button>
  ))}
</div>

// Unified search input (conditionally rendered)
{searchTab === 'unified' && (
  <div className="px-3 py-2 border-b border-border/50">
    <input
      type="text"
      value={unifiedQuery}
      onChange={(e) => setUnifiedQuery(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && searchUnified(unifiedQuery)}
      placeholder="Search tasks and memory..."
      className="w-full px-2 py-1.5 text-xs font-mono bg-[hsl(var(--surface-1))] border border-border/50 rounded text-foreground"
    />
    <div className="mt-2 flex gap-2">
      {(['all', 'tasks', 'memory'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setUnifiedTab(tab)}
          className={`px-2 py-0.5 rounded text-[10px] ${
            unifiedTab === tab ? 'bg-primary text-foreground' : 'text-muted-foreground hover:bg-muted-foreground/10'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
    {isSearchingUnified && <span className="text-[10px] text-muted-foreground/50">Searching...</span>}
    {unifiedResults.length > 0 && (
      <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
        {unifiedResults.map((result, i) => (
          <div
            key={i}
            className="p-2 text-xs font-mono hover:bg-[hsl(var(--surface-2))] rounded cursor-pointer"
            onClick={() => result.type === 'memory' ? loadFileContent(result.path) : null}
          >
            <span className="text-[10px] text-muted-foreground/50 mr-2">[{result.type}]</span>
            {result.type === 'task' ? `Task #${result.id}: ` : ''}
            {result.title}
            {result.snippet && <span className="text-muted-foreground/70"> - {result.snippet}</span>}
          </div>
        ))}
      </div>
    )}
  </div>
)}

// Web search sidebar (conditionally rendered)
{searchTab === 'web' && (
  <div className="w-60 shrink-0 border-r border-border bg-[hsl(var(--surface-0))] p-2 min-h-0">
    <input
      type="text"
      value={webSearchQuery}
      onChange={(e) => setWebSearchQuery(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && searchWeb(webSearchQuery)}
      placeholder="Search the web..."
      className="w-full px-2 py-1.5 text-xs font-mono bg-[hsl(var(--surface-1))] border border-border/50 rounded text-foreground"
    />
    {isWebSearching && <span className="text-[10px] text-muted-foreground/50">Searching web...</span>}
    {webSearchResults.length > 0 && (
      <div className="mt-2 space-y-1">
        {webSearchResults.map((result, i) => (
          <a
            key={i}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 text-xs font-mono hover:bg-[hsl(var(--surface-2))] rounded text-primary/80"
          >
            <div className="font-semibold text-foreground">{result.title}</div>
            <div className="text-muted-foreground/70 truncate">{result.url}</div>
            <div className="text-muted-foreground/50 mt-1">{result.snippet}</div>
          </a>
        ))}
      </div>
    )}
  </div>
)}
```

---

### 4. File: `src/lib/memory-search.ts` (MODIFY)

**Add FTS5 improvements:**

```typescript
// Better ranking with adjusted BM25
export async function searchMemory(
  baseDir: string,
  allowedPrefixes: string[],
  query: string,
  opts?: { limit?: number; offset?: number }
): Promise<SearchResponse> {
  await ensureIndex(baseDir, allowedPrefixes);

  const db = getDatabase();
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const sanitized = sanitizeFtsQuery(query);

  let results: SearchResult[] = [];
  let total = 0;

  // FTS5 with improved ranking
  try {
    const rows = db.prepare(`
      SELECT
        path,
        title,
        snippet(memory_fts, 2, '<mark>', '</mark>', '...', 40) as snippet,
        bm25(memory_fts, 0.8, 2.0, 0.5) as rank
      FROM memory_fts
      WHERE memory_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `).all(sanitized, limit, offset) as Array<{ path: string; title: string; snippet: string; rank: number }>;

    results = rows.map((r) => ({
      path: r.path,
      title: r.title,
      snippet: r.snippet,
      rank: Math.abs(r.rank),
    }));

    const countRow = db.prepare(
      'SELECT count(*) as cnt FROM memory_fts WHERE memory_fts MATCH ?'
    ).get(sanitized) as { cnt: number };
    total = countRow.cnt;
  } catch (err) {
    // Fallback to simple phrase search
    const fallbackQuery = `"${query.replace(/"/g, '""')}"`;
    const rows = db.prepare(`
      SELECT path, title,
        snippet(memory_fts, 2, '<mark>', '</mark>', '...', 40) as snippet,
        bm25(memory_fts, 0.8, 2.0, 0.5) as rank
      FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT ? OFFSET ?
    `).all(fallbackQuery, limit, offset) as Array<{ path: string; title: string; snippet: string; rank: number }>;
    results = rows.map((r) => ({ path: r.path, title: r.title, snippet: r.snippet, rank: Math.abs(r.rank) }));
    total = results.length;
  }

  const meta = db.prepare(
    "SELECT value FROM memory_fts_meta WHERE key = 'last_rebuild'"
  ).get() as { value: string } | undefined;
  const fileCountMeta = db.prepare(
    "SELECT value FROM memory_fts_meta WHERE key = 'file_count'"
  ).get() as { value: string } | undefined;

  return {
    query,
    results,
    total,
    indexedFiles: fileCountMeta ? Number(fileCountMeta.value) : 0,
    indexedAt: meta?.value ?? null,
  };
}
```

---

### 5. File: `src/lib/search-history.ts` (NEW)

```typescript
export async function saveSearchHistory(query: string, resultsCount: number): Promise<void> {
  try {
    await fetch('/api/search/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, results: resultsCount }),
    });
  } catch (error) {
    console.error('Failed to save search history:', error);
  }
}

export async function getSearchHistory(limit: number = 10): Promise<{ query: string; results: number; timestamp: number }[]> {
  try {
    const response = await fetch(`/api/search/history?limit=${limit}`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error('Failed to get search history:', error);
    return [];
  }
}

export async function getPopularSearches(limit: number = 10): Promise<{ term: string; count: number }[]> {
  try {
    const response = await fetch(`/api/search/popular?limit=${limit}`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error('Failed to get popular searches:', error);
    return [];
  }
}
```

---

## Database Migration

### Schema Changes

Run this SQL on database startup (add to `src/lib/db.ts`):

```typescript
// Add tables for enhanced features
db.exec(`
  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS search_stats (
    search_term TEXT NOT NULL,
    total_results INTEGER NOT NULL,
    result_type TEXT,
    timestamp INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS memory_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER DEFAULT 1
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS memory_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_text TEXT NOT NULL,
    line_number INTEGER,
    confidence REAL DEFAULT 1.0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS memory_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    version INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    diff TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

// Add indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_search_history_timestamp ON search_history(timestamp DESC)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_memory_entities_file ON memory_entities(file_path)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_memory_versions_file ON memory_versions(file_path)
`);

// Update schema version
dbHelpers.updateSchemaVersion('v3');
```

---

## UI Component Changes Required

### Memory Browser Panel

**Add search tabs UI:**
- Replace single search input with tabbed interface
- Add filters (all/unified/web)
- Show search history suggestions

**Add file tree lazy loading:**
- Only fetch children on expand
- Show loading indicator
- Cache expanded state

**Add unified search results display:**
- Group results by source
- Show snippets from both tasks and memory
- quick Navigation

---

## Testing Checklist

- [ ] Unified search returns tasks + memory results
- [ ] Web search sidebar shows results
- [ ] Search history is saved
- [ ] File tree loads lazily
- [ ] Pagination works with 100+ results
- [ ] FTS5 ranking is better
- [ ] Templates can be created and used
- [ ] Action items are extracted

---

## Configuration Required

### Environment Variables

```env
# Web Search (optional, improve features)
WEB_SEARCH_ENGINE=google
GOOGLE_CUSTOM_SEARCH_API_KEY=your-key
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your-engine-id

# Performance
SEARCH_CACHE_TTL=300
SEARCH_RESULTS_LIMIT=20
MAX_SEARCH_RESULTS=100

# AI Features (optional)
AI_MODEL=claude-sonnet
ANTHROPIC_API_KEY=your-key
OLLAMA_URL=http://localhost:11434
```

---

## Deployment Notes

1. Run database migration on first start
2. Enable feature flags gradually
3. Monitor API costs (web search)
4. Review performance metrics
5. Collect user feedback
