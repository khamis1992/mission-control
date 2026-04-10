import { NextRequest } from 'next/server'
import { eventBus } from '@/lib/event-bus'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const taskId = parseInt(id, 10)
  
  if (isNaN(taskId)) {
    return new Response(JSON.stringify({ error: 'Invalid task ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  const encoder = new TextEncoder()
  let connected = true
  
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (eventType: string, data: any) => {
        if (!connected) return
        try {
          const event = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(event))
        } catch (e) {
          connected = false
        }
      }
      
      sendEvent('connected', { taskId, timestamp: Date.now() })
      
      const logHandler = (event: any) => {
        if (event.data?.task_id === taskId) {
          sendEvent('log', {
            taskId: event.data.task_id,
            type: event.data.type,
            text: event.data.text,
            timestamp: event.data.timestamp,
            source: event.data.source
          })
        }
      }
      
      const statusHandler = (event: any) => {
        if (event.type === 'session.phase_changed' || event.type === 'session.status_changed') {
          sendEvent('status', event.data)
        }
      }
      
      eventBus.on('session.phase_changed', statusHandler)
      eventBus.on('session.status_changed', statusHandler)
      eventBus.on('task.log', logHandler)
      
      const heartbeatInterval = setInterval(() => {
        if (!connected) {
          clearInterval(heartbeatInterval)
          return
        }
        sendEvent('heartbeat', { timestamp: Date.now() })
      }, 30000)
      
      const cleanup = () => {
        connected = false
        clearInterval(heartbeatInterval)
        eventBus.off('task.log', logHandler)
        eventBus.off('session.phase_changed', statusHandler)
        eventBus.off('session.status_changed', statusHandler)
      }
      
      request.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch { }
      })
    },
    
    cancel() {
      connected = false
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}