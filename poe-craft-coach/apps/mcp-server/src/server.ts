import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './util/logger.js';
import { registerTool } from './util/tooling.js';
import { pobTool } from './tools/pob_tool.js';
import { buildCompareTool } from './tools/build_compare_tool.js';
import { craftSimTool } from './tools/craft_sim_tool.js';
import { modLookupTool } from './tools/mod_lookup_tool.js';
import { priceTool } from './tools/price_tool.js';
import { tradeSearchTool } from './tools/trade_search_tool.js';
import { itemReadTool } from './tools/item_read_tool.js';
import { wikiTool } from './tools/wiki_tool.js';
import { searchTool } from './tools/search_tool.js';
import { fetchTool } from './tools/fetch_tool.js';
import { registerSseFallback } from './sse_fallback.js';

const PORT = Number(process.env.PORT ?? 8081);
const HOST = process.env.HOST ?? '127.0.0.1';

async function bootstrap() {
  const app = Fastify({
    logger: false,
    bodyLimit: 4 * 1024 * 1024
  });

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (/^https?:\/\/localhost(?::\d+)?$/i.test(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true
  });

  app.server.setTimeout(5 * 60 * 1000);
  // @ts-expect-error Node's http server exposes headersTimeout on the server instance.
  app.server.headersTimeout = 5 * 60 * 1000;
  // @ts-expect-error requestTimeout is available on Node 20's http server implementation.
  app.server.requestTimeout = 5 * 60 * 1000;

  const server = new McpServer(
    {
      name: 'poe-craft-coach',
      version: '0.1.0'
    },
    {
      capabilities: {
        logging: {},
        tools: { listChanged: true }
      },
      instructions: 'Use the provided tools to evaluate Path of Exile builds, prices, and crafts.'
    }
  );

  [
    pobTool,
    buildCompareTool,
    craftSimTool,
    modLookupTool,
    priceTool,
    tradeSearchTool,
    itemReadTool,
    wikiTool,
    searchTool,
    fetchTool
  ].forEach(tool => registerTool(server, tool));

  const transports = new Map<string, StreamableHTTPServerTransport>();

  registerSseFallback(app, transports);

  app.post('/mcp', async (request, reply) => {
    const body = request.body as any;
    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    const respond = async (transport: StreamableHTTPServerTransport) => {
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, body);
    };

    try {
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await respond(transport);
        return;
      }

      if (isInitializeRequest(body)) {
        const eventStore = new InMemoryEventStore();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          eventStore,
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
            logger.info({ sid }, 'session initialized');
          },
          onsessionclosed: (sid) => {
            transports.delete(sid);
            logger.info({ sid }, 'session closed');
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            transports.delete(sid);
            logger.info({ sid }, 'transport closed');
          }
        };

        await server.connect(transport);
        await respond(transport);
        return;
      }

      reply.code(400).send({ error: 'Missing or invalid session id' });
    } catch (error) {
      logger.error({ error }, 'failed to handle /mcp request');
      if (!reply.sent) {
        reply.code(500).send({ error: 'Internal error' });
      }
    }
  });

  app.delete('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      reply.code(400).send('Invalid or missing session ID');
      return;
    }
    const transport = transports.get(sessionId)!;
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
    transports.delete(sessionId);
  });

  await app.listen({ port: PORT, host: HOST });
  logger.info(`MCP server listening on http://${HOST}:${PORT}`);
}

bootstrap().catch(error => {
  logger.error({ error }, 'fatal error during bootstrap');
  process.exit(1);
});
