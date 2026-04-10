# Task-Centric Autonomous Software Factory - Completion Plan

## Status: SCHEMA COMPLETE | UI INCOMPLETE

The database schema has ALL required fields implemented. Missing are the UI extensions inside the Task Details page.

---

## MISSING UI COMPONENTS

### PHASE 5: Task-Embedded Deliberation (Discussion Tab)
- [ ] Add "Discussion" tab inside Task Details
- [ ] Store proposals, critiques, revisions inside task.decisions
- [ ] UI for adding/viewing deliberation threads

### PHASE 8: Artifacts Tab
- [ ] Add "Artifacts" tab inside Task Details
- [ ] Display PRD, architecture, code, logs
- [ ] File viewer/download capability

### PHASE 9: UI Tabs (7 tabs in Task Details)
- [ ] Tab 1: Overview (existing - needs enhancement)
- [ ] Tab 2: Subtasks (tree view - missing)
- [ ] Tab 3: Agents (live status - missing)
- [ ] Tab 4: Discussion (missing - PHASE 5)
- [ ] Tab 5: Artifacts (missing - PHASE 8)
- [ ] Tab 6: Logs (needs enhancement)
- [ ] Tab 7: Recovery (recovery logs view - missing)

### PHASE 10: Realtime Extensions
- [ ] Live agent progress updates
- [ ] Real-time task status changes
- [ ] Live failure notifications

### PHASE 11: Execution Engine Enhancements
- [ ] Status change triggers (pending → planning → executing → reviewing → completed)
- [ ] Dependency resolution triggers
- [ ] Failure detection triggers

### PHASE 12: Demo Scenario Testing
- [ ] Test: "Build car rental system" creates 10+ subtasks
- [ ] Verify parallel execution
- [ ] Verify artifact generation

---

## IMPLEMENTATION TASKS

### Task 1: Task Details Tab Container
- [ ] Find Task Details component (src/components/panels/)
- [ ] Add tab navigation system (Overview, Subtasks, Agents, Discussion, Artifacts, Logs, Recovery)

### Task 2: Subtasks Tab
- [ ] Query subtasks by parent_task_id
- [ ] Display as tree view
- [ ] Show status, agent, progress per subtask

### Task 3: Agents Tab
- [ ] Show assigned agents for task
- [ ] Live status indicator (idle, working, completed, failed)
- [ ] Agent role display

### Task 4: Discussion Tab
- [ ] Add deliberation form (proposal input)
- [ ] Display decision history from task.decisions
- [ ] CRUD for discussion entries

### Task 5: Artifacts Tab
- [ ] List artifacts from task.artifacts JSON
- [ ] File preview capability
- [ ] Download links

### Task 6: Recovery Tab
- [ ] Display recovery_logs JSON
- [ ] Show retry attempts, strategies used
- [ ] Failure history timeline

### Task 7: Realtime Updates
- [ ] Extend SSE/WebSocket for tab-specific updates
- [ ] Progress bar updates
- [ ] Status change broadcasts

### Task 8: Demo Test
- [ ] Create task "Build car rental system"
- [ ] Verify auto-generation of subtasks
- [ ] Verify parallel execution
- [ ] Verify artifact output

---

## FILE LOCATIONS (TO INVESTIGATE)

- Task Details UI: `src/components/panels/task-board-panel.tsx` (144KB - main task UI)
- Task Store: `src/store/` (task-related stores)
- Task API: `src/app/api/tasks/`
- Task types: `src/lib/db.ts` (Task interface)

Also found relevant panels:
- `recovery-dashboard-panel.tsx` - Recovery dashboard
- `orchestration-bar.tsx` - Orchestration UI

---

## PRIORITY ORDER

1. Task Details Tab Container (foundation)
2. Subtasks Tab (core functionality)
3. Discussion Tab (deliberation)
4. Artifacts Tab (output)
5. Recovery Tab (debugging)
6. Agents Tab (monitoring)
7. Logs Tab (enhancement)
8. Realtime Extensions
9. Demo Testing