import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { db } from '../util/db.js';

const schema = z.object({
  itemOrCurrency: z.string(),
  league: z.string().default(process.env.LEAGUE ?? 'Standard'),
  source: z.enum(['ninja', 'watch', 'both']).optional()
});

const latestStmt = db.prepare(
  `SELECT item, league, source, chaos_value, divine_value, payload, created_at
   FROM prices
   WHERE item = @item AND league = @league
   AND (@source IS NULL OR source = @source OR @source = 'both')
   ORDER BY datetime(created_at) DESC
   LIMIT 1`
);

const historyStmt = db.prepare(
  `SELECT created_at, chaos_value, divine_value
   FROM prices
   WHERE item = @item AND league = @league
   ORDER BY datetime(created_at) DESC
   LIMIT 60`
);

export const priceTool = makeTool(
  'price_tool',
  'Return latest price snapshot for a currency or item',
  schema,
  async ({ itemOrCurrency, league, source }) => {
    const start = Date.now();
    const sources = ['poe.ninja', 'poe.watch'];
    try {
      const latest = latestStmt.get({ item: itemOrCurrency, league, source: source ?? null }) as
        | {
            item: string;
            league: string;
            source: string;
            chaos_value: number;
            divine_value: number;
            payload: string | null;
            created_at: string;
          }
        | undefined;

      if (!latest) {
        return withError('No pricing data found', {
          timingMs: Date.now() - start,
          sources
        });
      }

      const history = historyStmt.all({ item: itemOrCurrency, league }) as Array<{
        created_at: string;
        chaos_value: number;
        divine_value: number;
      }>;

      const history7d = history.slice(0, 7).reverse();
      const history30d = history.slice(0, 30).reverse();

      return withMeta(
        {
          latest: {
            chaos: latest.chaos_value,
            divine: latest.divine_value,
            source: latest.source,
            asOf: latest.created_at,
            payload: latest.payload ? JSON.parse(latest.payload) : undefined
          },
          history7d,
          history30d,
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
