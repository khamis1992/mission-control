import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { buildApplication } from '@/lib/app-builder-executor'

function getTask(taskId: number): any {
  const db = getDatabase()
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
}

function updateTask(taskId: number, updates: Record<string, any>) {
  const db = getDatabase()
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  const values = Object.values(updates)
  values.push(Math.floor(Date.now() / 1000), taskId)
  db.prepare(`UPDATE tasks SET ${setClauses}, updated_at = ? WHERE id = ?`).run(...values)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const taskId = parseInt(id)
  
  try {
    const task = getTask(taskId)
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    if (task.task_type !== 'mission') {
      return NextResponse.json({ 
        error: 'Only mission tasks can build apps' 
      }, { status: 400 })
    }
    
    const context = {
      task,
      workspaceId: task.workspace_id || 1,
      projectPath: `${process.env.WORKSPACES_DIR || '.data/workspaces'}/${task.workspace_id || 1}/${task.id}`
    }
    
    buildApplication(task, context)
      .then(result => {
        console.log(`Build ${taskId} ${result.success ? 'completed' : 'failed'}`)
        
        updateTask(taskId, {
          status: result.success ? 'done' : 'failed'
        })
      })
      .catch(err => {
        console.error(`Build ${taskId} error:`, err)
        
        updateTask(taskId, { status: 'failed' })
      })
    
    return NextResponse.json({ 
      status: 'started', 
      taskId,
      message: 'Build started in background'
    })
    
  } catch (error) {
    console.error('Build app error:', error)
    return NextResponse.json({ 
      error: 'Failed to start build' 
    }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const taskId = parseInt(id)
  
  try {
    const task = getTask(taskId)
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    const checkpoint = task.checkpoint_data ? JSON.parse(task.checkpoint_data) : null
    
    return NextResponse.json({
      taskId,
      status: task.status,
      phase: checkpoint?.state || 'analyzing',
      history: checkpoint?.history || []
    })
    
  } catch (error) {
    console.error('Get build status error:', error)
    return NextResponse.json({ 
      error: 'Failed to get build status' 
    }, { status: 500 })
  }
}