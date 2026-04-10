import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'
import { 
  startSuperpowersWorkflow, 
  getWorkflowState,
  SUPERPOWERS_SYSTEM_PROMPTS
} from '@/lib/superpowers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const taskId = parseInt(id)
  
  try {
    const state = getWorkflowState(taskId)
    return NextResponse.json({ workflow: state })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get workflow state' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const taskId = parseInt(id)
  
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { action, content, title } = body
    
    const db = getDatabase()
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    switch (action) {
      case 'start': {
        const result = await startSuperpowersWorkflow(taskId, task.title, task.description, user.username)
        return NextResponse.json({ 
          phase: result.phase, 
          design_doc_id: result.designDoc?.id,
          message: 'Brainstorming phase started. Review and approve the design document before proceeding.' 
        })
      }
      
      case 'update_design': {
        const doc = db.prepare('SELECT * FROM superpowers_design_docs WHERE task_id = ? ORDER BY version DESC LIMIT 1').get(taskId) as any
        if (!doc) {
          return NextResponse.json({ error: 'No design doc found. Start workflow first.' }, { status: 400 })
        }
        
        if (content) {
          db.prepare('UPDATE superpowers_design_docs SET content = ?, updated_at = ? WHERE id = ?')
            .run(content, Math.floor(Date.now() / 1000), doc.id)
        }
        
        return NextResponse.json({ design_doc_id: doc.id, message: 'Design document updated' })
      }
      
      case 'approve_design': {
        const doc = db.prepare('SELECT * FROM superpowers_design_docs WHERE task_id = ? ORDER BY version DESC LIMIT 1').get(taskId) as any
        if (!doc) {
          return NextResponse.json({ error: 'No design doc found' }, { status: 400 })
        }
        
        db.prepare('UPDATE superpowers_design_docs SET status = ?, updated_at = ? WHERE id = ?')
          .run('approved', Math.floor(Date.now() / 1000), doc.id)
        
        return NextResponse.json({ 
          message: 'Design approved. Now create an implementation plan.',
          prompts: {
            writingPlans: SUPERPOWERS_SYSTEM_PROMPTS.writingPlans
          }
        })
      }
      
      case 'reject_design': {
        const doc = db.prepare('SELECT * FROM superpowers_design_docs WHERE task_id = ? ORDER BY version DESC LIMIT 1').get(taskId) as any
        if (!doc) {
          return NextResponse.json({ error: 'No design doc found' }, { status: 400 })
        }
        
        db.prepare('UPDATE superpowers_design_docs SET status = ?, updated_at = ? WHERE id = ?')
          .run('rejected', Math.floor(Date.now() / 1000), doc.id)
        
        return NextResponse.json({ message: 'Design rejected. Please revise and try again.' })
      }
      
      case 'create_plan': {
        const doc = db.prepare('SELECT * FROM superpowers_design_docs WHERE task_id = ? AND status = \'approved\' ORDER BY version DESC LIMIT 1').get(taskId) as any
        if (!doc) {
          return NextResponse.json({ error: 'Design must be approved before creating a plan' }, { status: 400 })
        }
        
        const planTitle = title || `${task.title} Implementation Plan`
        const planContent = content || `# Implementation Plan: ${task.title}

> **For agentic workers:** Use subagent-driven-development skill to implement this plan.

## Goal
${doc.content.split('## Goals')[1]?.split('##')[0] || 'TBD'}

## Tasks

### Task 1: 
- [ ] **Step 1: Write failing test**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify pass**
- [ ] **Step 5: Commit**
`
        
        db.prepare(`
          INSERT INTO superpowers_plans (task_id, design_doc_id, title, content, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
        `).run(taskId, doc.id, planTitle, planContent, user.username, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000))
        
        const plan = db.prepare('SELECT * FROM superpowers_plans WHERE task_id = ? ORDER BY id DESC LIMIT 1').get(taskId) as any
        
        return NextResponse.json({ 
          plan_id: plan.id,
          message: 'Implementation plan created. Review and approve before starting implementation.' 
        })
      }
      
      case 'approve_plan': {
        const plan = db.prepare('SELECT * FROM superpowers_plans WHERE task_id = ? ORDER BY id DESC LIMIT 1').get(taskId) as any
        if (!plan) {
          return NextResponse.json({ error: 'No plan found' }, { status: 400 })
        }
        
        db.prepare('UPDATE superpowers_plans SET status = ?, updated_at = ? WHERE id = ?')
          .run('approved', Math.floor(Date.now() / 1000), plan.id)
        
        return NextResponse.json({ 
          message: 'Plan approved. Ready to implement.',
          prompts: {
            subagentDevelopment: SUPERPOWERS_SYSTEM_PROMPTS.subagentDevelopment,
            tdd: SUPERPOWERS_SYSTEM_PROMPTS.tdd,
            worktree: SUPERPOWERS_SYSTEM_PROMPTS.worktree
          }
        })
      }
      
      case 'create_worktree': {
        const plan = db.prepare('SELECT * FROM superpowers_plans WHERE task_id = ? AND status = \'approved\' ORDER BY id DESC LIMIT 1').get(taskId) as any
        if (!plan) {
          return NextResponse.json({ error: 'Approved plan required before creating worktree' }, { status: 400 })
        }
        
        const { worktreePath, branchName } = body
        if (!worktreePath || !branchName) {
          return NextResponse.json({ error: 'worktreePath and branchName required' }, { status: 400 })
        }
        
        db.prepare(`
          INSERT INTO superpowers_worktrees (task_id, worktree_path, branch_name, status, created_at)
          VALUES (?, ?, ?, 'active', ?)
        `).run(taskId, worktreePath, branchName, Math.floor(Date.now() / 1000))
        
        db.prepare('UPDATE superpowers_plans SET status = ?, updated_at = ? WHERE id = ?')
          .run('in_progress', Math.floor(Date.now() / 1000), plan.id)
        
        return NextResponse.json({ 
          message: `Worktree created at ${worktreePath} on branch ${branchName}`,
          prompts: {
            tdd: SUPERPOWERS_SYSTEM_PROMPTS.tdd
          }
        })
      }
      
      case 'request_review': {
        const { stage, planTaskId } = body
        const reviewStage = stage || 'spec_compliance'
        
        db.prepare(`
          INSERT INTO superpowers_review_stages (task_id, plan_task_id, stage, status, reviewer, created_at)
          VALUES (?, ?, ?, 'pending', ?, ?)
        `).run(taskId, planTaskId || null, reviewStage, 'aegis', Math.floor(Date.now() / 1000))
        
        return NextResponse.json({ 
          message: `Review requested for ${reviewStage} stage`,
          prompts: {
            specCompliance: 'Verify code matches spec. Read actual code - do not trust implementer report.',
            codeQuality: 'Verify clean, tested, maintainable code. Only after spec compliance passes.'
          }
        })
      }
      
      case 'complete_review': {
        const { reviewId, status, notes } = body
        if (!reviewId || !status) {
          return NextResponse.json({ error: 'reviewId and status required' }, { status: 400 })
        }
        
        db.prepare(`
          UPDATE superpowers_review_stages 
          SET status = ?, notes = ?, completed_at = ?
          WHERE id = ?
        `).run(status, notes || '', Math.floor(Date.now() / 1000), reviewId)
        
        if (status === 'approved') {
          const pendingReviews = db.prepare(`
            SELECT COUNT(*) as c FROM superpowers_review_stages 
            WHERE task_id = ? AND status = 'pending'
          `).get(taskId) as any
          
          if (pendingReviews.c === 0) {
            db.prepare('UPDATE superpowers_plans SET status = ?, updated_at = ? WHERE task_id = ?')
              .run('completed', Math.floor(Date.now() / 1000), taskId)
          }
        }
        
        return NextResponse.json({ message: `Review ${status}` })
      }
      
      case 'finish': {
        const worktree = db.prepare('SELECT * FROM superpowers_worktrees WHERE task_id = ? AND status = \'active\' ORDER BY id DESC LIMIT 1').get(taskId) as any
        
        if (worktree) {
          db.prepare('UPDATE superpowers_worktrees SET status = ?, merged_at = ? WHERE id = ?')
            .run('merged', Math.floor(Date.now() / 1000), worktree.id)
        }
        
        return NextResponse.json({ 
          message: 'Development branch ready for merge/PR',
          prompts: {
            finishing: SUPERPOWERS_SYSTEM_PROMPTS.finishing
          }
        })
      }
      
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json({ error: 'Workflow error' }, { status: 500 })
  }
}