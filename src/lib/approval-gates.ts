import { getDatabase } from './db';
import { logger } from './logger';
import { randomUUID } from 'crypto';

// ===================
// Type Definitions
// ===================

export type HITLMode = 'ALWAYS' | 'TERMINATE' | 'NEVER' | 'ON_CONDITION';

export type ApprovalCondition = 
  | 'before_tool' 
  | 'after_result' 
  | 'on_error' 
  | 'custom';

export interface ApprovalGate {
  id: string;
  task_id: number;
  agent_id: string;
  name: string;
  condition: ApprovalCondition;
  customCondition?: string;
  mode: HITLMode;
  approvers: string[];
  timeout: number;
  escalationPath?: string;
  created_at: number;
  approved_at?: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface ApprovalRequest {
  id: string;
  gate_id: string;
  task_id: number;
  agent_id: string;
  payload: any;
  reason: string;
  created_at: number;
  expires_at: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ApprovalClient {
  createGate(gate: Omit<ApprovalGate, 'id' | 'created_at'>): Promise<string>;
  updateGate(id: string, updates: Partial<ApprovalGate>): Promise<void>;
  deleteGate(id: string): Promise<void>;
  
  createRequest(gateId: string, payload: any): Promise<ApprovalRequest>;
  approveRequest(requestId: string, userId: string): Promise<void>;
  rejectRequest(requestId: string, userId: string, reason: string): Promise<void>;
  expireRequest(requestId: string): Promise<void>;
  
  getActiveGates(taskId: number): Promise<ApprovalGate[]>;
  getPendingRequests(agentId: string): Promise<ApprovalRequest[]>;
  getRequestById(id: string): Promise<ApprovalRequest | null>;
}

/**
 * Evaluate whether approval should trigger for a given gate and context
 */
export function shouldApprove(gate: ApprovalGate, context: any): boolean {
  switch (gate.mode) {
    case 'ALWAYS':
      return true;
    case 'TERMINATE':
      return context.task_status === 'done' || context.last_tool === 'complete';
    case 'NEVER':
      return false;
    case 'ON_CONDITION':
      try {
        const fn = new Function('context', `'use strict'; return (${gate.customCondition})`);
        return fn(context);
      } catch {
        return false;
      }
  }
}

// ===================
// Database Implementation
// ===================

/**
 * SQLite-based ApprovalClient implementation
 */
export class SQLiteApprovalClient implements ApprovalClient {
  /**
   * Create a new approval gate
   */
  async createGate(gate: Omit<ApprovalGate, 'id' | 'created_at'>): Promise<string> {
    const db = getDatabase();
    const id = randomUUID();
    const created_at = Math.floor(Date.now() / 1000);
    
    const stmt = db.prepare(`
      INSERT INTO approval_gates (
        id, task_id, agent_id, name, condition, customCondition, 
        mode, approvers, timeout, escalationPath, created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      gate.task_id,
      gate.agent_id,
      gate.name,
      gate.condition,
      gate.customCondition || null,
      gate.mode,
      JSON.stringify(gate.approvers),
      gate.timeout,
      gate.escalationPath || null,
      created_at,
      'pending'
    );
    
    logger.info({ gate_id: id, task_id: gate.task_id, agent_id: gate.agent_id }, 'Created approval gate');
    
    return id;
  }

  /**
   * Update an existing approval gate
   */
  async updateGate(id: string, updates: Partial<ApprovalGate>): Promise<void> {
    const db = getDatabase();
    
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.condition !== undefined) {
      fields.push('condition = ?');
      values.push(updates.condition);
    }
    if (updates.customCondition !== undefined) {
      fields.push('customCondition = ?');
      values.push(updates.customCondition);
    }
    if (updates.mode !== undefined) {
      fields.push('mode = ?');
      values.push(updates.mode);
    }
    if (updates.approvers !== undefined) {
      fields.push('approvers = ?');
      values.push(JSON.stringify(updates.approvers));
    }
    if (updates.timeout !== undefined) {
      fields.push('timeout = ?');
      values.push(updates.timeout);
    }
    if (updates.escalationPath !== undefined) {
      fields.push('escalationPath = ?');
      values.push(updates.escalationPath);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.approved_at !== undefined) {
      fields.push('approved_at = ?');
      values.push(updates.approved_at);
    }
    
    if (fields.length === 0) {
      return;
    }
    
    values.push(id);
    
    const stmt = db.prepare(`
      UPDATE approval_gates 
      SET ${fields.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...values);
    
    logger.debug({ gate_id: id, updates }, 'Updated approval gate');
  }

  async deleteGate(id: string): Promise<void> {
    const db = getDatabase();
    
    const deleteRequests = db.prepare('DELETE FROM approval_requests WHERE gate_id = ?');
    deleteRequests.run(id);
    
    const deleteGate = db.prepare('DELETE FROM approval_gates WHERE id = ?');
    deleteGate.run(id);
    
    logger.info({ gate_id: id }, 'Deleted approval gate and associated requests');
  }

  async createRequest(gateId: string, payload: any): Promise<ApprovalRequest> {
    const db = getDatabase();
    
    const gate = db.prepare('SELECT * FROM approval_gates WHERE id = ?').get(gateId) as ApprovalGate | undefined;
    
    if (!gate) {
      throw new Error(`Approval gate ${gateId} not found`);
    }
    
    const id = randomUUID();
    const created_at = Math.floor(Date.now() / 1000);
    const expires_at = created_at + gate.timeout;
    
    const stmt = db.prepare(`
      INSERT INTO approval_requests (
        id, gate_id, task_id, agent_id, payload, reason, 
        created_at, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      gateId,
      gate.task_id,
      gate.agent_id,
      JSON.stringify(payload),
      `Approval required for ${gate.name}`,
      created_at,
      expires_at,
      'pending'
    );
    
    const request: ApprovalRequest = {
      id,
      gate_id: gateId,
      task_id: gate.task_id,
      agent_id: gate.agent_id,
      payload,
      reason: `Approval required for ${gate.name}`,
      created_at,
      expires_at,
      status: 'pending',
    };
    
    logger.info({ request_id: id, gate_id: gateId, task_id: gate.task_id }, 'Created approval request');
    
    return request;
  }

  async approveRequest(requestId: string, userId: string): Promise<void> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    
    const updateRequest = db.prepare(`
      UPDATE approval_requests 
      SET status = 'approved'
      WHERE id = ? AND status = 'pending'
    `);
    updateRequest.run(requestId);
    
    const updateGate = db.prepare(`
      UPDATE approval_gates 
      SET status = 'approved', approved_at = ?
      WHERE id = (SELECT gate_id FROM approval_requests WHERE id = ?)
        AND status = 'pending'
    `);
    updateGate.run(now, requestId);
    
    logger.info({ request_id: requestId, user_id: userId }, 'Approved request');
  }

  async rejectRequest(requestId: string, userId: string, reason: string): Promise<void> {
    const db = getDatabase();
    
    const updateRequest = db.prepare(`
      UPDATE approval_requests 
      SET status = 'rejected'
      WHERE id = ? AND status = 'pending'
    `);
    updateRequest.run(requestId);
    
    const updateGate = db.prepare(`
      UPDATE approval_gates 
      SET status = 'rejected'
      WHERE id = (SELECT gate_id FROM approval_requests WHERE id = ?)
        AND status = 'pending'
    `);
    updateGate.run(requestId);
    
    logger.info({ request_id: requestId, user_id: userId, reason }, 'Rejected request');
  }

  async expireRequest(requestId: string): Promise<void> {
    const db = getDatabase();
    
    const updateRequest = db.prepare(`
      UPDATE approval_requests 
      SET status = 'rejected'
      WHERE id = ? AND status = 'pending'
    `);
    updateRequest.run(requestId);
    
    const updateGate = db.prepare(`
      UPDATE approval_gates 
      SET status = 'expired'
      WHERE id = (SELECT gate_id FROM approval_requests WHERE id = ?)
        AND status = 'pending'
    `);
    updateGate.run(requestId);
    
    logger.info({ request_id: requestId }, 'Expired request');
  }

  /**
   * Get active approval gates for a task
   */
  async getActiveGates(taskId: number): Promise<ApprovalGate[]> {
    const db = getDatabase();
    
    const stmt = db.prepare(`
      SELECT * FROM approval_gates 
      WHERE task_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `);
    
    const rows = stmt.all(taskId) as any[];
    
    return rows.map(row => ({
      ...row,
      approvers: JSON.parse(row.approvers || '[]'),
      created_at: row.created_at,
      approved_at: row.approved_at || undefined,
    }));
  }

  /**
   * Get pending approval requests for an agent
   */
  async getPendingRequests(agentId: string): Promise<ApprovalRequest[]> {
    const db = getDatabase();
    
    const stmt = db.prepare(`
      SELECT * FROM approval_requests 
      WHERE agent_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `);
    
    const rows = stmt.all(agentId) as any[];
    
    return rows.map(row => ({
      ...row,
      payload: JSON.parse(row.payload || '{}'),
    }));
  }

  /**
   * Get approval request by ID
   */
  async getRequestById(id: string): Promise<ApprovalRequest | null> {
    const db = getDatabase();
    
    const stmt = db.prepare('SELECT * FROM approval_requests WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) {
      return null;
    }
    
    return {
      ...row,
      payload: JSON.parse(row.payload || '{}'),
    };
  }
}

export const approvalClient = new SQLiteApprovalClient();

/**
 * Standalone helper to get active approval gates for a task
 */
export async function getActiveGates(taskId: number): Promise<ApprovalGate[]> {
  return approvalClient.getActiveGates(taskId);
}