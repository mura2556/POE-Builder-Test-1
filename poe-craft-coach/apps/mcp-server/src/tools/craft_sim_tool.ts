import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { db } from '../util/db.js';

const schema = z.object({
  base: z.string(),
  ilvl: z.number().min(1),
  targetMods: z.array(z.string()).nonempty(),
  method: z
    .enum(['alt-aug', 'essences', 'fossils', 'harvest', 'beast', 'bench', 'metacraft'])
    .optional(),
  budget: z
    .object({
      currency: z.string(),
      amount: z.number().nonnegative()
    })
    .optional()
});

const modLookup = db.prepare(
  `SELECT id, domain, generation_type, full_text, spawn_weights_json
   FROM mods
   WHERE base LIKE @base AND full_text LIKE @needle
   LIMIT 25`
);

export const craftSimTool = makeTool(
  'craft_sim_tool',
  'Estimate crafting odds for a target item',
  schema,
  async ({ base, ilvl, targetMods, method, budget }) => {
    const start = Date.now();
    const sources = ['poedb.tw'];
    try {
      const matches = targetMods.map(mod => {
        const rows = modLookup.all({ base: `%${base}%`, needle: `%${mod}%` }) as Array<{
          id: string;
          domain: string;
          generation_type: string;
          full_text: string;
          spawn_weights_json: string | null;
        }>;
        return {
          mod,
          rows
        };
      });

      const weights = matches.map(match => {
        const row = match.rows[0];
        if (!row?.spawn_weights_json) {
          return 0.05;
        }
        try {
          const parsed = JSON.parse(row.spawn_weights_json);
          const weight = parsed.find((entry: any) => entry.tag === 'default')?.weight ?? 0;
          return weight > 0 ? weight / 10000 : 0.05;
        } catch {
          return 0.05;
        }
      });

      const combinedWeight = weights.reduce((acc, weight) => (weight > 0 ? acc * weight : acc * 0.05), 1);
      const expectedAttempts = combinedWeight > 0 ? Math.round(1 / combinedWeight) : 9999;
      const methodLabel = method ?? 'alt-aug';
      const expectedCost = budget ? Math.min(budget.amount, expectedAttempts * (budget.amount / Math.max(expectedAttempts, 1))) : expectedAttempts * 0.1;

      const stepPlan = [
        {
          step: 1,
          action: 'Prepare base',
          notes: `Ensure ${base} at item level ${ilvl}`,
          cost: budget ? `${(budget.amount * 0.1).toFixed(2)} ${budget.currency}` : 'Varies'
        },
        {
          step: 2,
          action: `Spam via ${methodLabel}`,
          notes: `Aim for ${targetMods.join(', ')}`,
          cost: budget ? `${(budget.amount * 0.8).toFixed(2)} ${budget.currency}` : 'Ongoing'
        },
        {
          step: 3,
          action: 'Finish at bench / harvest as needed',
          notes: 'Lock prefixes/suffixes where possible.',
          cost: budget ? `${(budget.amount * 0.1).toFixed(2)} ${budget.currency}` : 'Bench fee'
        }
      ];

      return withMeta(
        {
          expectedAttempts,
          expectedCost,
          stepPlan,
          failureBranches: [
            'If you hit fractures early, consider reforging via harvest.',
            'If suffixes brick, scour + prefix lock before reroll.'
          ],
          alternates: [
            'Check trade listings for fractured bases.',
            'Harvest reforge keeping suffixes as backup plan.'
          ]
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
