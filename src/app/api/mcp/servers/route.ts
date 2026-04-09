import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getMCP_server, listMCP_servers, installMCP_server, updateMCP_server, uninstallMCP_server, testMCPServerConnection, fetchRegistryServers, syncMCPServersFromRegistry, initializeMCPRegistry } from '@/lib/mcp-registry';
import { requireRole } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getDatabase();
  
  try {
    initializeMCPRegistry();
    
    const servers = listMCP_servers();
    
    return NextResponse.json({ servers });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch MCP servers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getDatabase();
  
  try {
    initializeMCPRegistry();
    
    const body = await request.json();
    const server = {
      id: body.id,
      name: body.name,
      transport: body.transport,
      command: body.command,
      url: body.url,
      config: body.config,
      enabled: body.enabled !== undefined ? body.enabled : true,
      created_at: Math.floor(Date.now() / 1000)
    };

    if (!server.id || !server.name || !server.transport) {
      return NextResponse.json({ error: 'id, name, and transport are required' }, { status: 400 });
    }

    const existing = getMCP_server(server.id);
    if (existing) {
      return NextResponse.json({ error: 'MCP server already exists' }, { status: 409 });
    }

    installMCP_server(server);

    return NextResponse.json({ ok: true, server_id: server.id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to install MCP server' }, { status: 500 });
  }
}
