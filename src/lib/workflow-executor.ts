import { getDatabase } from './db';
import { eventBus } from './event-bus';
import { saveCheckpoint } from './checkpoint-manager';
import { approvalClient } from './approval-gates';
import { randomUUID } from 'crypto';

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
  condition?: string;
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
    
    this.updateWorkflowStats(workflowId, result);
    
    eventBus.broadcast('workflow.executed', {
      workflow_id: workflowId,
      success: result.success,
      duration_ms: result.duration_ms,
      nodes_executed: result.nodes_executed.length
    });
    
    return result;
  }
  
  private async executeSequential(workflow: Workflow, inputs: any): Promise<string[]> {
    const nodesExecuted: string[] = [];
    let currentInputs = inputs;
    
    for (const node of workflow.nodes) {
      try {
        const result = await this.executeNode(node, currentInputs);
        nodesExecuted.push(node.id);
        
        if (result.output) {
          currentInputs = { ...currentInputs, ...result.output };
        }
      } catch (error: any) {
        throw new Error(`Node ${node.id} failed: ${error.message}`);
      }
    }
    
    return nodesExecuted;
  }
  
  private async executeParallel(workflow: Workflow, inputs: any): Promise<string[]> {
    const nodesExecuted: string[] = [];
    const parallelNodes = workflow.nodes.filter(n => n.type !== 'condition');
    
    const promises = parallelNodes.map(async node => {
      try {
        const result = await this.executeNode(node, inputs);
        nodesExecuted.push(node.id);
        return result;
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });
    
    const results = await Promise.all(promises);
    
    return nodesExecuted.filter((_, i) => results[i] && results[i].success);
  }
  
  private async executeNode(node: WorkflowNode, inputs: any): Promise<any> {
    switch (node.type) {
      case 'agent':
        return await this.dispatchTask(node, inputs);
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
  
  private async dispatchTask(node: WorkflowNode, inputs: any): Promise<any> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    
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
    
    const taskRow = db.prepare(`
      INSERT INTO tasks (title, description, status, assigned_to, metadata, created_at, updated_at, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.title,
      task.description,
      task.status,
      task.assigned_to || 'system',
      task.metadata,
      now,
      now,
      inputs.workspace_id || 1
    );
    
    return { 
      type: 'task', 
      task_id: taskRow.lastInsertRowid as number,
      output: { task_id: taskRow.lastInsertRowid as number }
    };
  }
  
  private async executeTool(node: WorkflowNode, inputs: any): Promise<any> {
    const db = getDatabase();
    
    if (node.toolId === 'query-database') {
      const query = node.config.query;
      if (!query) {
        throw new Error('Query not specified for query-database tool');
      }
      const results = db.prepare(query).all() as any[];
      return { results };
    } else if (node.toolId === 'fetch-api') {
      const apiUrl = node.config.url;
      if (!apiUrl) {
        throw new Error('URL not specified for fetch-api tool');
      }
      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(`API request failed: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      return { data };
    }
    
    throw new Error(`Unknown tool: ${node.toolId}`);
  }
  
  private evaluateCondition(node: WorkflowNode, inputs: any): any {
    try {
      const fn = new Function('inputs', `'use strict'; return (${node.condition})`);
      const result = fn(inputs);
      return { type: 'condition', condition: node.condition, result };
    } catch (error) {
      throw new Error(`Condition evaluation failed: ${(error as Error).message}`);
    }
  }
  
  private async requestHumanApproval(node: WorkflowNode, inputs: any): Promise<any> {
    const gateId = node.config.approval_gate_id || randomUUID();
    const createdGate = await approvalClient.createGate({
      task_id: inputs.task_id || 0,
      agent_id: node.agentId || 'unknown',
      name: `Approval: ${node.id}`,
      condition: 'after_result',
      mode: 'ALWAYS',
      approvers: node.config.approvers || ['system'],
      timeout: node.config.timeout || 3600,
      status: 'pending'
    });
    
    const request = await approvalClient.createRequest(createdGate, inputs);
    
    return { 
      type: 'human', 
      request_id: request.id,
      gate_id: createdGate,
      approved: false 
    };
  }
  
  private async saveCheckpoint(node: WorkflowNode, inputs: any): Promise<any> {
    const taskId = inputs.task_id || 0;
    
    saveCheckpoint(taskId, {
      stage: node.id,
      progress: 50 + (node.config.progress || 0),
      message: `Checkpoint: ${node.id}`,
      timestamp: Date.now()
    });
    
    return { type: 'checkpoint', node_id: node.id, saved: true };
  }
  
  private async executeHierarchical(workflow: Workflow, inputs: any): Promise<string[]> {
    const managerNode = workflow.nodes.find(n => n.config.role === 'manager');
    const workerNodes = workflow.nodes.filter(n => n.config.role === 'worker');
    
    if (!managerNode) {
      throw new Error('Hierarchical workflow requires a manager node');
    }
    
    const managerOutput = await this.dispatchTask(managerNode, inputs);
    
    return await this.executeParallel({ ...workflow, nodes: workerNodes }, inputs);
  }
  
  private async executeRoundRobin(workflow: Workflow, inputs: any): Promise<string[]> {
    const nodesExecuted: string[] = [];
    
    for (let i = 0; i < workflow.nodes.length; i++) {
      const node = workflow.nodes[i];
      const nextNode = workflow.nodes[(i + 1) % workflow.nodes.length];
      
      const result = await this.executeNode(node, inputs);
      nodesExecuted.push(node.id);
      
      if (result.output) {
        inputs = { ...inputs, ...result.output, round: i };
      }
    }
    
    return nodesExecuted;
  }
  
  private async executeSwarm(workflow: Workflow, inputs: any): Promise<string[]> {
    const triageNode = workflow.nodes.find(n => n.config.role === 'triage');
    const specialistNodes = workflow.nodes.filter(n => n.config.role === 'specialist');
    
    if (!triageNode) {
      throw new Error('Swarm workflow requires a triage node');
    }
    
    const triageResult = await this.dispatchTask(triageNode, inputs);
    
    const specialistIds = this.routeToSpecialists(triageResult.output, specialistNodes);
    
    return await this.executeParallel({
      ...workflow,
      nodes: specialistNodes.filter(n => specialistIds.includes(n.id))
    }, inputs);
  }
  
  private routeToSpecialists(triageOutput: any, specialists: WorkflowNode[]): string[] {
    const mappedIds: string[] = [];
    
    if (triageOutput?.type === 'backend') {
      specialists.forEach(n => {
        if (n.config.expertise === 'backend') mappedIds.push(n.id);
      });
    } else if (triageOutput?.type === 'frontend') {
      specialists.forEach(n => {
        if (n.config.expertise === 'frontend') mappedIds.push(n.id);
      });
    } else {
      specialists.forEach(n => mappedIds.push(n.id));
    }
    
    return mappedIds;
  }
  
  private async executeGroupChat(workflow: Workflow, inputs: any): Promise<string[]> {
    const nodeList = workflow.nodes.filter(n => n.type === 'agent');
    const chatHistory: any[] = [];
    
    for (const node of nodeList) {
      const result = await this.dispatchTask(node, { ...inputs, chatHistory });
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
  
  async recoverExecutions(workflowId: string, lastSuccessfulNode: string): Promise<void> {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) return;
    
    const lastIdx = workflow.nodes.findIndex(n => n.id === lastSuccessfulNode);
    if (lastIdx === -1) return;
    
    this.db.prepare(`
      UPDATE workflow_executions 
      SET status = 'pending', retry_count = COALESCE(retry_count, 0) + 1
      WHERE workflow_id = ? AND node_order > ?
    `).run(workflowId, lastIdx);
  }
}

export const workflowExecutor = new WorkflowExecutor();
