# Preload Skills into Mission Control Database

## TL;DR

Convert Mission Control's bundled skills from `skill.json` format to `SKILL.md` format so they sync to the database automatically. This ensures the skills are available on fresh VPS deployments without manual installation.

**Deliverables**:
- `skills/mission-control-manage/SKILL.md` - Management skill in SKILL.md format
- `skills/mission-control-installer/SKILL.md` - Installer skill in SKILL.md format
- Optional: `scripts/seed-skills.js` - Script to preload skills programmatically

**Estimated Effort**: Quick (15-20 minutes)
**Parallel Execution**: YES - 2 tasks can run in parallel

---

## Context

### Problem
Mission Control's skill sync system (`skill-sync.ts`) looks for `SKILL.md` files in skill directories to sync them to the database. Currently, the bundled skills (`mission-control-manage` and `mission-control-installer`) use the older `skill.json` + `README.md` format, which means:

1. They don't appear in the Skills Hub UI
2. They won't be available on fresh VPS deployments
3. The database shows 0 skills after `pnpm build`

### Solution
Convert both skills to the `SKILL.md` format while preserving all metadata from `skill.json`.

### Current State
- **Skills Directory**: `C:\Users\khamis\Documents\mission-control\skills/`
- **Skills Present**: `mission-control-manage/`, `mission-control-installer/`
- **Current Format**: `skill.json` + `README.md`
- **Target Format**: `SKILL.md` (replaces README, metadata in frontmatter)
- **Database**: Empty (0 skills currently synced)

---

## Work Objectives

### Core Objective
Convert bundled skills to SKILL.md format so they automatically sync to the database on build/start.

### Concrete Deliverables
1. `skills/mission-control-manage/SKILL.md` - Converted from README.md + skill.json
2. `skills/mission-control-installer/SKILL.md` - Converted from README.md + skill.json

### Definition of Done
- [ ] Both skills have valid `SKILL.md` files
- [ ] Skill sync runs successfully (`pnpm dev` or manual sync)
- [ ] Skills appear in database query
- [ ] Skills are visible in Skills Hub UI

### Must Have
- Preserve all metadata from `skill.json` (name, version, author, license, tags)
- Include full documentation content from README.md
- Follow SKILL.md format conventions

### Must NOT Have (Guardrails)
- Do NOT delete the original `skill.json` files (keep for backward compatibility)
- Do NOT modify README.md content structure significantly
- Do NOT change skill names or identifiers

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (no automated tests for skills)
- **Automated tests**: NO
- **Agent-Executed QA**: YES - Manual verification via UI and API

### QA Scenarios
Each task will include agent-executed verification steps using Playwright for UI verification and Bash for database queries.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - can run in parallel):
├── Task 1: Create mission-control-manage/SKILL.md
└── Task 2: Create mission-control-installer/SKILL.md

Wave 2 (After Wave 1 - verification):
└── Task 3: Verify skills sync to database and appear in UI
```

### Agent Dispatch Summary
- **Wave 1**: 2 tasks → `quick` category (file creation)
- **Wave 2**: 1 task → `quick` category (verification)

---

## TODOs

- [ ] 1. Create mission-control-manage/SKILL.md

  **What to do**:
  Create `skills/mission-control-manage/SKILL.md` by combining metadata from `skill.json` with content from `README.md`.
  
  **File content structure**:
  ```markdown
  # Mission Control Management Skill

  Manage a running Mission Control instance programmatically.

  ## Overview
  ... (from README.md)

  ## Metadata
  - **Name**: mission-control-manage
  - **Version**: 1.0.0
  - **Author**: Builderz Labs
  - **License**: MIT
  - **Tags**: mission-control, management, health, upgrade, backup
  ```

  **Source files to reference**:
  - `skills/mission-control-manage/skill.json` - Extract metadata
  - `skills/mission-control-manage/README.md` - Extract content

  **Must NOT do**:
  - Do NOT delete skill.json or README.md
  - Do NOT change the skill name or description

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: Simple file creation with content assembly
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] File `skills/mission-control-manage/SKILL.md` exists
  - [ ] File contains `# Mission Control Management Skill` header
  - [ ] File includes metadata section at the end
  - [ ] File includes all content from README.md
  - [ ] File is valid markdown (no syntax errors)

  **QA Scenarios**:
  ```
  Scenario: Verify SKILL.md was created correctly
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: cat skills/mission-control-manage/SKILL.md
      2. Verify file exists and is not empty
      3. Verify content starts with "# Mission Control Management Skill"
    Expected Result: File exists with proper content structure
    Evidence: .sisyphus/evidence/task-1-skill-created.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): add SKILL.md for mission-control-manage`
  - Files: `skills/mission-control-manage/SKILL.md`

---

- [ ] 2. Create mission-control-installer/SKILL.md

  **What to do**:
  Create `skills/mission-control-installer/SKILL.md` by combining metadata from `skill.json` with content from `README.md`.
  
  **File content structure**:
  ```markdown
  # Mission Control Installer Skill

  Install and configure Mission Control on any Linux or macOS system.

  ## Overview
  ... (from README.md)

  ## Metadata
  - **Name**: mission-control-installer
  - **Version**: 1.0.0
  - **Author**: Builderz Labs
  - **License**: MIT
  - **Tags**: mission-control, dashboard, installer, docker
  ```

  **Source files to reference**:
  - `skills/mission-control-installer/skill.json` - Extract metadata
  - `skills/mission-control-installer/README.md` - Extract content

  **Must NOT do**:
  - Do NOT delete skill.json or README.md
  - Do NOT change the skill name or description

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: Simple file creation with content assembly
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] File `skills/mission-control-installer/SKILL.md` exists
  - [ ] File contains `# Mission Control Installer Skill` header
  - [ ] File includes metadata section at the end
  - [ ] File includes all content from README.md
  - [ ] File is valid markdown (no syntax errors)

  **QA Scenarios**:
  ```
  Scenario: Verify SKILL.md was created correctly
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: cat skills/mission-control-installer/SKILL.md
      2. Verify file exists and is not empty
      3. Verify content starts with "# Mission Control Installer Skill"
    Expected Result: File exists with proper content structure
    Evidence: .sisyphus/evidence/task-2-skill-created.txt
  ```

  **Commit**: YES
  - Message: `feat(skills): add SKILL.md for mission-control-installer`
  - Files: `skills/mission-control-installer/SKILL.md`

---

- [ ] 3. Verify skills sync to database

  **What to do**:
  Trigger the skill sync process and verify both skills appear in the database.
  
  **Steps**:
  1. Run the skill sync function or restart the dev server
  2. Query the database to verify skills were added
  3. Optionally verify skills appear in the Skills Hub UI

  **Source files to reference**:
  - `src/lib/skill-sync.ts` - Understanding the sync mechanism
  - `src/lib/db.ts` - Database connection

  **Must NOT do**:
  - Do NOT manually insert skills into the database (let sync do it)
  - Do NOT modify sync logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: Verification and testing
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 1-2)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1, Task 2

  **Acceptance Criteria**:
  - [ ] Run skill sync (via `node scripts/sync-skills.js` or server restart)
  - [ ] Query database: `SELECT name, source FROM skills` returns 2 rows
  - [ ] Skills have `source='project-agents'` (or appropriate source based on location)
  - [ ] Skills are visible at `http://127.0.0.1:3000/skills` (after login)

  **QA Scenarios**:
  ```
  Scenario: Verify skills in database
    Tool: Bash
    Preconditions: Tasks 1-2 complete, dev server running or manual sync
    Steps:
      1. Run sync: node -e "const { syncSkillsFromDisk } = require('./src/lib/skill-sync'); syncSkillsFromDisk().then(console.log)"
      2. Query DB: node -e "const db = require('better-sqlite3')('.data/mission-control.db'); console.log(db.prepare('SELECT name FROM skills').all())"
      3. Verify output contains: [{name: 'mission-control-manage'}, {name: 'mission-control-installer'}]
    Expected Result: Database contains both skills
    Evidence: .sisyphus/evidence/task-3-database-query.json

  Scenario: Verify skills in UI (optional - requires running server)
    Tool: Playwright
    Preconditions: Dev server running at localhost:3000, logged in
    Steps:
      1. Navigate to http://127.0.0.1:3000/skills
      2. Look for "mission-control-manage" and "mission-control-installer" in the skills list
    Expected Result: Both skills appear in the Skills Hub
    Evidence: .sisyphus/evidence/task-3-ui-screenshot.png
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

After all tasks complete:

- [ ] **F1. Database Verification** - `quick`
  - Query database and confirm 2 skills exist
  - Verify skills have proper metadata (name, description, content_hash)

- [ ] **F2. Filesystem Verification** - `quick`
  - Confirm both SKILL.md files exist
  - Verify original skill.json and README.md still exist

- [ ] **F3. UI Verification** (optional) - `quick`
  - If server is running, take screenshot of Skills Hub
  - Confirm both skills are visible

**All verifications must pass before marking complete.**

---

## Commit Strategy

- **Task 1**: `feat(skills): add SKILL.md for mission-control-manage`
- **Task 2**: `feat(skills): add SKILL.md for mission-control-installer`
- **Task 3**: No commit (verification only)

---

## Success Criteria

### Final Checklist
- [ ] `skills/mission-control-manage/SKILL.md` exists and is valid
- [ ] `skills/mission-control-installer/SKILL.md` exists and is valid
- [ ] Both original `skill.json` files preserved
- [ ] Both original `README.md` files preserved
- [ ] Database contains 2 skills after sync
- [ ] Skills are visible in Skills Hub UI (when server is running)

### Verification Commands
```bash
# Check files exist
ls -la skills/*/SKILL.md

# Check database
node -e "const db = require('better-sqlite3')('.data/mission-control.db'); console.log(db.prepare('SELECT name, source FROM skills').all())"

# Expected output:
# [ { name: 'mission-control-manage', source: 'project-agents' },
#   { name: 'mission-control-installer', source: 'project-agents' } ]
```

---

## Notes for VPS Deployment

When you push this to GitHub and deploy to your VPS:

1. The `SKILL.md` files will be in the repository
2. On first start, `skill-sync.ts` will scan the skills directory
3. It will find the SKILL.md files and insert them into SQLite
4. The skills will be available immediately without manual installation

This approach is better than seeding via migration because:
- Skills stay in sync with filesystem changes
- Content hashes are calculated automatically
- Security scanning can be applied
- Source tracking (which skill root they came from)
