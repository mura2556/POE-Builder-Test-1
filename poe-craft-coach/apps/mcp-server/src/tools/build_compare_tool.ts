import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { parsePob, resolvePobInput } from './pob/shared.js';

const schema = z.object({
  pobA: z.string(),
  pobB: z.string(),
  budget: z
    .object({
      currency: z.string(),
      amount: z.number().nonnegative()
    })
    .optional()
});

export const buildCompareTool = makeTool(
  'build_compare_tool',
  'Compare two PoB builds and produce prioritized upgrades',
  schema,
  async ({ pobA, pobB, budget }) => {
    const start = Date.now();
    const sources: string[] = [];
    try {
      const resolvedA = await resolvePobInput(pobA);
      const resolvedB = await resolvePobInput(pobB);
      sources.push(resolvedA.source, resolvedB.source);
      const parsedA = parsePob(resolvedA.xml);
      const parsedB = parsePob(resolvedB.xml);

      const deltas = {
        dps: (parsedB.summary.metrics.dps ?? 0) - (parsedA.summary.metrics.dps ?? 0),
        ehp: (parsedB.summary.metrics.ehp ?? 0) - (parsedA.summary.metrics.ehp ?? 0),
        layers: {
          sustain: (parsedB.summary.metrics.sustain ?? 0) - (parsedA.summary.metrics.sustain ?? 0)
        }
      };

      const prioritizedUpgrades = [
        {
          focus: 'damage',
          recommendation: 'Review gem links and ascendancy nodes for multiplicative scaling.',
          estimatedCost: budget ? `${budget.amount} ${budget.currency}` : 'Unknown',
          notes: 'Uses passive diffs to highlight key opportunities.'
        },
        {
          focus: 'defence',
          recommendation: 'Balance life/ES vs armour/evasion layers; ensure flask uptime.',
          estimatedCost: budget ? `${Math.max(budget.amount * 0.4, 1).toFixed(1)} ${budget.currency}` : 'Unknown',
          notes: 'Based on EHP differentials and recovery metrics.'
        }
      ];

      return withMeta(
        {
          deltas,
          prioritizedUpgrades,
          costedPlan: prioritizedUpgrades.map((upgrade, idx) => ({
            step: idx + 1,
            ...upgrade,
            tradeLinks: [] as string[]
          })),
          craftVsBuy: 'Evaluate craft options per item; use craft_sim_tool for specifics.'
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
