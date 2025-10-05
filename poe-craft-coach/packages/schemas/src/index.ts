import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const MetaSchema = z.object({
  league: z.string().optional(),
  timingMs: z.number(),
  sources: z.array(z.string()),
  warnings: z.array(z.string())
});

const PobInput = z.object({ pob: z.string() });
const PobOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    summary: z.object({
      className: z.string().optional(),
      ascendancy: z.string().optional(),
      level: z.number().optional(),
      life: z.number().optional(),
      energyShield: z.number().optional(),
      ward: z.number().optional(),
      mana: z.number().optional()
    }),
    metrics: z.object({
      dps: z.number().optional(),
      ehp: z.number().optional(),
      sustain: z.number().optional()
    }),
    pobXml: z.string().optional(),
    warnings: z.array(z.string())
  }),
  meta: MetaSchema
});

const PobCompareInput = z.object({
  pobA: z.string(),
  pobB: z.string(),
  budget: z
    .object({
      currency: z.string(),
      amount: z.number()
    })
    .optional()
});

const CraftSimInput = z.object({
  base: z.string(),
  ilvl: z.number(),
  targetMods: z.array(z.string()),
  method: z.string().optional(),
  budget: z
    .object({
      currency: z.string(),
      amount: z.number()
    })
    .optional()
});

const ModLookupInput = z.object({
  base: z.string(),
  tags: z.array(z.string()).optional(),
  query: z.string().optional()
});

const PriceInput = z.object({
  itemOrCurrency: z.string(),
  league: z.string(),
  source: z.string().optional()
});

const TradeSearchInput = z.object({
  league: z.string(),
  filters: z.record(z.any()),
  priceCeiling: z.number().optional()
});

const ItemReadInput = z.object({
  clipboardText: z.string().optional(),
  imagePath: z.string().optional()
});

const WikiInput = z.object({ topic: z.string() });

const SearchInput = z.object({ query: z.string() });

const FetchInput = z.object({
  url: z.string(),
  method: z.string().optional(),
  json: z.record(z.any()).optional()
});

export const toolSchemas = {
  pob_tool: {
    input: zodToJsonSchema(PobInput, 'PobToolInput'),
    output: zodToJsonSchema(PobOutput, 'PobToolOutput')
  },
  build_compare_tool: {
    input: zodToJsonSchema(PobCompareInput, 'BuildCompareInput')
  },
  craft_sim_tool: {
    input: zodToJsonSchema(CraftSimInput, 'CraftSimInput')
  },
  mod_lookup_tool: {
    input: zodToJsonSchema(ModLookupInput, 'ModLookupInput')
  },
  price_tool: {
    input: zodToJsonSchema(PriceInput, 'PriceInput')
  },
  trade_search_tool: {
    input: zodToJsonSchema(TradeSearchInput, 'TradeSearchInput')
  },
  item_read_tool: {
    input: zodToJsonSchema(ItemReadInput, 'ItemReadInput')
  },
  wiki_tool: {
    input: zodToJsonSchema(WikiInput, 'WikiInput')
  },
  search: {
    input: zodToJsonSchema(SearchInput, 'SearchInput')
  },
  fetch: {
    input: zodToJsonSchema(FetchInput, 'FetchInput')
  }
};

export type ToolSchemas = typeof toolSchemas;
