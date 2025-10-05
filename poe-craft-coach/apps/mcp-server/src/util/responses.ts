export interface ToolMeta {
  league?: string;
  timingMs: number;
  sources: string[];
  warnings: string[];
}

export interface ToolResponse<T> {
  ok: boolean;
  data: T;
  meta: ToolMeta;
}

export function withMeta<T>(data: T, meta: Partial<ToolMeta> & { timingMs: number }): ToolResponse<T> {
  return {
    ok: true,
    data,
    meta: {
      league: meta.league,
      timingMs: meta.timingMs,
      sources: meta.sources ?? [],
      warnings: meta.warnings ?? []
    }
  };
}

export function withError(message: string, meta: Partial<ToolMeta> & { timingMs: number }): ToolResponse<{ message: string }> {
  return {
    ok: false,
    data: { message },
    meta: {
      league: meta.league,
      timingMs: meta.timingMs,
      sources: meta.sources ?? [],
      warnings: [...(meta.warnings ?? []), message]
    }
  };
}
