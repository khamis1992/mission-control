import { spawn, ChildProcess } from 'child_process'
import { logger } from './logger'

export type DebugEventType = 
  | 'initialized'
  | 'stopped'
  | 'continued'
  | 'exited'
  | 'terminated'
  | 'thread'
  | 'output'
  | 'breakpoint'
  | 'capability'

export interface DebugEvent {
  type: DebugEventType
  body?: Record<string, unknown>
  timestamp: number
}

export interface StackFrame {
  id: number
  name: string
  source?: { path: string; name?: string }
  line: number
  column: number
}

export interface Thread {
  id: number
  name: string
  state: 'running' | 'stopped' | 'exited'
}

export interface Breakpoint {
  id: number
  verified: boolean
  source?: { path: string }
  line: number
  condition?: string
}

export interface Variable {
  name: string
  value: string
  type: string
  reference?: number
  variablesReference?: number
}

export interface Scope {
  name: string
  variablesReference: number
  expensive: boolean
  source?: { path: string; name?: string }
}

export interface DebugAdapterClientOptions {
  host?: string
  port?: number
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export class DebugAdapterClient {
  private process: ChildProcess | null = null
  private seq = 0
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private eventHandlers = new Map<DebugEventType, Set<(event: DebugEvent) => void>>()
  private eventQueue: DebugEvent[] = []
  private connected = false
  private outputCallback: ((output: { category: string; text: string }) => void) | null = null

  constructor(private options: DebugAdapterClientOptions = {}) {}

  async connect(): Promise<void> {
    const { command = 'node', args = [], env = {} } = this.options

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(command, args, {
          env: { ...process.env, ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        this.process.on('error', (err) => {
          logger.error({ error: err }, 'Debug adapter process error')
          reject(err)
        })

        this.process.on('exit', (code) => {
          logger.info({ code }, 'Debug adapter process exited')
          this.connected = false
        })

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data.toString())
        })

        this.process.stderr?.on('data', (data: Buffer) => {
          if (this.outputCallback) {
            this.outputCallback({ category: 'stderr', text: data.toString() })
          }
        })

        setTimeout(() => {
          if (this.process && !this.connected) {
            this.send('initialize', {
              adapterID: 'mission-control-dap',
              locale: 'en',
            })
          }
        }, 100)

        setTimeout(resolve, 500)
      } catch (error) {
        reject(error)
      }
    })
  }

  private handleData(data: string): void {
    const lines = data.split('\n')
    
    for (const line of lines) {
      if (!line.trim() || !line.startsWith('Content-Length:')) continue
      
      const bodyMatch = line.match(/Content-Length: \d+\r\n\r\n([\s\S]+)/)
      if (bodyMatch) {
        try {
          const response = JSON.parse(bodyMatch[1])
          this.handleMessage(response)
        } catch (e) {
          logger.warn({ line }, 'Failed to parse DAP message')
        }
      }
    }
  }

  private handleMessage(message: Record<string, unknown>): void {
    if (message.type === 'response') {
      const response = message as { success: boolean; command: string; body?: unknown }
      const callback = this.pendingRequests.get(message.seq as number)
      if (callback) {
        this.pendingRequests.delete(message.seq as number)
        if (response.success) {
          callback.resolve(response.body || {})
        } else {
          callback.reject(new Error(`DAP request failed: ${response.command}`))
        }
      }
    } else if (message.type === 'event') {
      const event = message as { event: string; body?: Record<string, unknown> }
      const type = event.event as DebugEventType
      const debugEvent: DebugEvent = {
        type,
        body: event.body,
        timestamp: Date.now(),
      }

      if (type === 'output' && event.body && this.outputCallback) {
        const output = event.body as { category?: string; output?: string }
        this.outputCallback({ 
          category: output.category || 'stdout', 
          text: output.output || '' 
        })
      }

      const handlers = this.eventHandlers.get(type)
      if (handlers) {
        handlers.forEach(handler => handler(debugEvent))
      } else {
        this.eventQueue.push(debugEvent)
      }
    }
  }

  private send(command: string, args?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('Debug adapter not connected'))
        return
      }

      const currentSeq = ++this.seq
      const message = JSON.stringify({ seq: currentSeq, type: 'request', command, arguments: args })
      const body = `Content-Length: ${message.length}\r\n\r\n${message}`

      this.process.stdin.write(body)
      this.pendingRequests.set(currentSeq, { resolve: resolve as (value: unknown) => void, reject })
    })
  }

  onEvent(type: DebugEventType, handler: (event: DebugEvent) => void): void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set())
    }
    this.eventHandlers.get(type)!.add(handler)
  }

  offEvent(type: DebugEventType, handler: (event: DebugEvent) => void): void {
    this.eventHandlers.get(type)?.delete(handler)
  }

  onOutput(callback: (output: { category: string; text: string }) => void): void {
    this.outputCallback = callback
  }

  async initialize(): Promise<{ supportsConfigurationDoneRequest: boolean }> {
    const response = await this.send('initialize', {
      adapterID: 'mission-control',
      locale: 'en',
    }) as { body?: { supportsConfigurationDoneRequest?: boolean } }
    
    this.connected = true
    return { supportsConfigurationDoneRequest: response?.body?.supportsConfigurationDoneRequest || false }
  }

  async launch(config: Record<string, unknown>): Promise<void> {
    await this.send('launch', config)
  }

  async attach(config: Record<string, unknown>): Promise<void> {
    await this.send('attach', config)
  }

  async disconnect(): Promise<void> {
    try {
      await this.send('disconnect', { restart: false })
    } finally {
      this.process?.kill()
      this.process = null
      this.connected = false
    }
  }

  async setBreakpoints(file: string, lines: number[], sourceModified = false): Promise<Breakpoint[]> {
    const response = await this.send('setBreakpoints', {
      source: { path: file },
      breakpoints: lines.map(line => ({ line })),
      sourceModified,
    }) as { body?: { breakpoints?: Breakpoint[] } }
    return response?.body?.breakpoints || []
  }

  async setExceptionBreakpoints(filters: string[]): Promise<void> {
    await this.send('setExceptionBreakpoints', { filters })
  }

  async configurationDone(): Promise<void> {
    await this.send('configurationDone', {})
  }

  async continue(): Promise<void> {
    await this.send('continue', { threadId: 0 })
  }

  async next(): Promise<void> {
    await this.send('next', { threadId: 0 })
  }

  async stepIn(): Promise<void> {
    await this.send('stepIn', { threadId: 0 })
  }

  async stepOut(): Promise<void> {
    await this.send('stepOut', { threadId: 0 })
  }

  async pause(): Promise<void> {
    await this.send('pause', { threadId: 0 })
  }

  async stackTrace(threadId = 0, levels = 20): Promise<StackFrame[]> {
    const response = await this.send('stackTrace', { threadId, levels }) as { body?: { stackFrames?: StackFrame[] } }
    return response?.body?.stackFrames || []
  }

  async scopes(frameId: number): Promise<Scope[]> {
    const response = await this.send('scopes', { frameId }) as { body?: { scopes?: Scope[] } }
    return response?.body?.scopes || []
  }

  async variables(variablesReference: number): Promise<Variable[]> {
    const response = await this.send('variables', { variablesReference }) as { body?: { variables?: Variable[] } }
    return response?.body?.variables || []
  }

  async evaluate(expression: string, frameId?: number): Promise<{ result: string; type: string }> {
    const response = await this.send('evaluate', { 
      expression, 
      context: frameId ? 'hover' : 'repl',
      frameId 
    }) as { body?: { result?: string; type?: string } }
    return { result: response?.body?.result || '', type: response?.body?.type || '' }
  }

  async threads(): Promise<Thread[]> {
    const response = await this.send('threads', {}) as { body?: { threads?: Thread[] } }
    return response?.body?.threads || []
  }

  async source(file: string): Promise<string> {
    const response = await this.send('source', { source: { path: file } }) as { body?: { content?: string } }
    return response?.body?.content || ''
  }

  async customRequest(command: string, args?: Record<string, unknown>): Promise<unknown> {
    return this.send(command, args)
  }

  isConnected(): boolean {
    return this.connected
  }
}

export const debugAdapter = new DebugAdapterClient()