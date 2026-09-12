# @rohankumar4179/agentmarket-mcp

A stdio MCP server that bridges local MCP clients (Claude Desktop, Cursor,
Windsurf, the MCP Inspector, ...) to AgentMarket's remote Streamable HTTP MCP
endpoint. These clients only know how to spawn a local stdio process — they
can't speak to a remote `/mcp` URL directly — so this package is a thin
process that forwards every `tools/list`, `tools/call`, `resources/*`, and
`prompts/*` request verbatim to the real server. No catalog, pricing, or
payment logic is duplicated here; see [docs/MCP.md](../../docs/MCP.md) in the
main repo for how the real server works.

## Usage

Add to your MCP client's config (e.g. Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agentmarket": {
      "command": "npx",
      "args": ["-y", "@rohankumar4179/agentmarket-mcp"]
    }
  }
}
```

By default it connects to the deployed AgentMarket API
(`https://agentmarket-api-bedc.onrender.com/mcp`). Point it at a local API
instead (e.g. while developing) with:

```json
{
  "mcpServers": {
    "agentmarket": {
      "command": "npx",
      "args": ["-y", "@rohankumar4179/agentmarket-mcp"],
      "env": { "AGENTMARKET_MCP_URL": "http://localhost:4000/mcp" }
    }
  }
}
```

## Local development

```bash
npm run build --workspace=@rohankumar4179/agentmarket-mcp
AGENTMARKET_MCP_URL=http://localhost:4000/mcp node packages/mcp-server/dist/index.js
```

Or drive it with the official inspector instead of a real MCP client:

```bash
npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js
```
