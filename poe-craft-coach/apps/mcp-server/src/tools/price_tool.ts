import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { db } from '../util/db.js';

const schema = z.object({
  itemOrCurrency: z.string(),
  league: z.string().default(process.env.LEAGUE ?? 'Standard'),
  source: z.enum(['ninja', 'watch', 'both']).optional()
});

type SourceKey = 'ninja' | 'watch';

const latestBySource = {
  ninja: db.prepare(
    `SELECT item, league, chaos_value, divine_value, payload, created_at
     FROM prices_ninja
     WHERE item = @item AND league = @league
     ORDER BY datetime(created_at) DESC
     LIMIT 1`
  ),
  watch: db.prepare(
    `SELECT item, league, chaos_value, divine_value, payload, created_at
     FROM prices_watch
     WHERE item = @item AND league = @league
     ORDER BY datetime(created_at) DESC
     LIMIT 1`
  )
} as const;

const historyBySource = {
  ninja: db.prepare(
    `SELECT chaos_value, divine_value, created_at
     FROM prices_ninja
     WHERE item = @item AND league = @league
     ORDER BY datetime(created_at) DESC
     LIMIT 60`
  ),
  watch: db.prepare(
    `SELECT chaos_value, divine_value, created_at
     FROM prices_watch
     WHERE item = @item AND league = @league
     ORDER BY datetime(created_at) DESC
     LIMIT 60`
  )
} as const;

const sourceLabel: Record<SourceKey, string> = {
  ninja: 'poe.ninja',
  watch: 'poe.watch'
};

export const priceTool = makeTool(
  'price_tool',
  'Return latest price snapshot for a currency or item',
  schema,
  async ({ itemOrCurrency, league, source }) => {
    const start = Date.now();
    const selectedSources: SourceKey[] = (() => {
      if (!source || source === 'both') {
        return ['ninja', 'watch'];
      }
      return [source];
    })();

    try {
      const latestEntries = selectedSources
        .map((key) => {
          const row = latestBySource[key].get({ item: itemOrCurrency, league }) as
            | {
                item: string;
                league: string;
                chaos_value: number;
                divine_value: number;
                payload: string | null;
                created_at: string;
              }
            | undefined;
          if (!row) {
            return undefined;
          }
          return { ...row, source: key as SourceKey };
        })
        .filter((entry): entry is { item: string; league: string; chaos_value: number; divine_value: number; payload: string | null; created_at: string; source: SourceKey } => Boolean(entry));

      if (!latestEntries.length) {
        return withError('No pricing data found', {
          timingMs: Date.now() - start,
          sources: selectedSources.map((key) => sourceLabel[key])
        });
      }

      const preferredOrder: SourceKey[] = source === 'watch' ? ['watch', 'ninja'] : ['ninja', 'watch'];
      const latest = preferredOrder
        .map((key) => latestEntries.find((entry) => entry.source === key))
        .find((entry): entry is (typeof latestEntries)[number] => Boolean(entry))!;

      const historyRecords = selectedSources.flatMap((key) => {
        const rows = historyBySource[key].all({ item: itemOrCurrency, league }) as Array<{
          chaos_value: number;
          divine_value: number;
          created_at: string;
        }>;
        return rows.map((row) => ({
          chaos: row.chaos_value,
          divine: row.divine_value,
          asOf: row.created_at,
          source: sourceLabel[key]
        }));
      });

      const sortedHistory = historyRecords
        .sort((a, b) => new Date(a.asOf).getTime() - new Date(b.asOf).getTime());
      const history7d = sortedHistory.slice(-7);
      const history30d = sortedHistory.slice(-30);

      const response = {
        latest: {
          chaos: latest.chaos_value,
          divine: latest.divine_value,
          source: sourceLabel[latest.source],
          asOf: latest.created_at,
          payload: latest.payload ? JSON.parse(latest.payload) : undefined
        },
        history7d,
        history30d,
        sources: Array.from(new Set(historyRecords.map((record) => record.source)))
      };

      return withMeta(response, {
        timingMs: Date.now() - start,
        sources: Array.from(new Set([sourceLabel[latest.source], ...historyRecords.map((record) => record.source)]))
      });
    } catch (error) {
      return withError(error instanceof Error ? error.message : 'Unknown error', {
        timingMs: Date.now() - start,
        sources: selectedSources.map((key) => sourceLabel[key])
      });
    }
  }
);
