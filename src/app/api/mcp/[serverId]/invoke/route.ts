import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { invokeMCPTOOL } from '@/lib/mcp-registry';

export async function POST(request: NextRequest, { params }: { params: Promise<{ serverId: string }> }) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { serverId } = await params;
  const body = await request.json();
  
  const { tool, args } = body;

  if (!tool) {
    return NextResponse.json({ error: 'tool is required' }, { status: 400 });
  }

  try {
    const result = await invokeMCPTOOL(serverId, tool, args || {});
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message || 'Failed to invoke MCP tool',
      server_id: serverId,
      tool
    }, { status: 500 });
  }
}
