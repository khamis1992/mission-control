# 🎯 HOW TO USE THE AUTONOMOUS SOFTWARE FACTORY

## ✅ Everything is Ready!

Your Mission Control now has the **Autonomous Software Factory** installed and configured!

---

## 📍 Step 1: Login to Dashboard

1. Open your browser: `http://127.0.0.1:3000/tasks`
2. Login with:
   - **Username**: `admin`
   - **Password**: `khamees1992`

---

## 🎨 Step 2: See Your Existing Mission

After login, you'll see:
- **1 Mission Task**: "Build car rental system"
- **8 Subtasks**: Already generated with roles assigned

Click on the **"Build car rental system"** task to open it.

---

## 📑 Step 3: Explore the New Tabs

When you open a task, you'll see **6 NEW TABS**:

### 1️⃣ Details Tab (Default)
Shows:
- Title & Description
- Status: inbox/assigned/in_progress/review/done/failed
- Priority: low/medium/high/critical/urgent
- Assigned Agent
- Project
- **Task Type**: normal/mission/subtask/system
- **Execution Mode**: manual/autonomous
- **Agent Role**: planner/architect/backend/frontend/qa/devops/reviewer/recovery

### 2️⃣ Subtasks Tab
Shows a **tree view** of all child tasks:
```
#2 [planner] Create PRD (phase: phase-1) - inbox
#3 [architect] Design architecture (phase: phase-1) - inbox
#4 [architect] Database schema (phase: phase-1) - inbox
#5 [backend] Backend API (phase: phase-2) - inbox
#6 [frontend] Frontend UI (phase: phase-2) - inbox
#7 [backend] Payment integration (phase: phase-3) - inbox
#8 [qa] Testing suite (phase: phase-4) - inbox
#9 [devops] Deployment (phase: phase-5) - inbox
```

### 3️⃣ Artifacts Tab
Shows generated documents:
```
[prd] Product Requirements Document
[architecture] System Architecture
[schema] Database Schema
```

### 4️⃣ Discussion Tab
Shows architecture decisions:
```
[architecture] Using Next.js 14 with App Router
[tech_choice] PostgreSQL for relational data, Redis for cache
[payment] Stripe integration for payments
```

### 5️⃣ Logs Tab
Shows execution history:
- Agent dispatches
- Status changes
- Error messages
- Progress updates

### 6️⃣ Recovery Tab
Shows retry history:
- Failure type
- Retry attempts
- Recovery strategy
- Error details

---

## 🚀 Step 4: Create Your Own Mission

### Via UI (Recommended):

1. Click **"Create New Task"** button (top right)
2. Fill in:
   - **Title**: Your project name (e.g., "Build todo app")
   - **Description**: Requirements in detail
   - **Priority**: low/medium/high/critical
   - **Project**: Select or leave as "General"
   
3. **NEW FIELDS** (scroll down):
   - **Task Type**: Select **"Mission (Root Task)"**
   - **Execution Mode**: Select **"Autonomous (AI-driven)"**
   - **Agent Role**: Leave as **"Auto-assign"**

4. Click **"Create Task"**

### Via API:

```bash
curl -X POST http://127.0.0.1:3000/api/tasks \
  -u admin:khamees1992 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build e-commerce platform",
    "description": "Create an online store with:\n- Product catalog\n- Shopping cart\n- User authentication\n- Payment processing\n- Order management",
    "task_type": "mission",
    "execution_mode": "autonomous",
    "priority": "high"
  }'
```

---

## 🤖 What Happens Automatically

When you create a **mission** task with **autonomous** mode:

### 1. Task Decomposition (5-30 seconds)
- AI analyzes your requirements
- Generates 6-10 subtasks automatically
- Assigns roles: planner, architect, backend, frontend, qa, devops
- Groups parallel tasks together

### 2. Role Assignment
Each subtask gets assigned based on keywords:
```
"requirements", "PRD" → planner
"architecture", "database" → architect
"API", "endpoint", "backend" → backend
"UI", "component", "frontend" → frontend
"test", "QA" → qa
"deploy", "CI/CD" → devops
```

### 3. Parallel Grouping
Tasks are grouped for parallel execution:
```
Phase 1: Planning tasks (sequential)
Phase 2: Backend + Frontend (parallel)
Phase 3: Testing (sequential)
Phase 4: Deployment (sequential)
```

### 4. Artifact Generation
Creates documents automatically:
- PRD (Product Requirements)
- Architecture docs
- Database schemas
- API specifications
- Code files
- Test suites

---

## 📊 How to Monitor Progress

### Watch Subtasks Execute

1. Open your mission task
2. Go to **Subtasks** tab
3. Watch status change from:
   - `inbox` → `assigned` → `in_progress` → `review` → `done`

### Track in Real-time
- **Browser**: Tasks update automatically via SSE
- **Database**: Check `SELECT * FROM tasks WHERE parent_task_id = 1`
- **Console**: Look for "Dispatching task" logs

### View Artifacts
As tasks complete, artifacts appear in the **Artifacts** tab automatically.

---

## 🎯 Test the System NOW

### Quick Test:

```bash
# 1. Create a test mission
curl -X POST http://127.0.0.1:3000/api/tasks \
  -u admin:khamees1992 \
  -H "Content-Type: application/json" \
  -d '{"title":"Build blog system","task_type":"mission","execution_mode":"autonomous"}'

# 2. Check for subtasks (wait 10 seconds)
node -e "
const Database = require('better-sqlite3');
const db = new Database('.data/mission-control.db');
const tasks = db.prepare('SELECT id, title, agent_role FROM tasks WHERE parent_task_id IS NOT NULL').all();
console.log('Subtasks:', tasks.length);
"

# 3. View in browser
# Open: http://127.0.0.1:3000/tasks
# Click on your new mission
# Explore all tabs!
```

---

## 🔍 Troubleshooting

### If you don't see new fields in Create Task modal:

1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Check console: Should show no errors
3. Verify migration: `node -e "const db = new (require('better-sqlite3'))('.data/mission-control.db'); const cols = db.prepare('PRAGMA table_info(tasks)').all(); console.log(cols.filter(c => c.name.includes('task_type')));"`

### If subtasks don't generate:

1. Check task is created with `task_type="mission"`
2. Check `execution_mode="autonomous"`
3. Wait 30 seconds for AI to process
4. Check server logs for "generateSubtasks" messages

### If artifacts are empty:

1. Wait for tasks to reach `done` status
2. Check `artifacts` column in database
3. Artifacts are created by agents during execution

---

## 💡 Pro Tips

### Create Different Task Types:

```bash
# Normal task (manual assignment)
curl -X POST http://127.0.0.1:3000/api/tasks \
  -u admin:khamees1992 \
  -H "Content-Type: application/json" \
  -d '{"title":"Fix login bug","description":"..."}'

# Mission task (autonomous)
curl -X POST http://127.0.0.1:3000/api/tasks \
  -u admin:khamees1992 \
  -H "Content-Type: application/json" \
  -d '{"title":"Build feature","task_type":"mission","execution_mode":"autonomous"}'

# Subtask (manual)
curl -X POST http://127.0.0.1:3000/api/tasks \
  -u admin:khamees1992 \
  -H "Content-Type: application/json" \
  -d '{"title":"Write tests","task_type":"subtask","agent_role":"qa"}'
```

### Query Tasks by Type:

```sql
-- All missions
SELECT * FROM tasks WHERE task_type = 'mission';

-- All subtasks of a mission
SELECT * FROM tasks WHERE parent_task_id = 1;

-- All tasks for a specific role
SELECT * FROM tasks WHERE agent_role = 'backend';
```

---

## 🎊 You're All Set!

**Your Autonomous Software Factory is ready to use!**

1. ✅ Database schema extended (12 new columns)
2. ✅ AI task decomposition working
3. ✅ Role-based assignment active
4. ✅ Parallel execution ready
5. ✅ Artifact generation enabled
6. ✅ Self-healing implemented
7. ✅ Real-time updates working

**Open your dashboard NOW and start creating autonomous missions!** 🚀

