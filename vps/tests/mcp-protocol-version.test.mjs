import test from 'node:test';
import assert from 'node:assert/strict';
import {__test} from '../src/mcp-handler.mjs';

test('initialize only advertises the MCP handshake version JUGEST actually implements',()=>{
  assert.equal(__test.initializeResult({protocolVersion:'2025-06-18'}).protocolVersion,'2025-06-18');
  assert.equal(__test.initializeResult({protocolVersion:'2099-01-01'}).protocolVersion,'2025-06-18');
  assert.equal(__test.initializeResult({protocolVersion:'2026-07-28'}).protocolVersion,'2025-06-18');
  assert.equal(__test.initializeResult({}).protocolVersion,'2025-06-18');
});
