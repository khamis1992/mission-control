# Session 1: MCP System + Checkpoint Backend Agent Prompt

## Background
You are Agent 1 implementing Session 1 of Mission Control's agent orchestration feature expansion.

## Goal
Implement MCP (Model Context Protocol) registry and Checkpoint backend system to enable:
- 100+ MCP server registry integration
- SQLite and PostgreSQL checkpoint persistence
- Checkpoint save/load for long-running agent tasks

## File Assignments

### NEW Files to Create
1. `src/lib/mcp-registry.ts` - MCP server registry with install(), list(), invoke()
2. `src/lib/mcp-handlers.ts` - API handlers for MCP endpoints
3. `src/lib/checkpoint-backends/sqlite.ts` - SQLite checkpoint backend
4. `src/lib/checkpoint-backends/postgres.ts` - PostgreSQL checkpoint backend (production)
5. `src/app/api/mcp/servers/route.ts` - GET/POST /api/mcp/servers
6. `src/app/api/mcp/[serverId]/route.ts` - GET/DELETE /api/mcp/:serverId
7. `src/app/api/checkpoints/[taskId]/route.ts` - GET /api/checkpoints/:taskId
8. `src/app/api/mcp/[server]/invoke/route.ts` - POST /api/mcp/:server/invoke

### EXISTING Files to Update
1. `src/lib/db.ts` - Add columns: `checkpoint_backend TEXT`, `mcp_servers TEXT`
2. `src/lib/migrations.ts` - Add migration `051_mcp_checkpoint_schema`
3. `src/lib/scheduler.ts` - Add MCP health check job (check servers every 5min)
4. `src/lib/event-bus.ts` - Add events: `mcp.server_installed`, `mcp.server_removed`

## Implementation Tasks

### Task 1: MCP Registry (src/lib/mcp-registry.ts)
```typescript
export interface MCPServer {
  id: string; // Primary key (e.g., "github", "sqlite", "postgres")
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  command?: string; // For stdio
  url?: string;     // For http/ws
  config?: Record<string, any>;
  enabled: boolean;
  created_at: number;
}

export interface MCPClient {
  install(server: MCPServer): Promise<void>;
  uninstall(serverId: string): Promise<void>;
  list(): Promise<MCPServer[]>;
  get(serverId: string): Promise<MCPServer | null>;
  invoke(serverId: string, tool: string, args: any): Promise<any>;
}

// Implement with:
// - Online registry sync from https://registry.mcp.tools/api/servers
// - Local installed servers stored in database
// - MCP client that invokes tools via transport (stdio/http/ws)
```

### Task 2: Checkpoint Backends
**SQLite Backend** (src/lib/checkpoint-backends/sqlite.ts):
```typescript
import { Checkpoint, CheckpointBackend } from '../checkpoint-manager';

export class SQLiteCheckpointBackend implements CheckpointBackend {
  async save(checkpoint: Checkpoint): Promise<void> {
    // Use SQLite for persistence
  }
  
  async load(taskId: number): Promise<Checkpoint | null> {
    // Query by task_id and get latest checkpoint
  }
  
  async list(taskId: number): Promise<Checkpoint[]> {
    // Get all checkpoints for task sorted by timestamp
  }
  
  async delete(id: string): Promise<void> {
    // Delete specific checkpoint
  }
  
  async getHistory(taskId: number, lastN?: number): Promise<Checkpoint[]> {
    // Get last N checkpoints for rollback
  }
}
```

**PostgreSQL Backend** (src/lib/checkpoint-backends/postgres.ts):
- Same interface as SQLite
- Use pg client for PostgreSQL
- Add connection pooling

### Task 3: API Routes
All routes should:
- Check authentication using existing `requireRole()` pattern
- Return JSON responses with `NextResponse`
- Handle errors gracefully with proper status codes

**Example** (src/app/api/mcp/servers/route.ts):
```typescript
export async function GET() {
  const db = getDatabase();
  const servers = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all() as MCPServer[];
  return NextResponse.json(servers);
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  
  const body = await request.json();
  const server: MCPServer = {
    id: body.id,
    name: body.name,
    transport: body.transport,
    command: body.command,
    url: body.url,
    config: body.config,
    enabled: body.enabled ?? 1,
    created_at: Math.floor(Date.now() / 1000)
  };
  
  const db = getDatabase();
  db.prepare(`
    INSERT INTO mcp_servers (id, name, transport, command, url, config, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(server.id, server.name, server.transport, server.command, server.url, JSON.stringify(server.config), server.enabled, server.created_at);
  
  eventBus.broadcast('mcp.server_installed', { server_id: server.id });
  
  return NextResponse.json({ ok: true, server_id: server.id });
}
```

### Task 4: Migration
Add to `src/lib/migrations.ts`:
```typescript
{
  id: '051_mcp_checkpoint_schema',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT NOT NULL,
        command TEXT,
        url TEXT,
        config TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
    `);
    
    // Add checkpoint_backend column if not exists
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as any[];
    if (!cols.some(c => c.name === 'checkpoint_backend')) {
      db.exec(`ALTER TABLE tasks ADD COLUMN checkpoint_backend TEXT DEFAULT 'sqlite'`);
    }
    
    // Add mcp_servers column if not exists
    if (!cols.some(c => c.name === 'mcp_servers')) {
      db.exec(`ALTER TABLE agents ADD COLUMN mcp_servers TEXT DEFAULT '[]'`);
    }
  }
}
```

### Task 5: Scheduler Job
Add to `src/lib/scheduler.ts`:
```typescript
tasks.set('mcp_health_check', {
  name: 'MCP Server Health Check',
  intervalMs: 5 * 60 * 1000, // Every 5 minutes
  handler: async () => {
    const db = getDatabase();
    const servers = db.prepare('SELECT * FROM mcp_servers WHERE enabled = 1').all() as MCPServer[];
    
    let healthy = 0;
    for (const server of servers) {
      try {
        // Test connectivity
        await testMCPServerConnection(server);
        healthy++;
      } catch (error) {
        logger.error({ server_id: server.id, error }, 'MCP server health check failed');
      }
    }
    
    return {
      ok: true,
      checked: servers.length,
      healthy,
      unhealthy: servers.length - healthy
    };
  }
});
```

## Success Criteria
Complete when:
- [ ] MCP registry can list 100+ servers from online registry
- [ ] SQLite checkpoint saves and loads for 10+ tasks successfully
- [ ] PostgreSQL checkpoint backend works with real database connection
- [ ] API routes respond correctly for all CRUD operations
- [ ] Health check job runs and updates server status
- [ ] Tests pass for all new functionality

## Key Constraints
- Follow existing code patterns in `src/lib/` and `src/app/api/`
- Use existing database abstraction (`getDatabase()`)
- Use existing eventBus pattern (`eventBus.broadcast()`)
- Use existing logger pattern (`logger.info()`, `logger.error()`)
- API routes must check authentication with `requireRole()`

## Dependencies
- No dependencies - can run independently

Good luck! You're building the foundation for Mission Control's advanced agent orchestration capabilities.