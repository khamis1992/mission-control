import { getDatabase } from '../db';
import { Checkpoint } from '../checkpoint-manager';

export class SQLiteCheckpointBackend {
  async save(taskId: number, checkpoint: Checkpoint): Promise<void> {
    const db = getDatabase();
    
    db.prepare(`
      INSERT INTO checkpoints (task_id, stage, progress, timestamp, data, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      checkpoint.stage,
      checkpoint.progress,
      checkpoint.timestamp,
      checkpoint.data ? JSON.stringify(checkpoint.data) : null,
      checkpoint.message || null
    );
  }
  
  async load(taskId: number): Promise<Checkpoint | null> {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM checkpoints 
      WHERE task_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get(taskId) as any;
    
    if (!row) return null;
    
    return {
      stage: row.stage,
      progress: row.progress,
      timestamp: row.timestamp,
      data: row.data ? JSON.parse(row.data) : undefined,
      message: row.message || undefined
    };
  }
  
  async list(taskId: number): Promise<Checkpoint[]> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM checkpoints 
      WHERE task_id = ? 
      ORDER BY timestamp DESC
    `).all(taskId) as any[];
    
    return rows.map(row => ({
      stage: row.stage,
      progress: row.progress,
      timestamp: row.timestamp,
      data: row.data ? JSON.parse(row.data) : undefined,
      message: row.message || undefined
    }));
  }
  
  async delete(id: string): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM checkpoints WHERE id = ?').run(id);
  }
  
  async getHistory(taskId: number, lastN?: number): Promise<Checkpoint[]> {
    const db = getDatabase();
    const limit = lastN || 10;
    const rows = db.prepare(`
      SELECT * FROM checkpoints 
      WHERE task_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(taskId, limit) as any[];
    
    return rows.map(row => ({
      stage: row.stage,
      progress: row.progress,
      timestamp: row.timestamp,
      data: row.data ? JSON.parse(row.data) : undefined,
      message: row.message || undefined
    }));
  }
}
