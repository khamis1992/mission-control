# Session 3: Telemetry + Observability Agent Prompt

## Background
You are Agent 3 implementing Session 3 of Mission Control's agent orchestration feature expansion.

## Goal
Implement comprehensive telemetry system for agent task tracking with tracing, cost monitoring, and observability dashboard.

## File Assignments

### NEW Files to Create
1. `src/lib/telemetry.ts` - Agent telemetry collection and metrics
2. `src/lib/trace-collector.ts` - Trace event collection and storage
3. `src/app/api/telemetry/route.ts` - Telemetry API for queries
4. `src/components/panels/telemetry-panel.tsx` - Telemetry dashboard
5. `src/components/panels/trace-viewer.tsx` - Trace timeline viewer
6. `src/components/panels/cost-dashboard-panel.tsx` - Cost tracking dashboard

### EXISTING Files to Update
1. `src/lib/event-bus.ts` - Add events: `agent.trace`, `agent.cost_update`, `tool_call`
2. `src/app/api/tasks/[id]/route.ts` - Add telemetry hooks
3. `src/lib/scheduler.ts` - Add cost aggregation job (run daily)

## Implementation Tasks

### Task 1: Trace Event Types (src/lib/telemetry.ts)
```typescript
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

export interface TelemetryClient {
  startTrace(session: Partial<TraceSession>): Promise<string>;
  addEvent(sessionId: string, event: TraceEvent): Promise<void>;
  endTrace(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<TraceSession | null>;
  listSessions(options: ListOptions): Promise<TraceSession[]>;
  getCurrentCost(agentId: string, period: 'day' | 'week' | 'month'): Promise<number>;
  getCostMetrics(): Promise<CostMetrics>;
}
```

### Task 2: Trace Collector (src/lib/trace-collector.ts)
```typescript
export class TraceCollector {
  private sessions: Map<string, TraceSession> = new Map();
  private tracesDir: string;
  
  constructor() {
    this.tracesDir = path.join(getDataDir(), 'traces');
    fs.ensureDirSync(this.tracesDir);
  }
  
  async startTrace(session: Partial<TraceSession>): Promise<string> {
    const sessionId = generateUUID();
    const traceSession: TraceSession = {
      id: sessionId,
      task_id: session.task_id!,
      agent_id: session.agent_id!,
      start_time: Date.now(),
      status: 'running',
      events: [],
      tokens: { prompt: 0, completion: 0 },
      cost_usd: 0
    };
    
    this.sessions.set(sessionId, traceSession);
    eventBus.broadcast('agent.trace', { 
      type: 'agent_start', 
      agent_id: session.agent_id,
      task_id: session.task_id 
    });
    
    return sessionId;
  }
  
  async addEvent(sessionId: string, event: TraceEvent): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Trace session not found: ${sessionId}`);
    }
    
    session.events.push(event);
    
    // Update token costs
    if (event.type === 'token_usage') {
      session.tokens.prompt += event.payload.prompt || 0;
      session.tokens.completion += event.payload.completion || 0;
      session.cost_usd += calculateCost(
        session.tokens.prompt,
        session.tokens.completion,
        event.payload.model || 'gpt-4o'
      );
    }
    
    this.saveTrace(sessionId);
    eventBus.broadcast('agent.trace', { 
      type: event.type,
      payload: event.payload,
      agent_id: session.agent_id
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
      cost_usd: session.cost_usd
    });
    
    this.sessions.delete(sessionId);
    this.saveTrace(sessionId); // Save final state
  }
  
  async getTracesByTask(taskId: number): Promise<TraceSession[]> {
    const traces = [] as TraceSession[];
    const files = fs.readdirSync(this.tracesDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const trace = JSON.parse(fs.readFileSync(path.join(this.tracesDir, file), 'utf8'));
          if (trace.task_id === taskId) {
            traces.push(trace);
          }
        } catch {
          // Skip invalid files
        }
      }
    }
    
    return traces.sort((a, b) => b.start_time - a.start_time);
  }
  
  private saveTrace(sessionId: string): void {
    const session = this.sessions.get(sessionId)!;
    const dataPath = path.join(this.tracesDir, `${sessionId}.json`);
    fs.writeFileSync(dataPath, JSON.stringify(session, null, 2));
  }
}

export function calculateCost(promptTokens: number, completionTokens: number, model: string): number {
  // Pricing from OpenAI and other providers (as of 2026)
  const pricing = {
    'gpt-4o': { prompt: 0.000005, completion: 0.000015 },
    'gpt-4o-mini': { prompt: 0.00000015, completion: 0.0000006 },
    'claude-3-5-sonnet': { prompt: 0.000003, completion: 0.000015 },
    'claude-3-opus': { prompt: 0.000015, completion: 0.000075 },
  };
  
  const prices = pricing[model as keyof typeof pricing] || { prompt: 0, completion: 0 };
  return (promptTokens * prices.prompt) + (completionTokens * prices.completion);
}
```

### Task 3: Telemetry Dashboard (src/components/panels/telemetry-panel.tsx)
```typescript
const TelemetryPanel: React.FC = () => {
  const [filters, setFilters] = useState({
    agent: '',
    startDate: '',
    endDate: '',
    type: 'all'
  });
  const [traces, setTraces] = useState<TraceSession[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    fetchTraces();
  }, [filters]);
  
  const fetchTraces = async () => {
    setLoading(true);
    
    let url = '/api/telemetry?';
    if (filters.agent) url += `&agent=${encodeURIComponent(filters.agent)}`;
    if (filters.startDate) url += `&start=${filters.startDate}`;
    if (filters.endDate) url += `&end=${filters.endDate}`;
    if (filters.type !== 'all') url += `&type=${filters.type}`;
    
    const res = await fetch(url);
    const data = await res.json();
    setTraces(data);
    setLoading(false);
  };
  
  const formatCost = (usd: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 6,
      maximumFractionDigits: 6
    }).format(usd);
  };
  
  return (
    <div className="p-4">
      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <input
          type="text"
          placeholder="Filter by agent..."
          value={filters.agent}
          onChange={e => setFilters({ ...filters, agent: e.target.value })}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded"
        />
        
        <input
          type="date"
          value={filters.startDate}
          onChange={e => setFilters({ ...filters, startDate: e.target.value })}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded"
        />
        
        <input
          type="date"
          value={filters.endDate}
          onChange={e => setFilters({ ...filters, endDate: e.target.value })}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded"
        />
        
        <select
          value={filters.type}
          onChange={e => setFilters({ ...filters, type: e.target.value })}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded"
        >
          <option value="all">All Types</option>
          <option value="agent_start">Agent Start</option>
          <option value="token_usage">Token Usage</option>
          <option value="error">Errors</option>
        </select>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-800 text-gray-200">
            <tr>
              <th className="p-2">Task ID</th>
              <th className="p-2">Agent</th>
              <th className="p-2">Duration</th>
              <th className="p-2">Prompt Tokens</th>
              <th className="p-2">Completion Tokens</th>
              <th className="p-2">Cost</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-4">Loading...</td>
              </tr>
            ) : traces.map(trace => (
              <tr key={trace.id} className="border-b border-gray-800 hover:bg-gray-800">
                <td className="p-2">{trace.task_id}</td>
                <td className="p-2">{trace.agent_id}</td>
                <td className="p-2">{formatDuration(trace.duration_ms)}</td>
                <td className="p-2">{trace.tokens.prompt}</td>
                <td className="p-2">{trace.tokens.completion}</td>
                <td className="p-2 text-blue-400 font-mono">{formatCost(trace.cost_usd)}</td>
                <td className="p-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    trace.status === 'completed' 
                      ? 'bg-green-600' 
                      : trace.status === 'failed' 
                      ? 'bg-red-600' 
                      : 'bg-yellow-600'
                  }`}>
                    {trace.status}
                  </span>
                </td>
                <td className="p-2">
                  <button
                    onClick={() => openTraceViewer(trace.id)}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    View Trace
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function formatDuration(ms?: number): string {
  if (!ms) return 'N/A';
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}
```

### Task 4: Trace Viewer (src/components/panels/trace-viewer.tsx)
```typescript
const TraceViewer: React.FC<{ traceId: string }> = ({ traceId }) => {
  const [trace, setTrace] = useState<TraceSession | null>(null);
  const [timeline, setTimeline] = useState<TraceEvent[]>([]);
  
  useEffect(() => {
    fetchTrace();
  }, [traceId]);
  
  const fetchTrace = async () => {
    const res = await fetch(`/api/telemetry/trace/${traceId}`);
    const data = await res.json();
    setTrace(data);
    setTimeline(data.events);
  };
  
  // Group events by type for timeline visualization
  const groupedEvents = useMemo(() => {
    const groups: Record<string, TraceEvent[]> = {};
    timeline.forEach(event => {
      if (!groups[event.type]) groups[event.type] = [];
      groups[event.type].push(event);
    });
    return groups;
  }, [timeline]);
  
  return (
    <div className="p-4">
      {trace && (
        <>
          <h2 className="text-xl font-bold mb-4">Trace: {trace.id}</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-800 p-4 rounded">
              <div className="text-sm text-gray-500">Task ID</div>
              <div className="text-lg font-mono">{trace.task_id}</div>
            </div>
            <div className="bg-gray-800 p-4 rounded">
              <div className="text-sm text-gray-500">Duration</div>
              <div className="text-lg font-mono">{formatDuration(trace.duration_ms)}</div>
            </div>
            <div className="bg-gray-800 p-4 rounded">
              <div className="text-sm text-gray-500">Cost</div>
              <div className="text-lg font-mono text-blue-400">
                ${trace.cost_usd.toFixed(6)}
              </div>
            </div>
            <div className="bg-gray-800 p-4 rounded">
              <div className="text-sm text-gray-500">Status</div>
              <div className={`text-lg font-bold ${
                trace.status === 'completed' ? 'text-green-400' : 'text-red-400'
              }`}>
                {trace.status.toUpperCase()}
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded p-4">
            <h3 className="text-lg font-bold mb-4">Event Timeline</h3>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <div className="w-24 text-sm text-green-400">Session Start</div>
                <div className="text-gray-300">Session initialized</div>
              </div>
              
              {timeline.map((event, i) => (
                <div key={event.id} className="flex gap-2 items-start text-sm">
                  <div className="w-24 text-gray-500 font-mono">
                    {formatTime(event.timestamp)}
                  </div>
                  <div className="flex-1">
                    <span className={`px-2 py-1 rounded text-xs mr-2 ${
                      event.type === 'error' 
                        ? 'bg-red-600' 
                        : event.type === 'token_usage'
                        ? 'bg-blue-600'
                        : 'bg-gray-600'
                    }`}>
                      {event.type}
                    </span>
                    <span className="text-gray-300">{JSON.stringify(event.payload)}</span>
                  </div>
                </div>
              ))}
              
              <div className="flex gap-2 items-start">
                <div className="w-24 text-sm text-green-400">Session End</div>
                <div className="text-gray-300">
                  {trace.tokens.prompt} prompt tokens, {trace.tokens.completion} completion tokens
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}
```

### Task 5: Cost Dashboard (src/components/panels/cost-dashboard-panel.tsx)
```typescript
const CostDashboardPanel: React.FC = () => {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [costs, setCosts] = useState<CostMetrics[]>([]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  
  useEffect(() => {
    fetchCostData();
    fetchBudgets();
  }, [period]);
  
  const fetchCostData = async () => {
    const res = await fetch(`/api/telemetry/cost?period=${period}`);
    const data = await res.json();
    setCosts(data);
  };
  
  const fetchBudgets = async () => {
    const res = await fetch('/api/telemetry/budgets');
    const data = await res.json();
    setBudgets(data);
  };
  
  const getBudgetPercentage = (agent: string): number => {
    const agentCosts = costs.find(c => c.agent_id === agent);
    const budget = budgets[agent] || 10; // Default $10/day
    if (!agentCosts) return 0;
    return Math.min((agentCosts.total_cost_usd / budget) * 100, 100);
  };
  
  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        {['day', 'week', 'month'].map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p as any)}
            className={`px-4 py-2 rounded ${
              period === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>
      
      <div className="space-y-4">
        {costs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No cost data for this period</div>
        ) : (
          costs.map(cost => (
            <div key={cost.agent_id} className="bg-gray-800 rounded p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-32 text-gray-300">{cost.agent_id}</div>
                  <div className="text-gray-500 text-sm">
                    {cost.period}: {cost.start_date} to {cost.end_date}
                  </div>
                </div>
                <div className="text-blue-400 font-mono">
                  ${cost.total_cost_usd.toFixed(6)}
                </div>
              </div>
              
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Budget</span>
                  <span>$10.00</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      getBudgetPercentage(cost.agent_id) > 100 
                        ? 'bg-red-600' 
                        : getBudgetPercentage(cost.agent_id) > 70 
                        ? 'bg-yellow-600' 
                        : 'bg-green-600'
                    }`}
                    style={{ width: `${getBudgetPercentage(cost.agent_id)}%` }}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 text-sm text-gray-400">
                <div>
                  <div className="text-gray-500">Prompt</div>
                  <div>{cost.total_prompt_tokens.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500">Completion</div>
                  <div>{cost.total_completion_tokens.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500">Model</div>
                  <div>{cost.model || 'mixed'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Tasks</div>
                  <div>{cost.task_count}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

interface CostMetrics {
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
```

### Task 6: Telemetry API (src/app/api/telemetry/route.ts)
```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get('agent'); // Filter by agent
  const startDate = searchParams.get('start'); // Filter by start date
  const endDate = searchParams.get('end'); // Filter by end date
  const type = searchParams.get('type'); // Filter by event type
  const limit = parseInt(searchParams.get('limit') || '100');
  
  const traceCollector = new TraceCollector();
  let traces = await traceCollector.getTracesByTask(0); // Get all traces
  
  // Apply filters
  if (agent) {
    traces = traces.filter(t => t.agent_id === agent);
  }
  
  if (startDate) {
    const start = new Date(startDate).getTime();
    traces = traces.filter(t => t.start_time >= start);
  }
  
  if (endDate) {
    const end = new Date(endDate).getTime();
    traces = traces.filter(t => t.end_time && t.end_time <= end);
  }
  
  if (type && type !== 'all') {
    traces = traces.filter(t => 
      t.events.some(e => e.type === type)
    );
  }
  
  return NextResponse.json(traces.slice(0, limit));
}

// Telemetry sub-routes
// GET /api/telemetry/trace/:id - Get single trace
// GET /api/telemetry/cost - Get cost metrics grouped by agent
// DELETE /api/telemetry/trace/:id - Delete a trace session
```

### Task 7: Cost API (src/app/api/telemetry/cost/route.ts)
```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'day';
  
  // Calculate date range
  const now = new Date();
  let startDate = new Date();
  
  if (period === 'day') {
    startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (period === 'week') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'month') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  const traceCollector = new TraceCollector();
  const traces = await traceCollector.getTracesByTask(0); // Get all
  
  // Aggregate costs by agent
  const costByAgent: Record<string, CostMetrics> = {};
  
  traces.forEach(trace => {
    if (trace.start_time >= startDate.getTime()) {
      const agent = trace.agent_id;
      if (!costByAgent[agent]) {
        costByAgent[agent] = {
          agent_id: agent,
          period: period as any,
          start_date: startDate.toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
          total_cost_usd: 0,
          task_count: 0,
          model: trace.events.find(e => e.type === 'token_usage')?.payload.model
        };
      }
      
      costByAgent[agent].total_prompt_tokens += trace.tokens.prompt;
      costByAgent[agent].total_completion_tokens += trace.tokens.completion;
      costByAgent[agent].total_cost_usd += trace.cost_usd;
      costByAgent[agent].task_count += 1;
    }
  });
  
  return NextResponse.json(Object.values(costByAgent));
}
```

### Task 8: Scheduler Job (src/lib/scheduler.ts)
```typescript
tasks.set('cost_aggregation', {
  name: 'Daily Cost Aggregation',
  intervalMs: 24 * 60 * 60 * 1000, // Every 24 hours
  handler: async () => {
    const traceCollector = new TraceCollector();
    const traces = await traceCollector.getTracesByTask(0);
    
    let totalCost = 0;
    let totalPrompts = 0;
    let totalCompletions = 0;
    const agentCosts: Record<string, number> = {};
    
    traces.forEach(trace => {
      totalCost += trace.cost_usd;
      totalPrompts += trace.tokens.prompt;
      totalCompletions += trace.tokens.completion;
      
      if (!agentCosts[trace.agent_id]) {
        agentCosts[trace.agent_id] = 0;
      }
      agentCosts[trace.agent_id] += trace.cost_usd;
    });
    
    // Log daily summary
    logger.info({
      date: new Date().toISOString().split('T')[0],
      total_cost: totalCost,
      total_prompts: totalPrompts,
      total_completions: totalCompletions,
      agent_breakdown: agentCosts
    }, 'Daily Cost Summary');
    
    return {
      ok: true,
      summary: {
        total_cost: totalCost,
        total_prompts: totalPrompts,
        total_completions: totalCompletions,
        agents: Object.keys(agentCosts).length
      }
    };
  }
});
```

## Success Criteria
Complete when:
- [ ] Agent traces show tool calls per execution with accurate timestamps
- [ ] Cost tracking accurate to $0.001 (6 decimal places)
- [ ] Telemetry dashboard filters by agent, date, and event type
- [ ] Trace timeline renders with <500ms latency
- [ ] Cost metrics aggregate correctly by agent and period
- [ ] Budget tracking shows usage vs budget with visual indicators
- [ ] Tests pass for telemetry and cost calculations

## Key Constraints
- Trace events are immutable (append-only)
- Cost calculation uses real token pricing
- Traces persist in file system (can use SQLite later)
- Dashboard must handle 1000+ traces without performance issues
- Use existing logger and eventBus patterns

## Dependencies
- File system access for trace persistence
- Token pricing data (OpenAI, Anthropic pricing as of 2026)

Good luck! You're building the observability foundation for Mission Control.