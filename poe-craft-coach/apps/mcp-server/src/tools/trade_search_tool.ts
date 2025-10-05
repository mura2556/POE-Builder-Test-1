import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { httpJson } from '../util/http.js';

const schema = z.object({
  league: z.string(),
  filters: z.record(z.any()),
  priceCeiling: z.number().optional()
});

interface TradeSearchResponse {
  id: string;
  result: string[];
  total: number;
}

interface TradeFetchResponse {
  result: Array<{
    id: string;
    listing: {
      price?: {
        currency: string;
        amount: number;
      };
      account: { name: string };
    };
    item: {
      name: string;
      typeLine: string;
    };
  }>;
}

export const tradeSearchTool = makeTool(
  'trade_search_tool',
  'Search the official trade API for listings matching filters',
  schema,
  async ({ league, filters, priceCeiling }) => {
    const start = Date.now();
    const sources = [`official trade api (${league})`];
    try {
      const searchBody = {
        query: filters,
        sort: { price: 'asc' }
      };
      const search = await httpJson<TradeSearchResponse>(
        `https://www.pathofexile.com/api/trade/search/${encodeURIComponent(league)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'poe-craft-coach/0.1'
          },
          body: JSON.stringify(searchBody)
        }
      );

      const hits = search.data.result.slice(0, 10);
      if (!hits.length) {
        return withMeta(
          {
            queryJson: searchBody,
            results: [],
            sources
          },
          {
            timingMs: Date.now() - start,
            sources
          }
        );
      }

      const fetchRes = await httpJson<TradeFetchResponse>(
        `https://www.pathofexile.com/api/trade/fetch/${hits.join(',')}?query=${search.data.id}`,
        {
          headers: {
            'User-Agent': 'poe-craft-coach/0.1'
          }
        }
      );

      const results = fetchRes.data.result
        .map(hit => {
          const price = hit.listing.price;
          if (priceCeiling && price && price.amount > priceCeiling) {
            return null;
          }
          return {
            name: `${hit.item.name || ''} ${hit.item.typeLine}`.trim(),
            price: price ? `${price.amount} ${price.currency}` : 'n/a',
            link: `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${search.data.id}`
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .slice(0, 5);

      return withMeta(
        {
          queryJson: searchBody,
          results,
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
