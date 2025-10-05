import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PobMetrics {
  dps?: number;
  ehp?: number;
  sustain?: number;
}

export interface PobSummary {
  className?: string;
  ascendancy?: string;
  level?: number;
  life?: number;
  energyShield?: number;
  ward?: number;
  mana?: number;
}

export interface PobEvaluationResult {
  summary: PobSummary;
  metrics: PobMetrics;
  pobXml: string;
  pobJson: Record<string, unknown>;
  warnings: string[];
  sources: string[];
  timingMs: number;
  primarySource?: string;
}

const execFileAsync = promisify(execFile);
const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../data/pob_eval.py'
);

export async function evaluatePob(pob: string): Promise<PobEvaluationResult> {
  const start = Date.now();
  const { stdout } = await execFileAsync('python3', [scriptPath], {
    input: JSON.stringify({ pob }),
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(stdout);
  if (!parsed?.ok) {
    throw new Error(parsed?.error ?? 'PoB evaluation failed');
  }
  const result = parsed.result ?? {};
  const warnings: string[] = Array.isArray(result.warnings) ? result.warnings : [];
  const sources = Array.isArray(result.sources) ? result.sources : [];
  return {
    summary: result.summary ?? {},
    metrics: result.metrics ?? {},
    pobXml: result.pobXml ?? '',
    pobJson: result.playerStats ?? {},
    warnings,
    sources: Array.from(new Set(sources)),
    timingMs: typeof result.timingMs === 'number' ? result.timingMs : Date.now() - start,
    primarySource: typeof result.primarySource === 'string' ? result.primarySource : undefined
  };
}
