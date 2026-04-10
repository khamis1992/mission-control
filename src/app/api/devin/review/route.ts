import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { executeWithSelfReview, quickReview, type ReviewResult, type ReviewIssue } from '@/lib/self-review-loop'

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { code, filePath, language, taskDescription, taskId, workspaceId } = body

    if (!code) {
      return NextResponse.json({ error: 'Missing required field: code' }, { status: 400 })
    }

    const wsId = workspaceId ?? auth.user.workspace_id ?? 1

    const result: ReviewResult = await executeWithSelfReview(
      taskId ?? 0,
      code,
      { code, filePath, language, taskDescription },
      wsId
    )

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: 'Review failed', details: String(error) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const filePath = searchParams.get('filePath')
    const taskDescription = searchParams.get('taskDescription')

    if (!code) {
      return NextResponse.json({ error: 'Missing required query param: code' }, { status: 400 })
    }

    const issues: ReviewIssue[] = await quickReview(code, { code, filePath: filePath || undefined, taskDescription: taskDescription || undefined })

    return NextResponse.json({ issues })
  } catch (error) {
    return NextResponse.json({ error: 'Quick review failed', details: String(error) }, { status: 500 })
  }
}