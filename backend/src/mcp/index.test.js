'use strict';

const jwt = require('jsonwebtoken');
const { TOOL_DEFINITIONS, handleJsonRpcMessage } = require('./index');

describe('FridayOS MCP gateway', () => {
  const ctx = {
    kind: 'user',
    userId: '11111111-1111-4111-8111-111111111111',
    userRole: 'admin',
    username: 'ishant@friday.mu',
    displayName: 'Ishant',
    tenantId: '00000000-0000-0000-0000-000000000001',
    scopes: ['mcp:read', 'mcp:write', 'mcp:high-risk'],
  };

  it('exposes phase 1, 2, and 3 tools', () => {
    const phases = new Set(TOOL_DEFINITIONS.map((t) => t.phase));
    expect(phases.has(1)).toBe(true);
    expect(phases.has(2)).toBe(true);
    expect(phases.has(3)).toBe(true);
    expect(TOOL_DEFINITIONS.some((t) => t.name === 'action.request.create')).toBe(true);
    expect(TOOL_DEFINITIONS.some((t) => t.name === 'action.request.confirm')).toBe(true);
  });

  it('returns initialize metadata', async () => {
    const res = await handleJsonRpcMessage(ctx, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res.result.serverInfo.name).toBe('fridayos-fad-mcp');
    expect(res.result.capabilities.tools).toEqual({});
  });

  it('lists tools in MCP format', async () => {
    const res = await handleJsonRpcMessage(ctx, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res.result.tools.length).toBeGreaterThan(10);
    expect(res.result.tools[0]).toHaveProperty('inputSchema');
  });

  it('keeps high-risk execution behind a confirm tool', () => {
    const highRisk = TOOL_DEFINITIONS.filter((t) => t.phase === 3);
    expect(highRisk.map((t) => t.name).sort()).toEqual(['action.request.confirm', 'action.request.create']);
  });

  it('can mint a representative user JWT for MCP clients in tests', () => {
    const token = jwt.sign(
      { user_id: ctx.userId, role: 'admin', username: ctx.username, tenant_id: ctx.tenantId },
      'test-secret',
    );
    expect(token.split('.')).toHaveLength(3);
  });
});
