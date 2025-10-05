import { inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { load } from 'cheerio';
import { httpText } from '../../util/http.js';

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
  metrics: PobMetrics;
}

export interface PobPayload {
  xml: string;
  summary: PobSummary;
}

const POBB_REGEX = /https?:\/\/pobb\.in\/(\w+)/i;

export async function resolvePobInput(input: string): Promise<{ xml: string; source: string }>{
  let raw = input.trim();
  let source = 'provided';
  const pobb = raw.match(POBB_REGEX);
  if (pobb) {
    const id = pobb[1];
    try {
      const { data } = await httpText(`https://pobb.in/${id}.xml`);
      if (data && data.includes('<')) {
        source = `pobb.in/${id}`;
        raw = data;
      } else {
        const txt = await httpText(`https://pobb.in/${id}.txt`);
        source = `pobb.in/${id}`;
        raw = txt.data;
      }
    } catch (err) {
      const txt = await httpText(`https://pobb.in/${id}.txt`);
      source = `pobb.in/${id}`;
      raw = txt.data;
    }
  } else if (/^https?:/i.test(raw)) {
    const { data } = await httpText(raw);
    source = raw;
    raw = data;
  }

  if (raw.trim().startsWith('<')) {
    return { xml: raw, source };
  }
  const cleaned = raw.replace(/\s+/g, '');
  const inflated = inflateSync(Buffer.from(cleaned, 'base64')).toString('utf-8');
  return { xml: inflated, source };
}

export function parsePob(xml: string): PobPayload {
  const $ = load(xml, { xmlMode: true, decodeEntities: true });
  const build = $('Build');
  const className = build.attr('className');
  const ascendancy = build.attr('ascendClassName');
  const level = build.attr('level') ? Number(build.attr('level')) : undefined;
  const stats = new Map<string, number>();
  $('PlayerStat').each((_, el) => {
    const stat = $(el).attr('stat');
    const value = Number($(el).attr('value'));
    if (stat) {
      stats.set(stat, value);
    }
  });

  const metrics: PobMetrics = {
    dps: stats.get('CombinedDPS') ?? stats.get('AverageDamage'),
    ehp: stats.get('TotalEHP'),
    sustain: stats.get('NetLifeRegen') ?? stats.get('NetEnergyShieldRegen')
  };

  const summary: PobSummary = {
    className: className || undefined,
    ascendancy: ascendancy || undefined,
    level,
    life: stats.get('Life'),
    energyShield: stats.get('EnergyShield'),
    ward: stats.get('Ward'),
    mana: stats.get('Mana'),
    metrics
  };

  return { xml, summary };
}
