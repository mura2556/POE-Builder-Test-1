import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { httpJson } from '../util/http.js';

interface WikiSearchResponse {
  query?: {
    search: Array<{
      title: string;
      snippet: string;
      pageid: number;
    }>;
  };
}

interface WikiExtractResponse {
  query?: {
    pages: Record<
      string,
      {
        extract: string;
        title: string;
      }
    >;
  };
}

const schema = z.object({
  topic: z.string().min(1)
});

export const wikiTool = makeTool(
  'wiki_tool',
  'Retrieve a summary from the PoE wiki',
  schema,
  async ({ topic }) => {
    const start = Date.now();
    const sources: string[] = [];
    try {
      const search = await httpJson<WikiSearchResponse>(
        'https://www.poewiki.net/w/api.php?action=query&list=search&format=json&srprop=snippet&srsearch=' +
          encodeURIComponent(topic)
      );
      sources.push('poewiki search');

      const hits = search.data.query?.search ?? [];
      if (!hits.length) {
        return withError('No wiki results found', {
          timingMs: Date.now() - start,
          sources
        });
      }

      const top = hits[0];
      const extract = await httpJson<WikiExtractResponse>(
        'https://www.poewiki.net/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&format=json&pageids=' +
          top.pageid
      );
      sources.push('poewiki extracts');

      const page = extract.data.query?.pages?.[String(top.pageid)];
      const explainer = page?.extract ?? top.snippet.replace(/<[^>]+>/g, '');
      const link = `https://www.poewiki.net/wiki/${encodeURIComponent(top.title.replace(/ /g, '_'))}`;

      return withMeta(
        {
          explainer,
          links: [link],
          sources
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
