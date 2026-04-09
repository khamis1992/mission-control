import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { readLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getDatabase } from '@/lib/db';
import { MEMORY_PATH, MEMORY_ALLOWED_PREFIXES } from '@/lib/memory-path';
import { searchMemory, rebuildIndex } from '@/lib/memory-search';

type LinkContext = 'created_from' | 'referenced_in' | 'context_file' | 'result_file' | 'learned_from';

interface MemoryResult {
  results: { path: string; title: string; snippet: string; rank: number; task_id?: number | null; link_context?: LinkContext | null }[]
  total: number
  indexedFiles: number
  indexedAt: string | null
  contextCounts?: Record<LinkContext, number>
}

interface TaskResult {
  query: string
  results: { id: number; title: string; description: string | null; status: string; priority: string; project_id: number | null; project_name: string | null; ticket_ref: string | null; assigned_to: string | null; created_at: number; score: number; link_context?: LinkContext | null }[]
  total: number
  page: number
  limit: number
  contextCounts?: Record<LinkContext, number>
}

interface UnifiedSearchResponse {
  query: string
  memory: MemoryResult
  tasks: TaskResult
  total: number
  contextCounts?: Record<LinkContext, { memory: number; tasks: number }>
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const limited = readLimiter(request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || searchParams.get('query');
  const limit = Math.min(Math.max(1, Number(searchParams.get('limit') || '20')), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const linkContextParam = searchParams.get('link_context');
  const linkContext: LinkContext | undefined = linkContextParam as LinkContext | undefined;

  const validContexts: LinkContext[] = ['created_from', 'referenced_in', 'context_file', 'result_file', 'learned_from'];
  if (linkContext && !validContexts.includes(linkContext)) {
    return NextResponse.json({ error: `Invalid link_context. Must be one of: ${validContexts.join(', ')}` }, { status: 400 });
  }

  if (!query && !linkContext) {
    return NextResponse.json({ error: 'Query parameter "q" or "link_context" is required' }, { status: 400 });
  }

  const memoryResults = MEMORY_PATH 
    ? await searchMemory(MEMORY_PATH, MEMORY_ALLOWED_PREFIXES, query || '', { limit: Math.floor(limit / 2) }) 
    : { results: [], total: 0, indexedFiles: 0, indexedAt: null };
  
  const taskSearchResults = await searchTasks(getDatabase(), auth.user.workspace_id, query || '', { limit: Math.ceil(limit / 2), offset }, linkContext);

  const filteredMemoryResults = linkContext 
    ? await filterMemoryByContext(getDatabase(), memoryResults, linkContext)
    : memoryResults;

  const contextCounts = await getContextCounts(getDatabase(), auth.user.workspace_id, query || '');

  return NextResponse.json<UnifiedSearchResponse>({
    query: query || '',
    memory: filteredMemoryResults,
    tasks: taskSearchResults,
    total: filteredMemoryResults.total + taskSearchResults.total,
    contextCounts,
  });
}

async function filterMemoryByContext(
  db: ReturnType<typeof getDatabase>, 
  memoryResults: MemoryResult, 
  linkContext: LinkContext
): Promise<MemoryResult> {
  const paths = memoryResults.results.map(r => r.path);
  if (paths.length === 0) return memoryResults;

  const placeholders = paths.map(() => '?').join(',');
  const links = db.prepare(`
    SELECT memory_path, task_id, context
    FROM task_memory_links
    WHERE memory_path IN (${placeholders}) AND context = ?
  `).all(...paths, linkContext) as { memory_path: string; task_id: number; context: LinkContext }[];

  const linkMap = new Map(links.map(l => [l.memory_path, l]));
  
  const filteredResults = memoryResults.results
    .filter(r => linkMap.has(r.path))
    .map(r => ({
      ...r,
      task_id: linkMap.get(r.path)?.task_id ?? null,
      link_context: linkMap.get(r.path)?.context ?? null
    }));

  return {
    ...memoryResults,
    results: filteredResults,
    total: filteredResults.length
  };
}

async function getContextCounts(
  db: ReturnType<typeof getDatabase>,
  workspaceId: number,
  query: string
): Promise<Record<LinkContext, { memory: number; tasks: number }>> {
  const searchPattern = `%${query}%`;
  
  const taskContextCounts = db.prepare(`
    SELECT context, COUNT(DISTINCT t.id) as count
    FROM tasks t
    JOIN task_memory_links tml ON tml.task_id = t.id
    WHERE t.workspace_id = ? AND (t.title LIKE ? OR t.description LIKE ?)
    GROUP BY context
  `).all(workspaceId, searchPattern, searchPattern) as { context: LinkContext; count: number }[];

  const memoryContextCounts = db.prepare(`
    SELECT context, COUNT(*) as count
    FROM task_memory_links
    GROUP BY context
  `).all() as { context: LinkContext; count: number }[];

  const contexts: LinkContext[] = ['created_from', 'referenced_in', 'context_file', 'result_file', 'learned_from'];
  const counts: Record<LinkContext, { memory: number; tasks: number }> = {} as any;

  for (const ctx of contexts) {
    const taskCount = taskContextCounts.find(c => c.context === ctx)?.count ?? 0;
    const memCount = memoryContextCounts.find(c => c.context === ctx)?.count ?? 0;
    counts[ctx] = { memory: memCount, tasks: taskCount };
  }

  return counts;
}

async function searchTasks(
  db: ReturnType<typeof getDatabase>, 
  workspaceId: number, 
  query: string, 
  opts?: { limit?: number; offset?: number }, 
  linkContext?: LinkContext
): Promise<TaskResult> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const searchPattern = `%${query}%`;

  if (linkContext) {
    const tasks = db.prepare(`
      SELECT DISTINCT
        t.id, t.title, t.description, t.status, t.priority,
        t.project_id, p.name as project_name, t.project_ticket_no,
        t.assigned_to, t.created_at, tml.context as link_context,
        CASE 
          WHEN t.title LIKE ? THEN 3.0
          WHEN t.description LIKE ? THEN 2.0
          WHEN t.tags LIKE ? THEN 1.5
          WHEN p.name LIKE ? THEN 1.2
          ELSE 1.0
        END as score
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
      JOIN task_memory_links tml ON tml.task_id = t.id AND tml.context = ?
      WHERE t.workspace_id = ?
        AND (
          t.title LIKE ? OR 
          t.description LIKE ? OR 
          t.tags LIKE ? OR 
          p.name LIKE ? OR
          ? = ''
        )
      ORDER BY score DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(searchPattern, searchPattern, searchPattern, searchPattern, linkContext, workspaceId, searchPattern, searchPattern, searchPattern, searchPattern, query, limit, offset) as any as TaskResult['results'];

    const totalRow = db.prepare(`
      SELECT COUNT(DISTINCT t.id) as total 
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
      JOIN task_memory_links tml ON tml.task_id = t.id AND tml.context = ?
      WHERE t.workspace_id = ? AND (
        t.title LIKE ? OR t.description LIKE ? OR t.tags LIKE ? OR p.name LIKE ? OR ? = ''
      )
    `).get(linkContext, workspaceId, searchPattern, searchPattern, searchPattern, searchPattern, query) as { total?: number };

    return {
      query,
      results: tasks,
      total: totalRow.total ?? 0,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  const tasks = db.prepare(`
    SELECT 
      t.id, t.title, t.description, t.status, t.priority,
      t.project_id, p.name as project_name, t.project_ticket_no,
      t.assigned_to, t.created_at,
      CASE 
        WHEN t.title LIKE ? THEN 3.0
        WHEN t.description LIKE ? THEN 2.0
        WHEN t.tags LIKE ? THEN 1.5
        WHEN p.name LIKE ? THEN 1.2
        ELSE 1.0
      END as score
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
    WHERE t.workspace_id = ?
      AND (
        t.title LIKE ? OR 
        t.description LIKE ? OR 
        t.tags LIKE ? OR 
        p.name LIKE ?
      )
    ORDER BY score DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(searchPattern, searchPattern, searchPattern, searchPattern, workspaceId, searchPattern, searchPattern, searchPattern, searchPattern, limit, offset) as any as TaskResult['results'];

  const totalRow = db.prepare(`
    SELECT COUNT(*) as total FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
    WHERE t.workspace_id = ? AND (
      t.title LIKE ? OR t.description LIKE ? OR t.tags LIKE ? OR p.name LIKE ?
    )
  `).get(workspaceId, searchPattern, searchPattern, searchPattern, searchPattern) as { total?: number };

  return {
    query,
    results: tasks,
    total: totalRow.total ?? 0,
    page: Math.floor(offset / limit) + 1,
    limit,
  };
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = readLimiter(request);
  if (rateCheck) return rateCheck;

  try {
    const body = await request.json();

    if (body.action === 'rebuild-memory-index') {
      if (!MEMORY_PATH) {
        return NextResponse.json({ error: 'Memory directory not configured' }, { status: 500 });
      }
      const result = await rebuildIndex(MEMORY_PATH, MEMORY_ALLOWED_PREFIXES);
      return NextResponse.json({
        success: true,
        message: `Rebuilt memory FTS index: ${result.indexed} files in ${result.duration}ms`,
        ...result,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    logger.error({ err }, 'Unified search POST API error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}