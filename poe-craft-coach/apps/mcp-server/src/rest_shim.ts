import { fetch } from 'undici';

async function main() {
  const endpoint = process.env.MCP_URL ?? 'http://localhost:8081/mcp';
  const body = {
    jsonrpc: '2.0',
    id: 'listTools-1',
    method: 'tools/list'
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  console.log(res.status, text);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
