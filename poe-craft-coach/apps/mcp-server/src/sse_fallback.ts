import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export function registerSseFallback(
  app: FastifyInstance,
  transports: Map<string, StreamableHTTPServerTransport>
) {
  app.get('/sse', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      reply.code(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports.get(sessionId)!;
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
  });
}
