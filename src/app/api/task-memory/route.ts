import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'

/**
 * Task-memory link interface
 */
interface TaskMemoryLink {
  id: number
  task_id: number
  memory_path: string
  link_context: string
  created_by: string
  created_at: number
}

/**
 * GET /api/task-memory
 * Query params:
 *   - task_id: Get all memory links for a specific task
 *   - path: Get all tasks linked to a specific memory path
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id
    const { searchParams } = new URL(request.url)
    const taskIdParam = searchParams.get('task_id')
    const pathParam = searchParams.get('path')

    if (!taskIdParam && !pathParam) {
      return NextResponse.json(
        { error: 'Either task_id or path query parameter is required' },
        { status: 400 }
      )
    }

    if (taskIdParam) {
      const taskId = parseInt(taskIdParam, 10)
      if (isNaN(taskId) || taskId <= 0) {
        return NextResponse.json({ error: 'Invalid task_id' }, { status: 400 })
      }

      const task = db.prepare(`
        SELECT id FROM tasks WHERE id = ? AND workspace_id = ?
      `).get(taskId, workspaceId) as { id: number } | undefined

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }

      const links = db.prepare(`
        SELECT id, task_id, memory_path, link_context, created_by, created_at
        FROM task_memory_links
        WHERE task_id = ? AND workspace_id = ?
        ORDER BY created_at DESC
      `).all(taskId, workspaceId) as TaskMemoryLink[]

      return NextResponse.json({ links, total: links.length })
    }

    if (pathParam) {
      const path = pathParam.trim()
      if (!path) {
        return NextResponse.json({ error: 'Invalid path parameter' }, { status: 400 })
      }

      const links = db.prepare(`
        SELECT tm.id, tm.task_id, tm.memory_path, tm.link_context, tm.created_by, tm.created_at
        FROM task_memory_links tm
        JOIN tasks t ON t.id = tm.task_id
        WHERE tm.memory_path = ? AND t.workspace_id = ?
        ORDER BY tm.created_at DESC
      `).all(path, workspaceId) as TaskMemoryLink[]

      return NextResponse.json({ links, total: links.length })
    }

    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/task-memory error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/task-memory
 * Create a new task-memory link
 * Body: { task_id: number, memory_path: string, link_context: string, created_by: string }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = mutationLimiter(request)
  if (limited) return limited

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id
    const username = auth.user.username

    const body = await request.json()
    const { task_id, memory_path, link_context, created_by } = body

    if (typeof task_id !== 'number' || task_id <= 0) {
      return NextResponse.json({ error: 'task_id is required and must be a positive number' }, { status: 400 })
    }

    if (typeof memory_path !== 'string' || !memory_path.trim()) {
      return NextResponse.json({ error: 'memory_path is required and must be a non-empty string' }, { status: 400 })
    }

    if (typeof link_context !== 'string' || !link_context.trim()) {
      return NextResponse.json({ error: 'link_context is required and must be a non-empty string' }, { status: 400 })
    }

    const task = db.prepare(`
      SELECT id FROM tasks WHERE id = ? AND workspace_id = ?
    `).get(task_id, workspaceId) as { id: number } | undefined

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const createdBy = created_by?.trim() || username
    const now = Math.floor(Date.now() / 1000)

    const result = db.prepare(`
      INSERT INTO task_memory_links (task_id, memory_path, link_context, created_by, workspace_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(task_id, memory_path.trim(), link_context.trim(), createdBy, workspaceId, now)

    const link = db.prepare(`
      SELECT id, task_id, memory_path, link_context, created_by, created_at
      FROM task_memory_links
      WHERE id = ?
    `).get(result.lastInsertRowid) as TaskMemoryLink

    return NextResponse.json({ link }, { status: 201 })
  } catch (error: any) {
    logger.error({ err: error }, 'POST /api/task-memory error')
    
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.message?.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'This task-memory link already exists' }, { status: 409 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/task-memory
 * Remove a task-memory link
 * Body: { task_id: number, memory_path: string, link_context?: string }
 */
export async function DELETE(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = mutationLimiter(request)
  if (limited) return limited

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id

    const body = await request.json()
    const { task_id, memory_path, link_context } = body

    if (typeof task_id !== 'number' || task_id <= 0) {
      return NextResponse.json({ error: 'task_id is required and must be a positive number' }, { status: 400 })
    }

    if (typeof memory_path !== 'string' || !memory_path.trim()) {
      return NextResponse.json({ error: 'memory_path is required and must be a non-empty string' }, { status: 400 })
    }

    let query = `
      DELETE FROM task_memory_links
      WHERE task_id = ? AND memory_path = ? AND workspace_id = ?
    `
    const params: any[] = [task_id, memory_path.trim(), workspaceId]

    if (link_context !== undefined && link_context !== null) {
      if (typeof link_context !== 'string') {
        return NextResponse.json({ error: 'link_context must be a string if provided' }, { status: 400 })
      }
      query += ' AND link_context = ?'
      params.push(link_context)
    }

    const result = db.prepare(query).run(...params)

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Task-memory link not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, deleted: result.changes })
  } catch (error) {
    logger.error({ err: error }, 'DELETE /api/task-memory error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}