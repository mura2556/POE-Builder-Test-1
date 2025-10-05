import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { resolvePobInput, parsePob } from './pob/shared.js';
import { logger } from '../util/logger.js';

const schema = z.object({
  pob: z.string().min(1, 'PoB import code or URL is required')
});

export const pobTool = makeTool(
  'pob_tool',
  'Decode a Path of Building string or pobb.in URL and summarize the build metrics',
  schema,
  async ({ pob }) => {
    const start = Date.now();
    const sources: string[] = [];
    try {
      const resolved = await resolvePobInput(pob);
      sources.push(resolved.source);
      const parsed = parsePob(resolved.xml);
      const summary = {
        summary: {
          className: parsed.summary.className,
          ascendancy: parsed.summary.ascendancy,
          level: parsed.summary.level,
          life: parsed.summary.life,
          energyShield: parsed.summary.energyShield,
          ward: parsed.summary.ward,
          mana: parsed.summary.mana
        },
        metrics: parsed.summary.metrics,
        pobXml: resolved.xml,
        warnings: [] as string[]
      };

      return withMeta(summary, {
        timingMs: Date.now() - start,
        sources
      });
    } catch (error) {
      logger.error({ error }, 'failed to decode PoB');
      return withError(error instanceof Error ? error.message : 'Unknown error', {
        timingMs: Date.now() - start,
        sources
      });
    }
  }
);
