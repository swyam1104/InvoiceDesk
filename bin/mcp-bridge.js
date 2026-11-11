#!/usr/bin/env node
// InvoiceDesk MCP Stdio-to-HTTP Streamable Bridge
// Bridges Claude Desktop / Cursor stdio JSON-RPC to InvoiceDesk's Streamable HTTP MCP endpoint
import readline from 'readline';

const mcpUrl = process.argv[2] || process.env.MCP_URL || 'http://127.0.0.1:3000/mcp/demo-mcp-token-freelancer-2026';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let buffer = '';

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed && !buffer) return;

  buffer += line + '\n';

  let payload;
  try {
    payload = JSON.parse(buffer.trim());
  } catch (e) {
    // Incomplete JSON payload across multiple lines, wait for next line
    return;
  }

  // Clear buffer once complete JSON object is parsed
  buffer = '';

  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      const errRpc = {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        error: { code: -32000, message: `InvoiceDesk MCP HTTP ${res.status}: ${errText}` },
      };
      process.stdout.write(JSON.stringify(errRpc) + '\n');
      return;
    }

    const text = await res.text();
    // Parse SSE data: lines or raw JSON
    const lines = text.split('\n');
    let matched = false;
    for (const l of lines) {
      if (l.startsWith('data: ')) {
        const jsonStr = l.substring(6).trim();
        if (jsonStr) {
          process.stdout.write(jsonStr + '\n');
          matched = true;
        }
      }
    }

    if (!matched && text.trim().startsWith('{')) {
      process.stdout.write(text.trim() + '\n');
    }
  } catch (err) {
    const errRpc = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: `Bridge error: ${String(err)}` },
    };
    process.stdout.write(JSON.stringify(errRpc) + '\n');
  }
});

