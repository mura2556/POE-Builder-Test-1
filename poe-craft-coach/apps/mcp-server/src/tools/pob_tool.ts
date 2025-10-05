import { z } from 'zod';
import { makeTool } from '../util/tooling.js';
import { withError, withMeta } from '../util/responses.js';
import { logger } from '../util/logger.js';
import { evaluatePob } from './pob/shared.js';

const schema = z.object({
  pob: z.string().min(1, 'PoB import code or URL is required')
});

export const pobTool = makeTool(
  'pob_tool',
  'Decode a Path of Building string or pobb.in URL and summarize the build metrics',
  schema,
  async ({ pob }) => {
    const start = Date.now();
    try {
      const result = await evaluatePob(pob);
      const { summary, metrics, pobXml, pobJson, warnings, sources, timingMs } = result;
      const response = { summary, metrics, pobXml, pobJson, warnings };

      return withMeta(response, {
        timingMs: timingMs ?? Date.now() - start,
        sources,
        warnings,
        league: process.env.LEAGUE
      });
    } catch (error) {
      logger.error({ error }, 'failed to decode PoB');
      return withError(error instanceof Error ? error.message : 'Unknown error', {
        timingMs: Date.now() - start,
        sources: [],
        league: process.env.LEAGUE
      });
    }
  }
);
