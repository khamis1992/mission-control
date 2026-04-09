import { getDatabase } from '../db';
import { Checkpoint } from '../checkpoint-manager';

interface PGConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

type PGRow = Record<string, any>;

export class PostgreSQLCheckpointBackend {
  private connection: PGConnection | null = null;

  constructor(connection?: PGConnection) {
    if (connection) {
      this.connection = connection;
    }
  }

  async connect(): Promise<any> {
    if (this.connection) {
      const { Client } = await import('pg');
      const client = new Client(this.connection);
      await client.connect();
      return client;
    }
    throw new Error('PostgreSQL connection not configured');
  }

  async save(taskId: number, checkpoint: Checkpoint): Promise<void> {
    const pgClient = await this.connect();
    
    try {
      await pgClient.query(
        `INSERT INTO checkpoints (task_id, stage, progress, timestamp, data, message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          taskId,
          checkpoint.stage,
          checkpoint.progress,
          checkpoint.timestamp,
          checkpoint.data ? JSON.stringify(checkpoint.data) : null,
          checkpoint.message || null
        ]
      );
    } finally {
      await pgClient.end();
    }
  }

  async load(taskId: number): Promise<Checkpoint | null> {
    const pgClient = await this.connect();
    
    try {
      const result = await pgClient.query(
        `SELECT * FROM checkpoints 
         WHERE task_id = $1 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [taskId]
      );
      
      if (result.rows.length === 0) return null;
      
      const row = result.rows[0] as PGRow;
      return {
        stage: row.stage,
        progress: row.progress,
        timestamp: row.timestamp,
        data: row.data ? JSON.parse(row.data) : undefined,
        message: row.message || undefined
      };
    } finally {
      await pgClient.end();
    }
  }

  async list(taskId: number): Promise<Checkpoint[]> {
    const pgClient = await this.connect();
    
    try {
      const result = await pgClient.query(
        `SELECT * FROM checkpoints 
         WHERE task_id = $1 
         ORDER BY timestamp DESC`,
        [taskId]
      );
      
      return result.rows.map((row: PGRow) => ({
        stage: row.stage,
        progress: row.progress,
        timestamp: row.timestamp,
        data: row.data ? JSON.parse(row.data) : undefined,
        message: row.message || undefined
      }));
    } finally {
      await pgClient.end();
    }
  }

  async delete(id: string): Promise<void> {
    const pgClient = await this.connect();
    
    try {
      await pgClient.query('DELETE FROM checkpoints WHERE id = $1', [id]);
    } finally {
      await pgClient.end();
    }
  }

  async getHistory(taskId: number, lastN: number = 10): Promise<Checkpoint[]> {
    const pgClient = await this.connect();
    
    try {
      const result = await pgClient.query(
        `SELECT * FROM checkpoints 
         WHERE task_id = $1 
         ORDER BY timestamp DESC 
         LIMIT $2`,
        [taskId, lastN]
      );
      
      return result.rows.map((row: PGRow) => ({
        stage: row.stage,
        progress: row.progress,
        timestamp: row.timestamp,
        data: row.data ? JSON.parse(row.data) : undefined,
        message: row.message || undefined
      }));
    } finally {
      await pgClient.end();
    }
  }
}
