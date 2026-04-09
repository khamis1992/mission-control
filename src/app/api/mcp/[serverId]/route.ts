import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { getMCP_server, updateMCP_server, uninstallMCP_server } from '@/lib/mcp-registry';

export async function GET(request: NextRequest, { params }: { params: Promise<{ serverId: string }> }) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { serverId } = await params;
  const server = getMCP_server(serverId);
  
  if (!server) {
    return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
  }

  return NextResponse.json({ server });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ serverId: string }> }) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { serverId } = await params;
  
  try {
    uninstallMCP_server(serverId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to uninstall MCP server' }, { status: 500 });
  }
}
