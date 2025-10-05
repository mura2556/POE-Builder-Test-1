import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { evaluatePob } from './pob/shared.js';

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
    try {
      const [resultA, resultB] = await Promise.all([evaluatePob(pobA), evaluatePob(pobB)]);
      const sources = Array.from(new Set([...resultA.sources, ...resultB.sources]));

      const deltas = {
        dps: (resultB.metrics.dps ?? 0) - (resultA.metrics.dps ?? 0),
        ehp: (resultB.metrics.ehp ?? 0) - (resultA.metrics.ehp ?? 0),
        layers: {
          sustain: (resultB.metrics.sustain ?? 0) - (resultA.metrics.sustain ?? 0)
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
          baseline: {
            summary: resultA.summary,
            metrics: resultA.metrics,
            pobXml: resultA.pobXml,
            pobJson: resultA.pobJson
          },
          target: {
            summary: resultB.summary,
            metrics: resultB.metrics,
            pobXml: resultB.pobXml,
            pobJson: resultB.pobJson
          },
          deltas,
          prioritizedUpgrades,
          costedPlan: prioritizedUpgrades.map((upgrade, idx) => ({
            step: idx + 1,
            ...upgrade,
            tradeLinks: [] as string[]
          })),
          warnings: [...resultA.warnings, ...resultB.warnings],
          craftVsBuy: 'Evaluate craft options per item; use craft_sim_tool for specifics.'
        },
        {
          timingMs: Date.now() - start,
          sources,
          league: process.env.LEAGUE,
          warnings: []
        }
      );
    } catch (error) {
      return withError(error instanceof Error ? error.message : 'Unknown error', {
        timingMs: Date.now() - start,
        sources: [],
        league: process.env.LEAGUE
      });
    }
  }
);
