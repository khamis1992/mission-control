import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'

/**
 * Task-memory link statistics response
 */
interface TaskMemoryStatistics {
  totalLinks: number
  linksPerContextType: Record<string, number>
  topMemoryFiles: Array<{ memory_path: string; link_count: number }>
  topTasks: Array<{ task_id: number; link_count: number }>
  dailyTrend: Array<{ date: string; count: number }>
  averageLinksPerTask: number
  tasksWithLinkedMemory: number
  totalTasks: number
  percentageWithLinkedMemory: number
}

/**
 * GET /api/statistics/task-memory
 * Returns statistics about task-memory links for the current workspace
 * 
 * Statistics include:
 *   - Total number of links
 *   - Links per context type (created_from, referenced_in, context_file, result_file, learned_from)
 *   - Top 10 memory files by number of task links
 *   - Top 10 tasks by number of linked memory files
 *   - Daily link creation trend (last 7 days)
 *   - Average links per task
 *   - Percentage of tasks with linked memory (vs total tasks)
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id

    // Get total number of task-memory links for this workspace
    const totalLinksRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM task_memory_links
      WHERE workspace_id = ?
    `).get(workspaceId) as { count: number }
    const totalLinks = totalLinksRow.count

    // Get links per context type
    const contextTypeRows = db.prepare(`
      SELECT link_context, COUNT(*) as count
      FROM task_memory_links
      WHERE workspace_id = ?
      GROUP BY link_context
      ORDER BY count DESC
    `).all(workspaceId) as Array<{ link_context: string; count: number }>

    const linksPerContextType: Record<string, number> = {}
    for (const row of contextTypeRows) {
      linksPerContextType[row.link_context] = row.count
    }

    // Get top 10 memory files by link count
    const topMemoryFiles = db.prepare(`
      SELECT memory_path, COUNT(*) as link_count
      FROM task_memory_links
      WHERE workspace_id = ?
      GROUP BY memory_path
      ORDER BY link_count DESC
      LIMIT 10
    `).all(workspaceId) as Array<{ memory_path: string; link_count: number }>

    // Get top 10 tasks by number of linked memory files
    const topTasks = db.prepare(`
      SELECT task_id, COUNT(*) as link_count
      FROM task_memory_links
      WHERE workspace_id = ?
      GROUP BY task_id
      ORDER BY link_count DESC
      LIMIT 10
    `).all(workspaceId) as Array<{ task_id: number; link_count: number }>

    // Get daily trend for last 7 days
    const now = Math.floor(Date.now() / 1000)
    const sevenDaysAgo = now - (7 * 24 * 60 * 60)

    const dailyTrendRows = db.prepare(`
      SELECT DATE(created_at, 'unixepoch') as date, COUNT(*) as count
      FROM task_memory_links
      WHERE workspace_id = ? AND created_at >= ?
      GROUP BY DATE(created_at, 'unixepoch')
      ORDER BY date ASC
    `).all(workspaceId, sevenDaysAgo) as Array<{ date: string; count: number }>

    // Fill in missing days with zero counts
    const dailyTrend: Array<{ date: string; count: number }> = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date((now - (i * 24 * 60 * 60)) * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const existing = dailyTrendRows.find(r => r.date === dateStr)
      dailyTrend.push({
        date: dateStr,
        count: existing?.count ?? 0
      })
    }

    // Get total tasks for this workspace
    const totalTasksRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE workspace_id = ?
    `).get(workspaceId) as { count: number }
    const totalTasks = totalTasksRow.count

    // Get tasks with at least one linked memory file
    const tasksWithLinksRow = db.prepare(`
      SELECT COUNT(DISTINCT task_id) as count
      FROM task_memory_links
      WHERE workspace_id = ?
    `).get(workspaceId) as { count: number }
    const tasksWithLinkedMemory = tasksWithLinksRow.count

    // Calculate average links per task (avoid division by zero)
    const averageLinksPerTask = totalTasks > 0 ? totalLinks / totalTasks : 0

    // Calculate percentage of tasks with linked memory
    const percentageWithLinkedMemory = totalTasks > 0 
      ? (tasksWithLinkedMemory / totalTasks) * 100 
      : 0

    const statistics: TaskMemoryStatistics = {
      totalLinks,
      linksPerContextType,
      topMemoryFiles,
      topTasks,
      dailyTrend,
      averageLinksPerTask: Math.round(averageLinksPerTask * 100) / 100, // Round to 2 decimal places
      tasksWithLinkedMemory,
      totalTasks,
      percentageWithLinkedMemory: Math.round(percentageWithLinkedMemory * 100) / 100 // Round to 2 decimal places
    }

    // Add cache hints for future caching implementation
    const response = NextResponse.json(statistics)
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    response.headers.set('X-MC-Cache-Key', `task-memory-stats:${workspaceId}`)

    return response
  } catch (error) {
    logger.error({ err: error }, 'GET /api/statistics/task-memory error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}