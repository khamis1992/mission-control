import { getDatabase } from './db';
import { eventBus, EventType } from './event-bus';
import { logger } from './logger';

export interface MCPServer {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  command?: string;
  url?: string;
  config?: any;
  enabled: boolean;
  created_at: number;
}

const MCP_REGISTRY_URL = 'https://registry.mcp.tools/api/servers';

export function listMCP_servers(): MCPServer[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all() as MCPServer[];
  
  return rows.map(server => ({
    ...server,
    config: server.config ? JSON.parse(server.config) : undefined
  }));
}

export function getMCP_server(serverId: string): MCPServer | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(serverId) as MCPServer | undefined;
  
  if (!row) return null;
  
  return {
    ...row,
    config: row.config ? JSON.parse(row.config) : undefined
  };
}

export function installMCP_server(server: MCPServer): void {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  
  db.prepare(`
    INSERT INTO mcp_servers (id, name, transport, command, url, config, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    server.id,
    server.name,
    server.transport,
    server.command || null,
    server.url || null,
    server.config ? JSON.stringify(server.config) : null,
    server.enabled ? 1 : 0,
    now
  );
  
  eventBus.broadcast('mcp.server_installed' as EventType, { server_id: server.id });
  logger.info({ server_id: server.id }, 'MCP server installed');
}

export function updateMCP_server(serverId: string, updates: Partial<MCPServer>): void {
  const db = getDatabase();
  
  const existing = getMCP_server(serverId);
  if (!existing) {
    throw new Error(`MCP server "${serverId}" not found`);
  }
  
  const updatesObj: any = { ...updates };
  
  if (updatesObj.config) {
    updatesObj.config = JSON.stringify(updates.config);
  }
  
  const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
  
  const setClauses = [];
  const params: any[] = [];
  
  if (updates.name !== undefined) { setClauses.push('name = ?'); params.push(updates.name); }
  if (updates.transport !== undefined) { setClauses.push('transport = ?'); params.push(updates.transport); }
  if (updates.command !== undefined) { setClauses.push('command = ?'); params.push(updates.command); }
  if (updates.url !== undefined) { setClauses.push('url = ?'); params.push(updates.url); }
  if (updates.config !== undefined) { setClauses.push('config = ?'); params.push(updates.config); }
  if (updates.enabled !== undefined) { setClauses.push('enabled = ?'); params.push(enabled); }
  
  setClauses.push('updated_at = ?');
  params.push(Math.floor(Date.now() / 1000));
  
  params.push(serverId);
  
  db.prepare(`
    UPDATE mcp_servers
    SET ${setClauses.join(', ')}
    WHERE id = ?
  `).run(...params);
  
  eventBus.broadcast('mcp.server_updated' as EventType, { server_id: serverId });
  logger.info({ server_id: serverId }, 'MCP server updated');
}

export function uninstallMCP_server(serverId: string): void {
  const db = getDatabase();
  
  const existing = getMCP_server(serverId);
  if (!existing) {
    throw new Error(`MCP server "${serverId}" not found`);
  }
  
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(serverId);
  
  eventBus.broadcast('mcp.server_removed' as EventType, { server_id: serverId });
  logger.info({ server_id: serverId }, 'MCP server uninstalled');
}

export async function invokeMCPTOOL(serverId: string, tool: string, args: any): Promise<any> {
  const server = getMCP_server(serverId);
  if (!server) {
    throw new Error(`MCP server "${serverId}" not found`);
  }
  
  if (!server.enabled) {
    throw new Error(`MCP server "${serverId}" is disabled`);
  }
  
  logger.info({ server_id: serverId, tool, args }, 'Invoking MCP tool');
  
  return {
    success: true,
    server_id: serverId,
    tool,
    args,
    result: `Mock result from ${serverId}.${tool}(${JSON.stringify(args)})`
  };
}

export async function testMCPServerConnection(server: MCPServer): Promise<boolean> {
  try {
    switch (server.transport) {
      case 'stdio':
        return !!server.command;
      
      case 'http':
        const httpUrl = server.url || 'http://localhost:3000';
        const httpResponse = await fetch(httpUrl);
        return httpResponse.ok;
      
      case 'websocket':
        return !!server.url;
      
      default:
        return false;
    }
  } catch (error) {
    logger.error({ server_id: server.id, error }, 'MCP server connection test failed');
    return false;
  }
}

export async function fetchRegistryServers(): Promise<MCPServer[]> {
  try {
    const response = await fetch(MCP_REGISTRY_URL);
    
    if (!response.ok) {
      throw new Error(`Registry API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    return (data.servers || []).map((registryServer: any): MCPServer => ({
      id: registryServer.id || registryServer.name,
      name: registryServer.name,
      transport: registryServer.transport || 'http',
      url: registryServer.url,
      command: registryServer.command,
      enabled: true,
      created_at: Math.floor(Date.now() / 1000)
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to fetch MCP servers from registry');
    return [];
  }
}

export async function syncMCPServersFromRegistry(): Promise<{ installed: number; updated: number; failed: number }> {
  let installed = 0;
  let updated = 0;
  let failed = 0;
  
  const registryServers = await fetchRegistryServers();
  
  if (registryServers.length === 0) {
    return { installed: 0, updated: 0, failed: 0 };
  }
  
  for (const registryServer of registryServers) {
    const existing = getMCP_server(registryServer.id);
    
    try {
      if (!existing) {
        installMCP_server(registryServer);
        installed++;
      } else if (registryServer.name !== existing.name || registryServer.url !== existing.url) {
        updateMCP_server(registryServer.id, registryServer);
        updated++;
      }
    } catch (error) {
      logger.error({ server_id: registryServer.id, error }, 'Failed to sync server from registry');
      failed++;
    }
  }
  
  return { installed, updated, failed };
}

export function initializeMCPRegistry(): void {
  const db = getDatabase();
  
  const tableExists = db.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'mcp_servers'`
  ).get() as { ok?: number } | undefined;
  
  if (tableExists?.ok) return;
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      command TEXT,
      url TEXT,
      config TEXT,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
  `);
  
  logger.info('MCP servers table created');
}
