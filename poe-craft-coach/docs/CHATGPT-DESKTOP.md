# ChatGPT Desktop Connector Setup

Follow these steps to connect the local Path of Exile Craft Coach MCP server to ChatGPT Desktop (Custom Connectors enabled):

1. Start the MCP server (see the First-Run checklist or run `pnpm mcp:http`).
2. Open **ChatGPT Desktop** and click the **Settings** icon in the bottom-left corner.
3. Navigate to **Connectors → New Connector**.
4. When prompted for the MCP server URL, enter: `http://localhost:8081/mcp`.
5. Save the connector. The tool list should include:
   - `pob_tool`
   - `build_compare_tool`
   - `craft_sim_tool`
   - `mod_lookup_tool`
   - `price_tool`
   - `trade_search_tool`
   - `item_read_tool`
   - `wiki_tool`
   - `search`
   - `fetch`
6. If you do not see the tools immediately, restart ChatGPT Desktop or toggle the connector off and back on once the MCP server is running.
7. Optional: For legacy clients that require Server-Sent Events, use `http://localhost:8081/sse` as the fallback streaming endpoint.

That's it—ChatGPT Desktop will now call the local MCP server directly whenever conversations require Path of Exile coaching.
