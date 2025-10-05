import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { httpJson } from '../util/http.js';

const schema = z.object({
  query: z.string().min(1)
});

export const searchTool = makeTool(
  'search',
  'Generic web search shim for ChatGPT compatibility (uses PoE wiki and poe.ninja)',
  schema,
  async ({ query }) => {
    const start = Date.now();
    const sources: string[] = [];
    try {
      const wiki = await httpJson(
        'https://www.poewiki.net/w/api.php?action=query&list=search&format=json&srsearch=' + encodeURIComponent(query)
      );
      sources.push('poewiki search');
      const wikiHit = (wiki.data as any)?.query?.search?.[0];

      const ninja = await httpJson(
        'https://poe.ninja/api/data/search?league=Settlers&query=' + encodeURIComponent(query)
      ).catch(() => ({ data: null }));
      if (ninja.data) {
        sources.push('poe.ninja search');
      }

      return withMeta(
        {
          topWikiResult: wikiHit
            ? {
                title: wikiHit.title,
                snippet: wikiHit.snippet
              }
            : null,
          ninja: ninja.data,
          originalQuery: query
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
