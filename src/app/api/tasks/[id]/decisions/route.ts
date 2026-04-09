import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { addDecision } from '@/lib/artifact-manager'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const taskId = parseInt(id, 10)
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { type, summary, content, author } = body

    if (!type || !summary) {
      return NextResponse.json({ error: 'type and summary are required' }, { status: 400 })
    }

    const decision = {
      type: type as 'planning' | 'architecture' | 'implementation' | 'review' | 'escalation',
      summary,
      content: content || '',
      author: author || auth.user.username,
      timestamp: Date.now()
    }

    addDecision(taskId, decision)
    
    return NextResponse.json({ 
      ok: true, 
      decision,
      message: 'Decision added successfully' 
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
