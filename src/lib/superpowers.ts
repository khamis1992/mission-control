/**
 * Superpowers-Style Development Workflow for Mission Control
 * 
 * Implements:
 * - brainstorming: Design refinement before code
 * - writing-plans: Detailed implementation plans
 * - subagent-driven-development: Two-stage review process
 * - test-driven-development: RED-GREEN-REFACTOR enforcement
 * - using-git-worktrees: Isolated development branches
 * - finishing-a-development-branch: Merge/PR workflow
 */

import { getDatabase } from './db'
import { eventBus } from './event-bus'
import { logger } from './logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowPhase = 
  | 'brainstorming'    // Design refinement
  | 'planning'         // Implementation planning
  | 'implementing'     // Subagent-driven development
  | 'reviewing'        // Two-stage code review
  | 'finishing'        // Merge/PR decision
  | 'completed'

export interface DesignDoc {
  id: number
  task_id: number
  title: string
  content: string  // Markdown design document
  version: number
  status: 'draft' | 'approved' | 'rejected'
  created_by: string
  created_at: number
  updated_at: number
}

export interface ImplementationPlan {
  id: number
  task_id: number
  design_doc_id: number
  title: string
  content: string  // Markdown plan with tasks
  status: 'draft' | 'approved' | 'in_progress' | 'completed'
  created_by: string
  created_at: number
  updated_at: number
}

export interface PlanTask {
  id: number
  plan_id: number
  task_order: number
  title: string
  description: string
  files_created: string  // JSON array
  files_modified: string // JSON array
  verification_command: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  assignee: string | null
  created_at: number
  completed_at: number | null
}

export interface ReviewStage {
  id: number
  task_id: number
  plan_task_id: number | null
  stage: 'spec_compliance' | 'code_quality'
  status: 'pending' | 'in_progress' | 'approved' | 'rejected'
  reviewer: string
  notes: string
  created_at: number
  completed_at: number | null
}

export interface WorktreeContext {
  id: number
  task_id: number
  worktree_path: string
  branch_name: string
  status: 'active' | 'merged' | 'abandoned'
  created_at: number
  merged_at: number | null
}

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

export function createDesignDoc(taskId: number, title: string, content: string, createdBy: string): DesignDoc {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`
    INSERT INTO superpowers_design_docs (task_id, title, content, version, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 1, 'draft', ?, ?, ?)
  `).run(taskId, title, content, createdBy, now, now)
  
  const doc = db.prepare('SELECT * FROM superpowers_design_docs WHERE task_id = ? ORDER BY version DESC LIMIT 1').get(taskId) as DesignDoc
  
  eventBus.broadcast('superpowers.design_doc_created', {
    task_id: taskId,
    design_doc_id: doc.id,
    title
  })
  
  return doc
}

export function updateDesignDoc(docId: number, content: string): DesignDoc | null {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`
    UPDATE superpowers_design_docs 
    SET content = ?, version = version + 1, updated_at = ?
    WHERE id = ?
  `).run(content, now, docId)
  
  return db.prepare('SELECT * FROM superpowers_design_docs WHERE id = ?').get(docId) as DesignDoc | null
}

export function approveDesignDoc(docId: number): void {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`UPDATE superpowers_design_docs SET status = 'approved', updated_at = ? WHERE id = ?`).run(now, docId)
  
  const doc = db.prepare('SELECT * FROM superpowers_design_docs WHERE id = ?').get(docId) as DesignDoc
  eventBus.broadcast('superpowers.design_approved', { task_id: doc.task_id, doc_id: docId })
}

export function createImplementationPlan(taskId: number, designDocId: number, title: string, content: string, createdBy: string): ImplementationPlan {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`
    INSERT INTO superpowers_plans (task_id, design_doc_id, title, content, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
  `).run(taskId, designDocId, title, content, createdBy, now, now)
  
  const plan = db.prepare('SELECT * FROM superpowers_plans WHERE task_id = ? ORDER BY id DESC LIMIT 1').get(taskId) as ImplementationPlan
  
  eventBus.broadcast('superpowers.plan_created', { task_id: taskId, plan_id: plan.id })
  
  return plan
}

export function addPlanTask(planId: number, taskOrder: number, title: string, description: string, filesCreated: string[], filesModified: string[], verificationCommand: string): PlanTask {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`
    INSERT INTO superpowers_plan_tasks (plan_id, task_order, title, description, files_created, files_modified, verification_command, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(planId, taskOrder, title, description, JSON.stringify(filesCreated), JSON.stringify(filesModified), verificationCommand, now)
  
  const task = db.prepare('SELECT * FROM superpowers_plan_tasks WHERE plan_id = ? AND task_order = ?').get(planId, taskOrder) as PlanTask
  return task
}

export function approvePlan(planId: number): void {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`UPDATE superpowers_plans SET status = 'approved', updated_at = ? WHERE id = ?`).run(now, planId)
  
  const plan = db.prepare('SELECT * FROM superpowers_plans WHERE id = ?').get(planId) as ImplementationPlan
  eventBus.broadcast('superpowers.plan_approved', { task_id: plan.task_id, plan_id: planId })
}

export function createReviewStage(taskId: number, planTaskId: number | null, stage: 'spec_compliance' | 'code_quality', reviewer: string): ReviewStage {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`
    INSERT INTO superpowers_review_stages (task_id, plan_task_id, stage, status, reviewer, created_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(taskId, planTaskId, stage, reviewer, now)
  
  const review = db.prepare('SELECT * FROM superpowers_review_stages WHERE task_id = ? AND stage = ? ORDER BY id DESC LIMIT 1').get(taskId, stage) as ReviewStage
  return review
}

export function completeReviewStage(reviewId: number, status: 'approved' | 'rejected', notes: string): void {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`
    UPDATE superpowers_review_stages 
    SET status = ?, notes = ?, completed_at = ?
    WHERE id = ?
  `).run(status, notes, now, reviewId)
  
  const review = db.prepare('SELECT * FROM superpowers_review_stages WHERE id = ?').get(reviewId) as ReviewStage
  eventBus.broadcast('superpowers.review_completed', { 
    task_id: review.task_id, 
    stage: review.stage, 
    status 
  })
}

export function createWorktree(taskId: number, worktreePath: string, branchName: string): WorktreeContext {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  
  db.prepare(`
    INSERT INTO superpowers_worktrees (task_id, worktree_path, branch_name, status, created_at)
    VALUES (?, ?, ?, 'active', ?)
  `).run(taskId, worktreePath, branchName, now)
  
  const worktree = db.prepare('SELECT * FROM superpowers_worktrees WHERE task_id = ? ORDER BY id DESC LIMIT 1').get(taskId) as WorktreeContext
  return worktree
}

export function getWorkflowState(taskId: number): { phase: WorkflowPhase; designDoc?: DesignDoc; plan?: ImplementationPlan; worktree?: WorktreeContext } | null {
  const db = getDatabase()
  
  const designDoc = db.prepare('SELECT * FROM superpowers_design_docs WHERE task_id = ? AND status = \'approved\' ORDER BY version DESC LIMIT 1').get(taskId) as DesignDoc | undefined
  const plan = db.prepare('SELECT * FROM superpowers_plans WHERE task_id = ? AND status = \'approved\' ORDER BY id DESC LIMIT 1').get(taskId) as ImplementationPlan | undefined
  const worktree = db.prepare('SELECT * FROM superpowers_worktrees WHERE task_id = ? AND status = \'active\' ORDER BY id DESC LIMIT 1').get(taskId) as WorktreeContext | undefined
  
  if (!designDoc) return { phase: 'brainstorming' }
  if (!plan) return { phase: 'planning', designDoc }
  if (worktree) return { phase: 'implementing', designDoc, plan, worktree }
  
  const reviewStages = db.prepare('SELECT * FROM superpowers_review_stages WHERE task_id = ? ORDER BY id DESC LIMIT 2').all(taskId) as ReviewStage[]
  const hasPendingReview = reviewStages.some(r => r.status === 'pending' || r.status === 'in_progress')
  
  if (hasPendingReview) return { phase: 'reviewing', designDoc, plan, worktree }
  
  return { phase: 'finishing', designDoc, plan, worktree }
}

// ---------------------------------------------------------------------------
// Skill Prompts (for LLM invocation)
// ---------------------------------------------------------------------------

export const SUPERPOWERS_SYSTEM_PROMPTS = {
  brainstorming: `You are using the Superpowers brainstorming skill.
    
BEFORE writing any code, you MUST:
1. Explore project context — check files, docs, recent commits
2. Ask clarifying questions — understand purpose/constraints/success criteria  
3. Propose 2-3 approaches with trade-offs
4. Present design in sections for validation
5. Write design doc to docs/superpowers/specs/
6. Get user approval BEFORE proceeding

HARD-GATE: Do NOT write code or take implementation action until user approves design.`,

  writingPlans: `You are using the Superpowers writing-plans skill.
    
Create implementation plans in docs/superpowers/plans/
Each task must be 2-5 minutes with:
- Exact file paths (create/modify/test)
- Code for failing test first (TDD)
- Verification command
- Commit command

NO placeholders. No "TBD", "TODO", or "implement later".`,

  tdd: `You are using the Superpowers test-driven-development skill.
    
FOLLOW RED-GREEN-REFACTOR:
1. RED: Write failing test, verify it fails
2. GREEN: Write minimal code, verify it passes  
3. REFACTOR: Clean up, keep tests green

NO production code without failing test first.`,

  subagentDevelopment: `You are using the Superpowers subagent-driven-development skill.
    
TWO-STAGE REVIEW per task:
1. Dispatch implementer subagent
2. Dispatch spec compliance reviewer (verify code matches spec)
3. Dispatch code quality reviewer (verify clean/tested code)
4. Only proceed after both stages approve`,

  worktree: `You are using the Superpowers using-git-worktrees skill.
    
Create isolated worktree before implementation:
1. git worktree add <path> -b <branch>
2. Run project setup
3. Verify clean test baseline
4. Report worktree ready`,

  finishing: `You are using the Superpowers finishing-a-development-branch skill.
    
Before completing:
1. Verify all tests pass
2. Present merge/PR/discard options
3. Clean up worktree after merge`
}

// ---------------------------------------------------------------------------
// Workflow Orchestration
// ---------------------------------------------------------------------------

export async function startSuperpowersWorkflow(taskId: number, taskTitle: string, description: string | null, userId: string): Promise<{ phase: WorkflowPhase; designDoc?: DesignDoc }> {
  logger.info({ taskId, title: taskTitle }, 'Starting Superpowers workflow')
  
  // Phase 1: Brainstorming - create initial design doc
  const content = `# Design Document: ${taskTitle}

## Overview
${description || 'TBD'}

## Goals
- 

## Architecture
- 

## Components
- 

## Data Flow
- 

## Error Handling
- 

## Testing Strategy
- 

## Success Criteria
- [ ] 
`
  
  const designDoc = createDesignDoc(taskId, taskTitle, content, userId)
  
  eventBus.broadcast('superpowers.workflow_started', {
    task_id: taskId,
    phase: 'brainstorming',
    design_doc_id: designDoc.id
  })
  
  return { phase: 'brainstorming', designDoc }
}

export function advanceToPlanning(taskId: number, planTitle: string, planContent: string, userId: string): { phase: WorkflowPhase; plan: ImplementationPlan } {
  const db = getDatabase()
  
  // Get approved design doc
  const designDoc = db.prepare('SELECT * FROM superpowers_design_docs WHERE task_id = ? AND status = \'approved\' ORDER BY version DESC LIMIT 1').get(taskId) as DesignDoc
  
  if (!designDoc) {
    throw new Error('Cannot create plan: design doc not approved')
  }
  
  const plan = createImplementationPlan(taskId, designDoc.id, planTitle, planContent, userId)
  
  return { phase: 'planning', plan }
}

export function startImplementation(taskId: number, worktreePath: string, branchName: string): { phase: WorkflowPhase; worktree: WorktreeContext } {
  const worktree = createWorktree(taskId, worktreePath, branchName)
  
  return { phase: 'implementing', worktree }
}