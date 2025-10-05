import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { db } from '../util/db.js';

const schema = z.object({
  base: z.string(),
  tags: z.array(z.string()).optional(),
  query: z.string().optional()
});

const stmt = db.prepare(
  `SELECT id, type, domain, generation_type, full_text, group_id, spawn_weights_json, tags_json
   FROM mods
   WHERE base LIKE @base AND (@query IS NULL OR full_text LIKE @like)
   LIMIT 100`
);

export const modLookupTool = makeTool(
  'mod_lookup_tool',
  'Lookup mod data from PoEDB cache',
  schema,
  async ({ base, tags, query }) => {
    const start = Date.now();
    const sources = ['poedb.tw'];
    try {
      const rows = stmt.all({ base: `%${base}%`, query: query ?? null, like: query ? `%${query}%` : null }) as Array<{
        id: string;
        type: string;
        domain: string;
        generation_type: string;
        full_text: string;
        group_id: string;
        spawn_weights_json: string | null;
        tags_json: string | null;
      }>;

      const filtered = rows.filter(row => {
        if (!tags?.length) return true;
        if (!row.tags_json) return false;
        try {
          const parsed = JSON.parse(row.tags_json);
          return tags.every(tag => parsed.includes(tag));
        } catch {
          return false;
        }
      });

      const prefixes = filtered.filter(row => row.generation_type === 'prefix');
      const suffixes = filtered.filter(row => row.generation_type === 'suffix');
      const groups = Array.from(new Set(filtered.map(row => row.group_id))).map(group => ({
        group,
        mods: filtered.filter(row => row.group_id === group).map(row => row.full_text)
      }));

      return withMeta(
        {
          prefixes: prefixes.map(row => ({ id: row.id, text: row.full_text })),
          suffixes: suffixes.map(row => ({ id: row.id, text: row.full_text })),
          groups,
          conflicts: [],
          spawnWeights: filtered.map(row => ({
            id: row.id,
            weights: row.spawn_weights_json ? JSON.parse(row.spawn_weights_json) : []
          })),
          special: filtered.filter(row => row.type?.includes('Influence')).map(row => row.full_text),
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
