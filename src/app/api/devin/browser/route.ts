import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { browserAgent, type BrowserSession, type PageState, type BrowserOptions } from '@/lib/browser-agent'

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { action, sessionId, url, selector, text, script, testCases, options } = body

    if (action === 'open') {
      if (!url) {
        return NextResponse.json({ error: 'Missing url' }, { status: 400 })
      }
      const session: BrowserSession = await browserAgent.open(url, options as BrowserOptions)
      return NextResponse.json(session)
    }

    if (action === 'screenshot') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
      }
      const screenshot = await browserAgent.screenshot(sessionId)
      return NextResponse.json({ screenshot })
    }

    if (action === 'click') {
      if (!sessionId || !selector) {
        return NextResponse.json({ error: 'Missing sessionId or selector' }, { status: 400 })
      }
      await browserAgent.click(sessionId, selector)
      return NextResponse.json({ success: true })
    }

    if (action === 'type') {
      if (!sessionId || !selector || !text) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }
      await browserAgent.type(sessionId, selector, text)
      return NextResponse.json({ success: true })
    }

    if (action === 'navigate') {
      if (!sessionId || !url) {
        return NextResponse.json({ error: 'Missing sessionId or url' }, { status: 400 })
      }
      await browserAgent.navigate(sessionId, url)
      return NextResponse.json({ success: true })
    }

    if (action === 'evaluate') {
      if (!sessionId || !script) {
        return NextResponse.json({ error: 'Missing sessionId or script' }, { status: 400 })
      }
      const result = await browserAgent.evaluate(sessionId, script)
      return NextResponse.json({ result })
    }

    if (action === 'close') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
      }
      await browserAgent.close(sessionId)
      return NextResponse.json({ success: true })
    }

    if (action === 'visual-test') {
      if (!sessionId || !testCases) {
        return NextResponse.json({ error: 'Missing sessionId or testCases' }, { status: 400 })
      }
      const result = await browserAgent.visualTest(sessionId, testCases)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Browser operation failed', details: String(error) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const state: PageState = await browserAgent.getState(sessionId)
    return NextResponse.json(state)
  } catch (error) {
    return NextResponse.json({ error: 'Get state failed', details: String(error) }, { status: 500 })
  }
}