import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { httpJson, httpText } from '../util/http.js';

const schema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST']).default('GET'),
  json: z.record(z.any()).optional()
});

export const fetchTool = makeTool(
  'fetch',
  'Generic fetch utility compatible with ChatGPT connectors',
  schema,
  async ({ url, method, json }) => {
    const start = Date.now();
    const sources = [url];
    try {
      if (method === 'GET' && !json) {
        const res = await httpText(url);
        return withMeta(
          {
            body: res.data,
            status: res.status,
            headers: Object.fromEntries(res.headers.entries())
          },
          {
            timingMs: Date.now() - start,
            sources
          }
        );
      }
      const res = await httpJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: json ? JSON.stringify(json) : undefined
      });
      return withMeta(
        {
          body: res.data,
          status: res.status,
          headers: Object.fromEntries(res.headers.entries())
        },
        {
          timingMs: Date.now() - start,
          sources
        }
      );
    } catch (error) {
      return withError(error instanceof Error ? error.message : 'Unknown error', {
        timingMs: Date.now() - start,
        sources
      });
    }
  }
);
