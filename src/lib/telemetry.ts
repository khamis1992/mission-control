import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDataDir } from './config';
import { eventBus } from './event-bus';
import { logger } from './logger';

function getTracesDir(): string {
  const tracesDir = path.join(getDataDir(), 'traces');
  if (!fs.existsSync(tracesDir)) {
    fs.mkdirSync(tracesDir, { recursive: true });
  }
  return tracesDir;
}

export function calculateCost(promptTokens: number, completionTokens: number, model: string): number {
  const pricing = {
    'gpt-4o': { prompt: 0.000005, completion: 0.000015 },
    'gpt-4o-mini': { prompt: 0.00000015, completion: 0.0000006 },
    'claude-3-5-sonnet': { prompt: 0.000003, completion: 0.000015 },
    'claude-3-opus': { prompt: 0.000015, completion: 0.000075 },
    'claude-3-haiku': { prompt: 0.00000025, completion: 0.00000125 },
    'default': { prompt: 0, completion: 0 },
  };

  const prices = pricing[model as keyof typeof pricing] || pricing['default'];
  return (promptTokens * prices.prompt) + (completionTokens * prices.completion);
}

export type TraceEventType =
  | 'agent_start'
  | 'agent_end'
  | 'tool_call'
  | 'tool_result'
  | 'token_usage'
  | 'error'
  | 'checkpoint_saved'
  | 'checkpoint_restored';

export interface TraceEvent {
  id: string;
  task_id: number;
  agent_id: string;
  type: TraceEventType;
  timestamp: number;
  payload: any;
  metadata?: Record<string, any>;
}

export interface TraceSession {
  id: string;
  task_id: number;
  agent_id: string;
  start_time: number;
  end_time?: number;
  duration_ms?: number;
  status: 'running' | 'completed' | 'failed';
  events: TraceEvent[];
  tokens: {
    prompt: number;
    completion: number;
  };
  cost_usd: number;
}

export interface CostMetrics {
  agent_id: string;
  period: 'day' | 'week' | 'month';
  start_date: string;
  end_date: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost_usd: number;
  task_count: number;
  model?: string;
}

export interface ListOptions {
  taskId?: number;
  agentId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export class TraceCollector {
  private sessions: Map<string, TraceSession> = new Map();
  private tracesDir: string;

  constructor() {
    this.tracesDir = getTracesDir();
  }

  async startTrace(session: Partial<TraceSession>): Promise<string> {
    const sessionId = randomUUID();
    const traceSession: TraceSession = {
      id: sessionId,
      task_id: session.task_id!,
      agent_id: session.agent_id!,
      start_time: Date.now(),
      status: 'running',
      events: [],
      tokens: { prompt: 0, completion: 0 },
      cost_usd: 0,
    };

    this.sessions.set(sessionId, traceSession);
    eventBus.broadcast('agent.trace', {
      type: 'agent_start',
      agent_id: session.agent_id,
      task_id: session.task_id,
    });

    return sessionId;
  }

  async addEvent(sessionId: string, event: TraceEvent): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Trace session not found: ${sessionId}`);
    }

    session.events.push(event);

    if (event.type === 'token_usage') {
      session.tokens.prompt += event.payload.prompt || 0;
      session.tokens.completion += event.payload.completion || 0;
      session.cost_usd += calculateCost(
        session.tokens.prompt,
        session.tokens.completion,
        event.payload.model || 'gpt-4o',
      );
    }

    this.saveTrace(sessionId);
    eventBus.broadcast('agent.trace', {
      type: event.type,
      payload: event.payload,
      agent_id: session.agent_id,
    });
  }

  async endTrace(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Trace session not found: ${sessionId}`);
    }

    session.end_time = Date.now();
    session.status = 'completed';
    session.duration_ms = session.end_time - session.start_time;

    eventBus.broadcast('agent.trace', {
      type: 'agent_end',
      agent_id: session.agent_id,
      task_id: session.task_id,
      tokens: session.tokens,
      cost_usd: session.cost_usd,
    });

    this.sessions.delete(sessionId);
    this.saveTrace(sessionId);
  }

  async getTracesByTask(taskId: number): Promise<TraceSession[]> {
    const traces: TraceSession[] = [];
    const files = fs.readdirSync(this.tracesDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const tracePath = path.join(this.tracesDir, file);
          const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
          if (trace.task_id === taskId) {
            traces.push(trace);
          }
        } catch (err) {
          logger.warn({ file, err }, 'Failed to parse trace file');
        }
      }
    }

    return traces.sort((a, b) => b.start_time - a.start_time);
  }

  async getAllTraces(): Promise<TraceSession[]> {
    const traces: TraceSession[] = [];
    const files = fs.readdirSync(this.tracesDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const tracePath = path.join(this.tracesDir, file);
          const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
          traces.push(trace);
        } catch (err) {
          logger.warn({ file, err }, 'Failed to parse trace file');
        }
      }
    }

    return traces.sort((a, b) => b.start_time - a.start_time);
  }

  async getTraceById(sessionId: string): Promise<TraceSession | null> {
    const files = fs.readdirSync(this.tracesDir);

    for (const file of files) {
      if (file === `${sessionId}.json`) {
        try {
          const tracePath = path.join(this.tracesDir, file);
          return JSON.parse(fs.readFileSync(tracePath, 'utf8')) as TraceSession;
        } catch (err) {
          logger.warn({ sessionId, err }, 'Failed to read trace file');
          return null;
        }
      }
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    return null;
  }

  async getCurrentCost(agentId: string, period: 'day' | 'week' | 'month'): Promise<number> {
    const traces = await this.getAllTraces();
    const now = Date.now();
    let periodMs: number;

    switch (period) {
      case 'day':
        periodMs = 24 * 60 * 60 * 1000;
        break;
      case 'week':
        periodMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        periodMs = 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        periodMs = 24 * 60 * 60 * 1000;
    }

    const cutoff = now - periodMs;
    let totalCost = 0;

    for (const trace of traces) {
      if (trace.agent_id === agentId && trace.start_time >= cutoff) {
        totalCost += trace.cost_usd;
      }
    }

    return totalCost;
  }

  async getCostMetrics(period: 'day' | 'week' | 'month' = 'day'): Promise<CostMetrics[]> {
    const traces = await this.getAllTraces();
    const now = Date.now();
    let periodMs: number;

    switch (period) {
      case 'day':
        periodMs = 24 * 60 * 60 * 1000;
        break;
      case 'week':
        periodMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        periodMs = 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        periodMs = 24 * 60 * 60 * 1000;
    }

    const cutoff = now - periodMs;
    const costByAgent: Record<string, CostMetrics> = {};

    for (const trace of traces) {
      if (trace.start_time >= cutoff) {
        const agent = trace.agent_id;
        if (!costByAgent[agent]) {
          const firstTokenEvent = trace.events.find((e) => e.type === 'token_usage');
          const model = firstTokenEvent?.payload.model;

          costByAgent[agent] = {
            agent_id: agent,
            period,
            start_date: new Date(cutoff).toISOString().split('T')[0],
            end_date: new Date().toISOString().split('T')[0],
            total_prompt_tokens: 0,
            total_completion_tokens: 0,
            total_cost_usd: 0,
            task_count: 0,
            model,
          };
        }

        costByAgent[agent].total_prompt_tokens += trace.tokens.prompt;
        costByAgent[agent].total_completion_tokens += trace.tokens.completion;
        costByAgent[agent].total_cost_usd += trace.cost_usd;
        costByAgent[agent].task_count += 1;
      }
    }

    return Object.values(costByAgent);
  }

  async deleteTrace(sessionId: string): Promise<void> {
    const filePath = path.join(this.tracesDir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.sessions.delete(sessionId);
  }

  async endTraceByTask(taskId: number, agentId: string): Promise<void> {
    const traces = await this.getTracesByTask(taskId);
    if (traces.length === 0) return;

    const trace = traces[0];
    await this.endTrace(trace.id);
  }

  private saveTrace(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const filePath = path.join(this.tracesDir, `${sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  }
}

const globalCollector = globalThis as typeof globalThis & { __traceCollector?: TraceCollector };
export const traceCollector =
  globalCollector.__traceCollector ?? new TraceCollector();
globalCollector.__traceCollector = traceCollector;