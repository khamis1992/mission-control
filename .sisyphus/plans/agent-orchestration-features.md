# Agent Orchestration Features Implementation Plan

## Overview

**Goal:** Implement cutting-edge agent orchestration to surpass competitors (AutoGen, CrewAI, LangGraph, OpenAI Swarm, Semantic Kernel)

**Current State:**
- Partial `checkpoint-manager.ts` (basic checkpoint saving/resuming)
- Partial `auto-task-generator.ts` (AI subtask generation)
- Existing database schema with tasks, agents, quality_reviews tables

**Target Features (Tiered Priority):**

### Tier 1 - Critical (Must Have)
1. **MCP Integration** - Model Context Protocol (97M+ downloads, 370+ servers)
2. **Checkpoint/Resume** - LangGraph differentiator - save/restore agent state
3. **Agent Telemetry** - All competitors have this - essential for observability
4. **HITL Approval** - Enterprise requirement - human oversight on consequential actions

### Tier 2 - High Value (Should Have)
5. **Unified Memory** - CrewAI's 4-type memory - short-term, long-term, entity, contextual
6. **Multi-Agent Workflows** - AutoGen's GroupChat patterns - sequential, hierarchical, parallel, swarm
7. **Self-Healing** - Auto-retry, rollback, escalate, fallback strategies
8. **MCP Server Registry** - Marketplace for 370+ community servers

### Tier 3 - Medium Value (Nice to Have)
9. **Agent Personas** - planner, executor, reviewer, devops, etc. with configurable personalities
10. **Performance Benchmarking** - AgentBench, Arc-AGI integration
11. **Cost Budget** - Per-agent budgets, model routing for optimization
12. **A2A Protocol** - Agent-to-agent communication preparation

**Strategy:** Run 5 parallel sessions:
- **Session 1:** MCP System + Checkpoint Backend
- **Session 2:** Memory System + Unified Stores
- **Session 3:** Telemetry + Observability Dashboard
- **Session 4:** HITL Approval + Recovery System
- **Session 5:** Workflows + Personas

**Estimated Time:** 2-3 hours parallel execution
**Total Files:** 25 new files created, 10 existing files updated
**Database Migrations:** 3 new migrations (051, 052, 053)


---

## Database Schema Updates

### New Tables

```sql
-- MCP Servers Registry
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL, -- stdio, http, websocket
  command TEXT,
  url TEXT,
  config TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);

-- Checkpoint Backends Configuration
CREATE TABLE IF NOT EXISTS checkpoint_backends (
  id TEXT PRIMARY KEY, -- 'sqlite', 'postgres'
  backend_type TEXT NOT NULL,
  connection_string TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Unified Memory Store
CREATE TABLE IF NOT EXISTS memory (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL, -- short-term, long-term, entity
  content TEXT NOT NULL,
  embedding TEXT, -- JSON array of floats
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory(scope);
CREATE INDEX IF NOT EXISTS idx_memory_created ON memory(created_at);
CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory(expires_at);

-- Agent Personas
CREATE TABLE IF NOT EXISTS agent_personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  personality TEXT, -- JSON
  capabilities TEXT, -- JSON array
  examples TEXT, -- JSON
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agent_personas_enabled ON agent_personas(enabled);
```

### New Columns to Add

**Tasks Table:**
```sql
ALTER TABLE tasks ADD COLUMN checkpoint_backend TEXT DEFAULT 'sqlite';
ALTER TABLE tasks ADD COLUMN checkpoint_data TEXT;
ALTER TABLE tasks ADD COLUMN checkpoint_stage TEXT;
ALTER TABLE tasks ADD COLUMN telemetry_config TEXT; -- JSON
ALTER TABLE tasks ADD COLUMN approval_gate_id TEXT;
ALTER TABLE tasks ADD COLUMN recovery_strategy TEXT;
ALTER TABLE tasks ADD COLUMN recovery_attempts INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN agent_personality TEXT;
ALTER TABLE tasks ADD COLUMN workflow_id TEXT;
```

**Agents Table:**
```sql
ALTER TABLE agents ADD COLUMN memory_enabled INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN persona_id TEXT;
ALTER TABLE agents ADD COLUMN mcp_servers TEXT; -- JSON array of server IDs
```

---

## Session Assignments

### Session 1: MCP System + Checkpoint Backend
**Primary Files to Create:**
- `src/lib/mcp-registry.ts` - MCP server registry
- `src/lib/mcp-handlers.ts` - MCP endpoint handlers
- `src/lib/checkpoint-backends/sqlite.ts` - SQLite checkpoint backend
- `src/lib/checkpoint-backends/postgres.ts` - PostgreSQL checkpoint backend
- `src/app/api/mcp/servers/route.ts` - MCP servers API
- `src/app/api/mcp/[serverId]/route.ts` - Single server API
- `src/app/api/checkpoints/[taskId]/route.ts` - Checkpoint query API
- `src/app/api/mcp/[server]/invoke/route.ts` - MCP invoke endpoint

**Primary Files to Update:**
- `src/lib/db.ts` - Add `checkpoint_backend` and `mcp_servers` columns
- `src/lib/migrations.ts` - Add migration `051_mcp_checkpoint_schema`
- `src/lib/scheduler.ts` - Add MCP health check job
- `src/lib/event-bus.ts` - Add MCP events

**Tasks:**
1. Create MCP server interface and registry (install, list, invoke methods)
2. Implement SQLite checkpoint backend with `saveCheckpoint()`, `loadCheckpoint()`, `listCheckpoints()`
3. Implement PostgreSQL checkpoint backend (production-ready)
4. Create API routes for MCP server management
5. Add_checkpoint query endpoints for debugging
6. Test MCP server installation and invocation

**Dependencies:** None (can run independently)

**Success Criteria:**
- [ ] MCP registry can list 100+ servers from online registry
- [ ] SQLite checkpoint saves and loads for 10+ tasks
- [ ] PostgreSQL checkpoint persistence tested
- [ ] API routes respond correctly with valid tokens

---

### Session 2: Memory System + Unified Stores
**Primary Files to Create:**
- `src/lib/memory.ts` - Unified memory API
- `src/lib/memory-backends/sqlite.ts` - SQLite long-term memory
- `src/lib/memory-backends/chroma.ts` - Chroma vector search
- `src/lib/memory-backends/postgres.ts` - Postgres vector
- `src/app/api/memory/route.ts` - Memory API
- `src/components/panels/memory-browser-panel.tsx` - Memory viewer (ENHANCE)

**Primary Files to Update:**
- `src/lib/db.ts` - Add memory-related columns
- `src/lib/migrations.ts` - Add migration `052_memory_schema`
- `src/lib/event-bus.ts` - Add memory events

**Tasks:**
1. Create unified memory API with `remember()`, `recall()`, `forget()`, `clear()`
2. Implement SQLite backend for long-term memory persistence
3. Implement Chroma backend for vector search with semantic recall
4. Add embedding generation using a model client
5. Create memory browser UI panel
6. Test cross-session memory retention

**Dependencies:** Session 1 (for checkpoint persistence compatibility)

**Success Criteria:**
- [ ] Memory remember/recall working with semantic search
- [ ] Vector search returns results with >80% accuracy
- [ ] Cross-session memory persists (save → restart → restore)
- [ ] Memory browser UI displays memories with categories

---

### Session 3: Telemetry + Observability Dashboard
**Primary Files to Create:**
- `src/lib/telemetry.ts` - Agent telemetry collection
- `src/lib/trace-collector.ts` - Trace event collector
- `src/app/api/telemetry/route.ts` - Telemetry API
- `src/components/panels/telemetry-panel.tsx` - Telemetry dashboard
- `src/components/panels/trace-viewer.tsx` - Trace timeline viewer
- `src/components/panels/cost-dashboard-panel.tsx` - Cost tracking

**Primary Files to Update:**
- `src/lib/event-bus.ts` - Add telemetry event types (agent_trace, tool_call, cost_update)
- `src/app/api/tasks/[id]/route.ts` - Add telemetry hooks
- `src/lib/scheduler.ts` - Add cost aggregation job

**Tasks:**
1. Create trace event types (agent_start, tool_call, tool_result, token_usage, error)
2. Implement trace collector with streaming support
3. Build telemetry dashboard panel with filters (agent, date, type, status)
4. Create trace viewer with timeline visualization
5. Implement cost tracking per agent (tokens → USD conversion)
6. Test cost aggregation and dashboard rendering

**Dependencies:** Session 1 (checkpoint data needed for complete traces)

**Success Criteria:**
- [ ] Agent traces showing tool calls per execution
- [ ] Cost tracking accurate to $0.001
- [ ] Dashboard filters by agent, date, type
- [ ] Trace timeline renders with <500ms latency

---

### Session 4: HITL Approval + Recovery System

**Background (from handoff - Phase 8+9):**
Existing `checkpoint-manager.ts` has basic checkpoint save/resume. This session implements:
- Checkpoint history tracking (last 10 checkpoints)
- Rollback points for state restoration  
- 5 recovery strategies (retry, rollback, escalate, manual, skip)
- Exponential backoff for retry
- Error classification (timeout, rate_limit, auth, network, resource, logic, dependency)

**Primary Files to Create:**
- `src/lib/approval-gates.ts` - Approval gate configuration
- `src/lib/recovery-manager.ts` - Error recovery strategies
- `src/app/api/approvals/route.ts` - Approvals API
- `src/app/api/recovery/[taskId]/route.ts` - Recovery API
- `src/components/panels/approval-queue-panel.tsx` - Approval queue
- `src/components/panels/recovery-dashboard-panel.tsx` - Recovery dashboard

**Primary Files to Update:**
- `src/lib/task-dispatch.ts` - Add recovery hooks and checkpoints
- `src/app/api/tasks/route.ts` - Add approval checks before task start
- `src/lib/scheduler.ts` - Add recovery orchestration job

**Tasks:**
1. Create approval gate system with configuration modes (ALWAYS, TERMINATE, ON_CONDITION)
2. Implement error classification (timeout, rate_limit, auth, network, resource, logic)
3. Implement 5 recovery strategies (retry, rollback, escalate, skip, fallback)
4. Build approval queue UI panel
5. Build recovery dashboard panel
6. Test recovery for 3 failure scenarios (timeout, rate_limit, auth)

**Dependencies:** Session 1 (checkpoint needed for rollback recovery)

**Success Criteria:**
- [ ] Approval gates pausing on configured tool calls
- [ ] 5 recovery strategies implemented and tested
- [ ] Error recovery working for timeout, rate_limit, auth failures
- [ ] Recovery dashboard shows retry history with breakdown

---

### Session 5: Workflows + Personas
**Primary Files to Create:**
- `src/lib/agent-personas.ts` - Agent persona library
- `src/lib/workflow-executor.ts` - Workflow execution engine
- `src/app/api/workflows/route.ts` - Workflows API
- `src/app/api/workflows/[workflowId]/execute/route.ts` - Execute workflow
- `src/components/workflow-editor/workflow-editor.tsx` - Main editor
- `src/components/workflow-editor/node-palette.tsx` - Node types
- `src/components/workflow-editor/properties-panel.tsx` - Property editor

**Primary Files to Update:**
- `src/lib/db.ts` - Add `workflow_id` and `agent_personality` columns
- `src/lib/migrations.ts` - Add migration `053_workflow_persona_schema`
- `src/lib/event-bus.ts` - Add workflow events
- `src/app/api/tasks/route.ts` - Add workflow trigger hooks

**Tasks:**
1. Create agent persona library (planner, architect, backend, frontend, qa, devops, reviewer, recovery)
2. Build visual workflow editor component (React Flow-based)
3. Create workflow executor engine
4. Implement workflow templates (sequential, hierarchical, parallel, group-chat, swarm)
5. Build persona configuration UI
6. Test workflow execution with 3 different patterns

**Dependencies:** None (independent session)

**Success Criteria:**
- [ ] Workflow editor can create and save workflows
- [ ] 8 agent personas with distinct personalities
- [ ] Workflow execution produces expected output
- [ ] 5 workflow patterns implemented and tested

---

## Dependencies Between Sessions

| Dependency | From Session | To Session | Reason |
|------------|--------------|------------|--------|
| Checkpoint Persistence | Session 1 | Session 3 | Need checkpoint data for complete agent traces |
| Rollback Recovery | Session 1 | Session 4 | Checkpoint data required for rollback strategy |
| Tracing Integration | Session 3 | Session 4 | Telemetry needed for recovery monitoring |

**Parallel Execution Friendly:** Sessions 2, 5 can run independently.

---

## Testing Strategy

### Unit Tests (all sessions)
- Test database operations with in-memory SQLite
- Test API routes with mock auth
- Test recovery strategies with injected errors

### Integration Tests (all sessions)
- Test end-to-end MCP server installation and invocation
- Test memory remember/recall with semantic search
- Test approval gate pause and resume flow
- Test workflow execution with nested tasks

### E2E Tests (main branches only)
- Test full agent workflow with all features enabled
- Test failure recovery end-to-end
- Test cost tracking accuracy

---

## Success Criteria

### Session 1 ✅
- [ ] MCP registry with 100+ servers from online repository
- [ ] Checkpoint save/load working for 10+ agent tasks
- [ ] PostgreSQL backend checkpoint persistence verified

### Session 2 ✅
- [ ] Memory remember/recall working with semantic search
- [ ] Vector search returning relevant context with >80% accuracy
- [ ] Cross-session memory retention tested (save → restart → restore)

### Session 3 ✅
- [ ] Agent traces showing tool calls per execution
- [ ] Cost tracking accurate to $0.001
- [ ] Dashboard filtering by agent, date, type, and status

### Session 4 ✅
- [ ] Approval gates correctly pause on configured tool calls
- [ ] 5 recovery strategies implemented (retry, rollback, escalate, manual, skip)
- [ ] Error classification: timeout, rate_limit, auth, network, resource, logic, dependency
- [ ] Exponential backoff for retry strategy
- [ ] Rollback restores to previous checkpoint stage
- [ ] Recovery dashboard shows retry history with breakdown
- [ ] Scheduler job finds and processes stale tasks

---

## Deployment Checklist

### Pre-Deployment
- [ ] All 5 sessions complete and passing tests
- [ ] Database migrations 051, 052, 053 applied successfully
- [ ] MCP servers tested against real endpoints
- [ ] Approval gates tested in staging environment

### Post-Deployment
- [ ] Monitoring dashboards visible
- [ ] MCP server marketplace accessible
- [ ] Approval queue functional
- [ ] Recovery dashboard showing active tasks

---

## Rollback Plan

If issues arise:
1. Revert migrations 051, 052, 053
2. Remove new files from `src/lib/`
3. Restore old files from git history
4. Clear MCP cache if needed

---

**estimated completion time:** 2-3 hours parallel execution
**estimated file changes:** 25 new files, 10 updated
**Database Migrations:** 3 (051, 052, 053)
