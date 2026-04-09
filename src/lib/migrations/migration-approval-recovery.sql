-- Mission Control Session 4: HITL Approval Gates + Recovery System
-- Adds approval gates, requests, and recovery tracking columns

-- Approval gates table
CREATE TABLE IF NOT EXISTS approval_gates (
  id TEXT PRIMARY KEY,
  task_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  condition TEXT NOT NULL,
  mode TEXT NOT NULL,
  approvers TEXT,
  timeout INTEGER NOT NULL DEFAULT 3600,
  escalation_path TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  approved_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_approval_gates_task_id ON approval_gates(task_id);
CREATE INDEX IF NOT EXISTS idx_approval_gates_mode ON approval_gates(mode);

-- Approval requests table
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  gate_id TEXT NOT NULL,
  task_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  payload TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (gate_id) REFERENCES approval_gates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_task_id ON approval_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_agent_id ON approval_requests(agent_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);

-- Add recovery tracking columns to tasks table
ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 3;
ALTER TABLE tasks ADD COLUMN recovery_strategy TEXT;
ALTER TABLE tasks ADD COLUMN failure_type TEXT;
ALTER TABLE tasks ADD COLUMN recovery_logs TEXT;
ALTER TABLE tasks ADD COLUMN error_message TEXT;

-- Add indexes for recovery tracking
CREATE INDEX IF NOT EXISTS idx_tasks_recovery_strategy ON tasks(recovery_strategy);
CREATE INDEX IF NOT EXISTS idx_tasks_failure_type ON tasks(failure_type);
CREATE INDEX IF NOT EXISTS idx_tasks_retry_count ON tasks(retry_count);
