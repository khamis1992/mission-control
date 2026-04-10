import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  saveSessionCheckpoint,
  loadSessionCheckpoint,
  getRelevantLearnings,
  extractLearnings,
  type SessionCheckpoint,
  type Learning,
  type Message
} from '@/lib/session-persistence'

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { action, sessionId, checkpoint, taskId, outcome, transcript } = body

    if (action === 'checkpoint') {
      if (!sessionId || !checkpoint) {
        return NextResponse.json({ error: 'Missing sessionId or checkpoint' }, { status: 400 })
      }
      await saveSessionCheckpoint(checkpoint as SessionCheckpoint)
      return NextResponse.json({ success: true })
    }

    if (action === 'extract-learnings') {
      if (!sessionId || !taskId || !outcome || !transcript) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }
      await extractLearnings(sessionId, taskId, outcome, transcript as Message[])
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Session operation failed', details: String(error) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'load'
    const sessionId = searchParams.get('sessionId')
    const taskDescription = searchParams.get('taskDescription')
    const limit = parseInt(searchParams.get('limit') || '5', 10)

    if (action === 'load') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
      }
      const checkpoint = await loadSessionCheckpoint(sessionId)
      return NextResponse.json(checkpoint || { error: 'Checkpoint not found' }, { status: checkpoint ? 200 : 404 })
    }

    if (action === 'learnings') {
      if (!taskDescription) {
        return NextResponse.json({ error: 'Missing taskDescription' }, { status: 400 })
      }
      const learnings: Learning[] = await getRelevantLearnings(taskDescription, limit)
      return NextResponse.json({ learnings })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Session query failed', details: String(error) }, { status: 500 })
  }
}