# OpenCode Integration Plan - Fully Autonomous Mission Control

## Objective

Integrate OpenCode AI coding agent into Mission Control to achieve fully autonomous software development. When user says "Build a todo list app", the system should:
1. Generate subtasks automatically
2. Execute each subtask using OpenCode
3. Self-heal on failures
4. Produce working deployed application

---

## Phase 1: OpenCode Infrastructure

### Task 1.1: Install OpenCode
- [ ] Install OpenCode CLI: `npm install -g opencode-ai`
- [ ] Configure API provider (DeepSeek for cost, Claude for quality)
- [ ] Test basic execution: `opencode run "Hello world"`

### Task 1.2: Create OpenCode Wrapper Service
- [ ] Create `src/lib/opencode-agent.ts` - wrapper service
- [ ] Implement: `executeTask(taskDescription, projectPath)` 
- [ ] Handle: stdout/stderr capture, process lifecycle
- [ ] Add: timeout handling, error parsing

### Task 1.3: Create OpenCode Agent Types
- [ ] Define agent configs for different roles:
  - `architect` - Design and planning
  - `developer` - Code implementation  
  - `reviewer` - Code review and QA
  - `tester` - Test writing
  - `deployer` - Deployment automation

---

## Phase 2: Task-OpenCode Integration

### Task 2.1: Connect Auto-Task Generator to OpenCode
- [ ] Modify `src/lib/auto-task-generator.ts` to call OpenCode
- [ ] For each subtask, spawn OpenCode process
- [ ] Capture output, parse for success/failure

### Task 2.2: Parallel Execution with OpenCode
- [ ] Implement parallel_group_id logic
- [ ] Run multiple OpenCode instances simultaneously
- [ ] Track progress per agent

### Task 2.3: Agent Role Assignment
- [ ] Map task.agent_role → OpenCode agent
- [ ] Subtask with `agent_role: backend` → `opencode --agent developer`
- [ ] Subtask with `agent_role: frontend` → `opencode --agent developer`

---

## Phase 3: Self-Healing Integration

### Task 3.1: OpenCode Failure Detection
- [ ] Parse OpenCode output for errors
- [ ] Detect: compilation errors, test failures, runtime errors
- [ ] Classify failure type

### Task 3.2: Auto-Retry with Context
- [ ] On failure, capture error output
- [ ] Re-run OpenCode with error context: "Fix: {error}"
- [ ] Track retry_count, max_retries

### Task 3.3: Recovery Strategy Execution
- [ ] Implement strategies:
  - `retry` - Re-run with error context
  - `reassign` - Change agent role
  - `simplify` - Break task into smaller pieces
- [ ] Log to recovery_logs

---

## Phase 4: Artifact Collection

### Task 4.1: Capture OpenCode Outputs
- [ ] Parse generated files from OpenCode session
- [ ] Store file paths in task.artifacts
- [ ] Categorize: PRD, schema, code, tests, config

### Task 4.2: Artifact Storage
- [ ] Save artifacts to `.data/artifacts/{task_id}/`
- [ ] Index in database: task.artifacts JSON
- [ ] Add download/view capability in UI

---

## Phase 5: UI Enhancements

### Task 5.1: OpenCode Status Panel
- [ ] Show: Running, Completed, Failed status
- [ ] Live output streaming
- [ ] Terminal-style display

### Task 5.2: Agent Management UI
- [ ] List active OpenCode processes
- [ ] Kill/restart capability
- [ ] Resource usage (optional)

### Task 5.3: Configuration Panel
- [ ] Select default model (DeepSeek/Claude/GPT)
- [ ] Configure API keys
- [ ] Set timeout values

---

## Phase 6: Demo Testing

### Task 6.1: Basic Demo
- [ ] Create task: "Build hello world app"
- [ ] Verify OpenCode executes
- [ ] Verify output captured

### Task 6.2: Full Stack Demo
- [ ] Create task: "Build todo list app with React and SQLite"
- [ ] Verify 5+ subtasks generated
- [ ] Verify parallel execution
- [ ] Verify final application works

### Task 6.3: Self-Healing Demo
- [ ] Create task with intentional bug
- [ ] Verify auto-retry triggers
- [ ] Verify recovery succeeds

---

## File Structure (New/Modified)

```
src/lib/
  opencode-agent.ts       (NEW - OpenCode wrapper)
  opencode-config.ts      (NEW - Agent configs)

scripts/
  opencode-worker.ts      (NEW - Background worker)

src/components/
  panels/
    opencode-status-panel.tsx  (NEW - Live status)
    task-details-drawer.tsx    (MODIFIED - Already done)

src/app/api/
  tasks/
    [id]/
      execute.ts    (MODIFIED - Add OpenCode execution)
```

---

## Environment Variables

```env
# OpenCode Configuration
OPENCODE_API_KEY=sk-...           # Required
OPENCODE_DEFAULT_MODEL=deepseek/deepseek-chat
OPENCODE_TIMEOUT=300              # seconds
OPENCODE_MAX_RETRIES=3
```

---

## Priority Order

1. Install and test OpenCode CLI
2. Create wrapper service
3. Connect to auto-task generator
4. Implement parallel execution
5. Add self-healing
6. Demo testing

---

## Success Criteria

- [ ] `opencode run "Build todo app"` produces working code
- [ ] Multiple subtasks execute in parallel
- [ ] Failures auto-retry with error context
- [ ] UI shows live OpenCode progress
- [ ] Full demo "Build todo list app" completes autonomously