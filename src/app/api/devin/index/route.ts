import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { indexProject, searchProject, repositoryIndexer, type IndexResult, type KnowledgeNode } from '@/lib/repo-indexer'
import { getDatabase } from '@/lib/db'

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { projectPath, projectId } = body

    if (!projectPath) {
      return NextResponse.json({ error: 'Missing required field: projectPath' }, { status: 400 })
    }

    const db = getDatabase()
    let targetProjectId = projectId

    if (!targetProjectId) {
      const result = db.prepare(
        'INSERT INTO projects (name, slug, workspace_id, created_at) VALUES (?, ?, ?, ?)'
      ).run(
        projectPath.split('/').pop() || 'indexed-project',
        `proj-${Date.now()}`,
        auth.user.workspace_id ?? 1,
        Math.floor(Date.now() / 1000)
      )
      targetProjectId = result.lastInsertRowid
    }

    const indexResult: IndexResult = await indexProject(targetProjectId as number, projectPath)

    return NextResponse.json(indexResult)
  } catch (error) {
    return NextResponse.json({ error: 'Indexing failed', details: String(error) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const projectId = parseInt(searchParams.get('projectId') || '0', 10)
    const query = searchParams.get('query')
    const diagram = searchParams.get('diagram') === 'true'

    if (!projectId) {
      return NextResponse.json({ error: 'Missing required query param: projectId' }, { status: 400 })
    }

    if (query) {
      const results: KnowledgeNode[] = await searchProject(projectId, query)
      return NextResponse.json({ results })
    }

    if (diagram) {
      const mermaid = repositoryIndexer.generateMermaidDiagram(projectId)
      return NextResponse.json({ diagram: mermaid })
    }

    const index = await repositoryIndexer.getIndex(projectId)
    return NextResponse.json(index || { error: 'Index not found' }, { status: index ? 200 : 404 })
  } catch (error) {
    return NextResponse.json({ error: 'Search failed', details: String(error) }, { status: 500 })
  }
}