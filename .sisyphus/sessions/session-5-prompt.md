# Session 5: Workflows + Personas Agent Prompt

## Background
You are Agent 5 implementing Session 5 of Mission Control's agent orchestration feature expansion.

## Goal
Implement Visual Workflow Builder and Agent Persona Library for easy agent orchestration and configuration.

## File Assignments

### NEW Files to Create
1. `src/lib/agent-personas.ts` - Agent persona definitions and management
2. `src/lib/workflow-executor.ts` - Workflow execution engine
3. `src/app/api/workflows/route.ts` - Workflows API
4. `src/app/api/workflows/[workflowId]/execute/route.ts` - Execute workflow
5. `src/components/workflow-editor/workflow-editor.tsx` - Main editor component
6. `src/components/workflow-editor/node-palette.tsx` - Node type selector
7. `src/components/workflow-editor/properties-panel.tsx` - Property editor

### EXISTING Files to Update
1. `src/lib/db.ts` - Add columns: `workflow_id TEXT`, `agent_personality TEXT`
2. `src/lib/migrations.ts` - Add migration `053_workflow_persona_schema`
3. `src/lib/event-bus.ts` - Add events: `workflow.created`, `workflow.executed`
4. `src/app/api/tasks/route.ts` - Add workflow trigger hooks

## Implementation Tasks

### Task 1: Agent Persona Library (src/lib/agent-personas.ts)
```typescript
export interface AgentPersonality {
  name: string;
  description: string;
  systemPrompt: string;
  defaultTools: string[];
  defaultCapabilities: string[];
  personality: {
    creativity: number; // 0-1
    riskTolerance: number; // 0-1
    verbosity: 'concise' | 'normal' | 'detailed';
    style: 'formal' | 'casual' | 'technical';
  };
  examples: string[];
  created_at: number;
  enabled: boolean;
}

export const BUILTIN_PERSONAS: Record<string, AgentPersonality> = {
  planner: {
    name: 'Planner',
    description: 'Breaks down complex goals into actionable tasks',
    systemPrompt: 'You are a senior project planner with expertise in breaking down large initiatives into manageable tasks. You focus on structure, dependencies, and clear execution paths.',
    defaultTools: ['task-decomposer', 'dependency-mapper', 'timeline-generator'],
    defaultCapabilities: ['planning', 'scheduling', 'roadmap-creation'],
    personality: {
      creativity: 0.7,
      riskTolerance: 0.3,
      verbosity: 'normal',
      style: 'formal'
    },
    examples: [
      'Create a 6-week roadmap for MVP launch',
      'Break down mobile app development into sprints'
    ]
  },
  
  architect: {
    name: 'Architect',
    description: 'Designs system architecture and data structures',
    systemPrompt: 'You are an experienced systems architect focusing on scalable, maintainable designs. You consider tradeoffs, scalability, and long-term maintainability.',
    defaultTools: ['architecture-diagram', 'database-designer', 'api-spec-generator'],
    defaultCapabilities: ['architecture', 'database', 'api-design'],
    personality: {
      creativity: 0.5,
      riskTolerance: 0.4,
      verbosity: 'detailed',
      style: 'technical'
    },
    examples: [
      'Design a microservices architecture for e-commerce',
      'Create a GraphQL schema for a content platform'
    ]
  },
  
  backend: {
    name: 'Backend Developer',
    description: 'Implements backend APIs and services',
    systemPrompt: 'You are a backend developer focused on robust, efficient API implementations. You follow REST/GraphQL best practices and prioritize performance and reliability.',
    defaultTools: ['code-generator', 'api-server', 'database-migrator'],
    defaultCapabilities: ['backend', 'api', 'database'],
    personality: {
      creativity: 0.3,
      riskTolerance: 0.5,
      verbosity: 'concise',
      style: 'technical'
    },
    examples: [
      'Create a Node.js API for user management',
      'Implement a payment processing service'
    ]
  },
  
  frontend: {
    name: 'Frontend Developer',
    description: 'Builds user interfaces and components',
    systemPrompt: 'You are a frontend developer focused on creating intuitive, accessible user interfaces. You follow modern React patterns and prioritize user experience.',
    defaultTools: ['react-component', 'ui-compiler', 'form-validator'],
    defaultCapabilities: ['frontend', 'ui', 'component-design'],
    personality: {
      creativity: 0.8,
      riskTolerance: 0.6,
      verbosity: 'normal',
      style: 'casual'
    },
    examples: [
      'Create a React e-commerce product page',
      'Build a dashboard with data visualization'
    ]
  },
  
  qa: {
    name: 'QA Engineer',
    description: 'Writes tests and ensures quality',
    systemPrompt: 'You are a QA engineer focused on comprehensive test coverage and quality assurance. You consider edge cases, error handling, and user scenarios.',
    defaultTools: ['test-generator', 'e2e-runner', 'coverage-reporter'],
    defaultCapabilities: ['testing', 'qa', 'coverage'],
    personality: {
      creativity: 0.4,
      riskTolerance: 0.2,
      verbosity: 'detailed',
      style: 'formal'
    },
    examples: [
      'Write unit tests for payment processing',
      'Create E2E tests for checkout flow'
    ]
  },
  
  devops: {
    name: 'DevOps Engineer',
    description: 'Manages deployment and infrastructure',
    systemPrompt: 'You are a DevOps engineer focused on robust deployments and infrastructure. You prioritize reliability, monitoring, and efficient resource usage.',
    defaultTools: ['deploy-config', 'monitoring-setup', 'log-analyzer'],
    defaultCapabilities: ['deployment', 'infrastructure', 'monitoring'],
    personality: {
      creativity: 0.3,
      riskTolerance: 0.7,
      verbosity: 'normal',
      style: 'technical'
    },
    examples: [
      'Set up CI/CD pipeline for Docker deployment',
      'Configure AWS infrastructure for scale'
    ]
  },
  
  reviewer: {
    name: 'Code Reviewer',
    description: 'Reviews code and provides feedback',
    systemPrompt: 'You are a code reviewer focused on quality, maintainability, and best practices. You provide constructive feedback and identify potential issues.',
    defaultTools: ['code-analyzer', 'security-scanner', 'best-practice-checker'],
    defaultCapabilities: ['review', 'security', 'best-practices'],
    personality: {
      creativity: 0.2,
      riskTolerance: 0.3,
      verbosity: 'detailed',
      style: 'formal'
    },
    examples: [
      'Review this pull request for security issues',
      'Provide feedback on this API design'
    ]
  },
  
  recovery: {
    name: 'Recovery Agent',
    description: 'Handles failures and retries',
    systemPrompt: 'You are a recovery agent specialized in handling failures, implementing retries, and managing error scenarios. You focus on resilience and self-healing.',
    defaultTools: ['error-handler', 'retry-manager', 'log-analyzer'],
    defaultCapabilities: ['recovery', 'error-handling', 'resilience'],
    personality: {
      creativity: 0.1,
      riskTolerance: 0.4,
      verbosity: 'concise',
      style: 'technical'
    },
    examples: [
      'Handle a failed database connection',
      'Implement exponential backoff for API calls'
    ]
  }
};

export interface PersonaClient {
  get(name: string): AgentPersonality | null;
  getAll(): AgentPersonality[];
  create(persona: Omit<AgentPersonality, 'created_at' | 'enabled'>): Promise<string>;
  update(id: string, updates: Partial<AgentPersonality>): Promise<void>;
  delete(id: string): Promise<void>;
  setDefault(name: string): Promise<void>;
  getByName(name: string): AgentPersonality | null;
}
```

### Task 2: Workflow Executor (src/lib/workflow-executor.ts)
```typescript
export type WorkflowPattern = 
  | 'sequential'
  | 'hierarchical'
  | 'round-robin'
  | 'parallel'
  | 'swarm'
  | 'group-chat';

export interface WorkflowNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'human' | 'checkpoint';
  agentId?: string;
  toolId?: string;
  condition?: string;
  next?: string | string[];
  config: Record<string, any>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string; // For conditional routing
  is_default?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  pattern: WorkflowPattern;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: WorkflowTrigger[];
  created_at: number;
  enabled: boolean;
}

export interface WorkflowTrigger {
  type: 'manual' | 'api' | 'cron' | 'event';
  config: Record<string, any>;
}

export type ExecutionResult = {
  success: boolean;
  output: any;
  duration_ms: number;
  nodes_executed: string[];
  errors: string[];
};

export class WorkflowExecutor {
  private db: any;
  
  constructor() {
    this.db = getDatabase();
  }
  
  async execute(workflowId: string, inputs: Record<string, any>): Promise<ExecutionResult> {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    
    const startTime = Date.now();
    const result: ExecutionResult = {
      success: false,
      output: {},
      duration_ms: 0,
      nodes_executed: [],
      errors: []
    };
    
    // Execute based on pattern
    switch (workflow.pattern) {
      case 'sequential':
        result.nodes_executed = await this.executeSequential(workflow, inputs);
        break;
      case 'hierarchical':
        result.nodes_executed = await this.executeHierarchical(workflow, inputs);
        break;
      case 'parallel':
        result.nodes_executed = await this.executeParallel(workflow, inputs);
        break;
      case 'round-robin':
        result.nodes_executed = await this.executeRoundRobin(workflow, inputs);
        break;
      case 'swarm':
        result.nodes_executed = await this.executeSwarm(workflow, inputs);
        break;
      case 'group-chat':
        result.nodes_executed = await this.executeGroupChat(workflow, inputs);
        break;
      default:
        throw new Error(`Unknown workflow pattern: ${workflow.pattern}`);
    }
    
    result.duration_ms = Date.now() - startTime;
    result.success = result.errors.length === 0;
    
    // Update workflow execution stats
    this.updateWorkflowStats(workflowId, result);
    
    return result;
  }
  
  private async executeSequential(workflow: Workflow, inputs: any): Promise<string[]> {
    const nodesExecuted: string[] = [];
    
    for (const node of workflow.nodes) {
      try {
        const result = await this.executeNode(node, inputs);
        nodesExecuted.push(node.id);
        
        // Update inputs with output from this node
        if (result.output) {
          inputs = { ...inputs, ...result.output };
        }
      } catch (error) {
        throw new Error(`Node ${node.id} failed: ${error.message}`);
      }
    }
    
    return nodesExecuted;
  }
  
  private async executeParallel(workflow: Workflow, inputs: any): Promise<string[]> {
    const nodesExecuted: string[] = [];
    const parallelNodes = workflow.nodes.filter(n => n.type !== 'condition');
    
    // Execute all non-condition nodes in parallel
    const promises = parallelNodes.map(async node => {
      try {
        const result = await this.executeNode(node, inputs);
        nodesExecuted.push(node.id);
        return result;
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    const results = await Promise.all(promises);
    
    // Filter successful executions
    return nodesExecuted.filter((_, i) => results[i] && results[i].success);
  }
  
  private async executeNode(node: WorkflowNode, inputs: any): Promise<any> {
    switch (node.type) {
      case 'agent':
        return await this.executeAgent(node, inputs);
      case 'tool':
        return await this.executeTool(node, inputs);
      case 'condition':
        return await this.evaluateCondition(node, inputs);
      case 'human':
        return await this.requestHumanApproval(node, inputs);
      case 'checkpoint':
        return await this.saveCheckpoint(node, inputs);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }
  
  private async executeAgent(node: WorkflowNode, inputs: any): Promise<any> {
    const { dispatchSingleTask } = await import('./task-dispatch');
    
    const task = {
      title: `Workflow: ${node.id}`,
      description: `Agent execution as part of workflow ${node.id}`,
      status: 'assigned',
      assigned_to: node.agentId,
      metadata: JSON.stringify({
        workflow_id: inputs.workflow_id,
        workflow_node_id: node.id,
        workflow_inputs: inputs
      })
    };
    
    const result = await dispatchSingleTask(task);
    return result;
  }
  
  private async executeTool(node: WorkflowNode, inputs: any): Promise<any> {
    // Execute tool (database query, API call, etc.)
    const db = getDatabase();
    
    // Example: execute a database query
    if (node.toolId === 'query-database') {
      const query = node.config.query;
      const results = db.prepare(query).all() as any[];
      return { results };
    }
    
    throw new Error(`Unknown tool: ${node.toolId}`);
  }
  
  private evaluateCondition(node: WorkflowNode, inputs: any): any {
    // Evaluate JavaScript condition
    try {
      const fn = new Function('inputs', `'use strict'; return (${node.condition})`);
      const result = fn(inputs);
      return { type: 'condition', condition: node.condition, result };
    } catch (error) {
      throw new Error(`Condition evaluation failed: ${error.message}`);
    }
  }
  
  private async requestHumanApproval(node: WorkflowNode, inputs: any): Promise<any> {
    // Create approval request
    const { createRequest } = await import('./approval-gates');
    
    const request = await createRequest({
      gate_id: node.config.approval_gate_id,
      task_id: inputs.task_id,
      agent_id: node.agentId,
      payload: inputs,
      reason: `Human approval required for node: ${node.id}`,
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + (node.config.timeout || 3600),
      status: 'pending'
    });
    
    return { type: 'human', request_id: request.id, approved: false };
  }
  
  private async saveCheckpoint(node: WorkflowNode, inputs: any): Promise<any> {
    const { saveCheckpoint } = await import('./checkpoint-manager');
    
    saveCheckpoint(inputs.task_id, {
      stage: node.id,
      progress: 50 + (node.config.progress || 0),
      message: `Checkpoint: ${node.id}`,
      timestamp: Date.now()
    });
    
    return { type: 'checkpoint', node_id: node.id, saved: true };
  }
  
  // Pattern-specific execution methods
  private async executeHierarchical(workflow: Workflow, inputs: any): Promise<string[]> {
    // Manager agent distributes tasks to worker agents
    const managerNode = workflow.nodes.find(n => n.config.role === 'manager');
    const workerNodes = workflow.nodes.filter(n => n.config.role === 'worker');
    
    // Manager assigns tasks
    const managerOutput = await this.executeAgent(managerNode!, inputs);
    
    // Workers execute their tasks in parallel
    return await this.executeParallel({ ...workflow, nodes: workerNodes }, inputs);
  }
  
  private async executeRoundRobin(workflow: Workflow, inputs: any): Promise<string[]> {
    // Agents take turns executing
    const nodesExecuted: string[] = [];
    
    for (let i = 0; i < workflow.nodes.length; i++) {
      const node = workflow.nodes[i];
      const nextNode = workflow.nodes[(i + 1) % workflow.nodes.length];
      
      const result = await this.executeNode(node, inputs);
      nodesExecuted.push(node.id);
      
      // Pass context to next agent
      if (result.output) {
        inputs = { ...inputs, ...result.output, round: i };
      }
    }
    
    return nodesExecuted;
  }
  
  private async executeSwarm(workflow: Workflow, inputs: any): Promise<string[]> {
    // Triaging agent routes to appropriate specialist agents
    const triageNode = workflow.nodes.find(n => n.config.role === 'triage');
    const specialistNodes = workflow.nodes.filter(n => n.config.role === 'specialist');
    
    // Triage agent determines which specialists to use
    const triageResult = await this.executeAgent(triageNode!, inputs);
    
    // Route to specialists based on triage result
    const specialistIds = this.routeToSpecialists(triageResult.output, specialistNodes);
    
    // Execute specialists
    return await this.executeParallel({
      ...workflow,
      nodes: specialistNodes.filter(n => specialistIds.includes(n.id))
    }, inputs);
  }
  
  private routeToSpecialists(triageOutput: any, specialists: WorkflowNode[]): string[] {
    // Simple routing based on triage output
    const mappedIds: string[] = [];
    
    if (triageOutput.type === 'backend') {
      specialists.forEach(n => {
        if (n.config.expertise === 'backend') mappedIds.push(n.id);
      });
    } else if (triageOutput.type === 'frontend') {
      specialists.forEach(n => {
        if (n.config.expertise === 'frontend') mappedIds.push(n.id);
      });
    } else {
      // All-purpose specialist
      specialists.forEach(n => mappedIds.push(n.id));
    }
    
    return mappedIds;
  }
  
  private async executeGroupChat(workflow: Workflow, inputs: any): Promise<string[]> {
    // Multiple agents chat to solve a problem
    const nodeList = workflow.nodes.filter(n => n.type === 'agent');
    const chatHistory: any[] = [];
    
    for (const node of nodeList) {
      const result = await this.executeAgent(node, { ...inputs, chatHistory });
      chatHistory.push(result);
    }
    
    return nodeList.map(n => n.id);
  }
  
  private getWorkflow(id: string): Workflow | null {
    const workflow = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as any;
    if (!workflow) return null;
    
    return {
      id: workflow.id,
      name: workflow.name,
      pattern: workflow.pattern as WorkflowPattern,
      nodes: JSON.parse(workflow.nodes || '[]'),
      edges: JSON.parse(workflow.edges || '[]'),
      triggers: JSON.parse(workflow.triggers || '[]'),
      created_at: workflow.created_at,
      enabled: !!workflow.enabled
    };
  }
  
  private updateWorkflowStats(workflowId: string, result: ExecutionResult): void {
    const db = getDatabase();
    
    // Update execution count and stats
    db.prepare(`
      UPDATE workflows 
      SET execution_count = COALESCE(execution_count, 0) + 1,
          last_execution = ?,
          avg_duration = (COALESCE(avg_duration, 0) * COALESCE(execution_count, 0) + ?) / (COALESCE(execution_count, 0) + 1)
      WHERE id = ?
    `).run(
      Math.floor(Date.now() / 1000),
      result.duration_ms,
      workflowId
    );
  }
  
  // Error recovery
  async recoverExecutions(workflowId: string, lastSuccessfulNode: string): Promise<void> {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) return;
    
    // Reset to last successful node
    const lastIdx = workflow.nodes.findIndex(n => n.id === lastSuccessfulNode);
    if (lastIdx === -1) return;
    
    // Mark remaining nodes for re-execution
    this.db.prepare(`
      UPDATE workflow_executions 
      SET status = 'pending', retry_count = COALESCE(retry_count, 0) + 1
      WHERE workflow_id = ? AND node_order > ?
    `).run(workflowId, lastIdx);
  }
}

export const workflowExecutor = new WorkflowExecutor();
```

### Task 3: Workflow Editor UI (src/components/workflow-editor/)
Create three components for the workflow editor.

**Node Palette** (node-palette.tsx):
```typescript
const NodePalette: React.FC<{ onSelect: (type: WorkflowNodeType) => void }> = ({ onSelect }) => {
  const nodeTypes = [
    { id: 'agent', name: 'Agent', icon: '🤖', tooltip: 'AI Agent' },
    { id: 'tool', name: 'Tool', icon: '🔧', tooltip: 'Tool/Function' },
    { id: 'condition', name: 'Condition', icon: '❓', tooltip: 'Branching Logic' },
    { id: 'human', name: 'Human', icon: '👤', tooltip: 'Human Approval' },
    { id: 'checkpoint', name: 'Checkpoint', icon: '💾', tooltip: 'Checkpoint State' }
  ];
  
  return (
    <div className="w-64 bg-gray-900 p-4 rounded-l-lg border-r border-gray-800">
      <h3 className="font-bold mb-4 text-gray-300">Nodes</h3>
      <div className="space-y-2">
        {nodeTypes.map(node => (
          <div
            key={node.id}
            onClick={() => onSelect(node.id as any)}
            className="flex items-center gap-3 p-3 bg-gray-800 rounded hover:bg-gray-700 cursor-pointer transition-colors"
          >
            <span className="text-2xl">{node.icon}</span>
            <div className="flex-1">
              <div className="font-medium text-gray-200">{node.name}</div>
              <div className="text-xs text-gray-500">{node.tooltip}</div>
            </div>
            <div className="text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 pt-6 border-t border-gray-800">
        <h3 className="font-bold mb-2 text-gray-300">Workflows</h3>
        <WorkflowList onSelect={onWorkflowSelect} />
      </div>
    </div>
  );
};
```

**Properties Panel** (properties-panel.tsx):
```typescript
const PropertiesPanel: React.FC<{ node: WorkflowNode, onChange: (updates: Partial<WorkflowNode>) => void }> = ({ node, onChange }) => {
  const [selectedTool, setSelectedTool] = useState(node.toolId || '');
  const [toolConfig, setToolConfig] = useState(node.config || {});
  
  const handleToolSelect = (value: string) => {
    setSelectedTool(value);
    onChange({ toolId: value, config: { ...toolConfig, tool: value } });
  };
  
  const handleConfigChange = (key: string, value: any) => {
    setToolConfig({ ...toolConfig, [key]: value });
    onChange({ config: { ...toolConfig, [key]: value } });
  };
  
  return (
    <div className="w-64 bg-gray-900 p-4 rounded-r-lg border-l border-gray-800">
      <h3 className="font-bold mb-4 text-gray-300">Properties</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Node Type</label>
          <div className="text-gray-200 font-mono">{node.type}</div>
        </div>
        
        <div>
          <label className="block text-sm text-gray-500 mb-1">Node Name</label>
          <input
            type="text"
            value={node.id}
            onChange={e => onChange({ id: e.target.value })}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
          />
        </div>
        
        {node.type === 'agent' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Agent</label>
            <select
              value={node.agentId || ''}
              onChange={e => onChange({ agentId: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
            >
              <option value="">Select an agent</option>
              <option value="planner">Planner Agent</option>
              <option value="architect">Architect Agent</option>
              <option value="backend">Backend Agent</option>
              <option value="frontend">Frontend Agent</option>
              <option value="qa">QA Agent</option>
              <option value="devops">DevOps Agent</option>
            </select>
          </div>
        )}
        
        {node.type === 'tool' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Tool</label>
            <select
              value={selectedTool}
              onChange={e => handleToolSelect(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
            >
              <option value="">Select a tool</option>
              <option value="query-database">Query Database</option>
              <option value="fetch-api">Fetch API</option>
              <option value="generate-code">Generate Code</option>
              <option value="run-tests">Run Tests</option>
              <option value="deploy-service">Deploy Service</option>
            </select>
            
            {selectedTool === 'query-database' && (
              <div className="mt-3">
                <label className="block text-sm text-gray-500 mb-1">Query</label>
                <textarea
                  value={toolConfig.query || ''}
                  onChange={e => handleConfigChange('query', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded h-20 font-mono text-sm"
                  placeholder="SELECT * FROM tasks"
                />
              </div>
            )}
          </div>
        )}
        
        {node.type === 'condition' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Condition</label>
            <input
              type="text"
              value={node.condition || ''}
              onChange={e => onChange({ condition: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
              placeholder="inputs.status === 'completed'"
            />
            <div className="text-xs text-gray-500 mt-1">
              JavaScript expression - returns true/false
            </div>
          </div>
        )}
        
        {node.type === 'human' && (
          <div>
            <label className="block text-sm text-gray-500 mb-1">Approval Timeout (seconds)</label>
            <input
              type="number"
              value={node.config.timeout || 3600}
              onChange={e => onChange({ config: { ...node.config, timeout: parseInt(e.target.value) } })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
            />
          </div>
        )}
      </div>
    </div>
  );
};
```

**Main Workflow Editor** (workflow-editor.tsx):
```typescript
const WorkflowEditor: React.FC = () => {
  const [workflow, setWorkflow] = useState<Workflow>({
    id: '',
    name: '',
    pattern: 'sequential',
    nodes: [],
    edges: [],
    triggers: [],
    created_at: Math.floor(Date.now() / 1000),
    enabled: true
  });
  
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  
  // React Flow references
  const [onNodesChange, onEdgesChange, onConnect] = ReactFlow.useEvents();
  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.data as WorkflowNode);
  };
  
  const handleSave = async () => {
    const workflowData = {
      id: workflow.id || generateUUID(),
      name: workflow.name,
      pattern: workflow.pattern,
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
      triggers: JSON.stringify(workflow.triggers),
      enabled: workflow.enabled ? 1 : 0,
      created_at: workflow.created_at
    };
    
    const res = await fetch('/api/workflows', {
      method: workflow.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflowData)
    });
    
    const data = await res.json();
    if (data.id) {
      setWorkflow({ ...workflow, id: data.id });
    }
  };
  
  const handleExecute = async () => {
    if (!workflow.id) return;
    
    const res = await fetch(`/api/workflows/${workflow.id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: {} })
    });
    
    const result = await res.json();
    console.log('Workflow executed:', result);
  };
  
  return (
    <div className="flex h-full bg-gray-900">
      {/* Sidebar */}
      <NodePalette onSelect={(type) => {
        const newNode: WorkflowNode = {
          id: `${type}-${nodes.length + 1}`,
          type,
          config: {}
        };
        setNodes([...nodes, newNode]);
        setSelectedNode(newNode);
      }} />
      
      {/* Canvas */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Workflow Name"
              value={workflow.name}
              onChange={e => setWorkflow({ ...workflow, name: e.target.value })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            />
            <select
              value={workflow.pattern}
              onChange={e => setWorkflow({ ...workflow, pattern: e.target.value as WorkflowPattern })}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            >
              <option value="sequential">Sequential</option>
              <option value="hierarchical">Hierarchical</option>
              <option value="parallel">Parallel</option>
              <option value="round-robin">Round Robin</option>
              <option value="swarm">Swarm</option>
              <option value="group-chat">Group Chat</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Save
            </button>
            <button
              onClick={handleExecute}
              className="px-4 py-2 bg-green-600 text-white rounded"
            >
              Execute
            </button>
          </div>
        </div>
        
        {/* React Flow Canvas */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          fitView
          nodeOrigin={[0.5, 0.5]}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      
      {/* Properties Panel */}
      {selectedNode && (
        <PropertiesPanel
          node={selectedNode}
          onChange={(updates) => {
            setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, ...updates } : n));
            setSelectedNode({ ...selectedNode, ...updates });
          }}
        />
      )}
    </div>
  );
};
```

### Task 4: Workflows API
Create `src/app/api/workflows/route.ts`:
```typescript
export async function GET() {
  const db = getDatabase();
  const workflows = db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all() as any[];
  
  return NextResponse.json(workflows.map(w => ({
    ...w,
    nodes: JSON.parse(w.nodes || '[]'),
    edges: JSON.parse(w.edges || '[]'),
    triggers: JSON.parse(w.triggers || '[]')
  })));
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  
  const body = await request.json();
  const workflowId = generateUUID();
  const now = Math.floor(Date.now() / 1000);
  
  const db = getDatabase();
  db.prepare(`
    INSERT INTO workflows (id, name, pattern, nodes, edges, triggers, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workflowId,
    body.name,
    body.pattern,
    JSON.stringify(body.nodes),
    JSON.stringify(body.edges),
    JSON.stringify(body.triggers || []),
    body.enabled ? 1 : 0,
    now
  );
  
  eventBus.broadcast('workflow.created', { workflow_id: workflowId });
  
  return NextResponse.json({ ok: true, id: workflowId });
}
```

And `src/app/api/workflows/[workflowId]/execute/route.ts`:
```typescript
export async function POST(
  request: Request,
  { params }: { params: { workflowId: string } }
) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  
  const { workflowId } = params;
  const body = await request.json();
  const inputs = body.input || {};
  
  try {
    const result = await workflowExecutor.execute(workflowId, {
      ...inputs,
      workflow_id: workflowId
    });
    
    return NextResponse.json({
      ok: result.success,
      result,
      workflow_id: workflowId
    });
  } catch (error: any) {
    return NextResponse.json({ 
      ok: false, 
      error: error.message,
      workflow_id: workflowId
    }, { status: 400 });
  }
}
```

### Task 5: Migration
Add to `src/lib/migrations.ts`:
```typescript
{
  id: '053_workflow_persona_schema',
  up(db) {
    db.exec(`
      -- Workflows Table
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pattern TEXT NOT NULL,
        nodes TEXT NOT NULL,
        edges TEXT NOT NULL,
        triggers TEXT DEFAULT '[]',
        execution_count INTEGER DEFAULT 0,
        avg_duration REAL,
        last_execution INTEGER,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      
      CREATE INDEX IF NOT EXISTS idx_workflows_pattern ON workflows(pattern);
      CREATE INDEX IF NOT EXISTS idx_workflows_enabled ON workflows(enabled);
      
      -- Tasks Table Updates
      ALTER TABLE tasks ADD COLUMN workflow_id TEXT;
      ALTER TABLE tasks ADD COLUMN agent_personality TEXT;
      
      -- Agent Personas Table
      CREATE TABLE IF NOT EXISTS agent_personas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT NOT NULL,
        personality TEXT,
        capabilities TEXT,
        examples TEXT,
        enabled INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      
      INSERT OR IGNORE INTO agent_personas (id, name, description, system_prompt, personality, capabilities, examples, is_default, created_at)
      VALUES 
        ('planner', 'Planner', 'Breaks down complex goals', 'You are a senior project planner...', '{"creativity":0.7,"riskTolerance":0.3,"verbosity":"normal","style":"formal"}', '["planning","scheduling","roadmap-creation"]', '["Create roadmap for MVP"]', 1, unixepoch()),
        ('architect', 'Architect', 'Designs system architecture', 'You are an experienced systems architect...', '{"creativity":0.5,"riskTolerance":0.4,"verbosity":"detailed","style":"technical"}', '["architecture","database","api-design"]', '["Design microservices for e-commerce"]', 1, unixepoch()),
        ('backend', 'Backend Developer', 'Implements backend APIs', 'You are a backend developer...', '{"creativity":0.3,"riskTolerance":0.5,"verbosity":"concise","style":"technical"}', '["backend","api","database"]', '["Create Node.js API"]', 1, unixepoch()),
        ('frontend', 'Frontend Developer', 'Builds user interfaces', 'You are a frontend developer...', '{"creativity":0.8,"riskTolerance":0.6,"verbosity":"normal","style":"casual"}', '["frontend","ui","component-design"]', '["Build React product page"]', 1, unixepoch()),
        ('qa', 'QA Engineer', 'Writes tests and ensures quality', 'You are a QA engineer...', '{"creativity":0.4,"riskTolerance":0.2,"verbosity":"detailed","style":"formal"}', '["testing","qa","coverage"]', '["Write unit tests for payment"]', 1, unixepoch()),
        ('devops', 'DevOps Engineer', 'Manages deployment and infrastructure', 'You are a DevOps engineer...', '{"creativity":0.3,"riskTolerance":0.7,"verbosity":"normal","style":"technical"}', '["deployment","infrastructure","monitoring"]', '["Setup CI/CD pipeline"]', 1, unixepisode()),
        ('reviewer', 'Code Reviewer', 'Reviews code and provides feedback', 'You are a code reviewer...', '{"creativity":0.2,"riskTolerance":0.3,"verbosity":"detailed","style":"formal"}', '["review","security","best-practices"]', '["Review this pull request"]', 1, unixepoch()),
        ('recovery', 'Recovery Agent', 'Handles failures and retries', 'You are a recovery agent...', '{"creativity":0.1,"riskTolerance":0.4,"verbosity":"concise","style":"technical"}', '["recovery","error-handling","resilience"]', '["Handle database connection failure"]', 1, unixepoch())
      ;
    `);
  }
}
```

## Success Criteria
Complete when:
- [ ] Workflow editor can create and save workflows
- [ ] 8 agent personas with distinct personalities working
- [ ] Workflow execution produces expected output (sequential, parallel, hierarchical)
- [ ] 5 workflow patterns implemented (sequential, hierarchical, parallel, round-robin, swarm, group-chat)
- - [ ] Tests pass for all workflow patterns

## Key Constraints
- Follow React Flow patterns for visual editor
- Node types must match workflow-executor implementation
- Use existing approval gates for human approval nodes
- Workflows persist in SQLite database
- Follow existing logger and eventBus patterns

## Dependencies
- None (independent session)

Good luck! You're building the visual workflow and persona capabilities for Mission Control.