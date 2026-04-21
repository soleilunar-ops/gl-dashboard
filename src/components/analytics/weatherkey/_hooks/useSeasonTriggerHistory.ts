"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult } from "../_types";
import type { TriggerName } from "../_tokens";

export type TriggerEvent = {
  date: string;
  trigger: TriggerName;
  temp_min: number | null;
  tmin_delta: number | null;
  max_keyword_ratio: number | null;
  spiked_keywords: string | null;
};

/**
 * 시즌 전체의 트리거 발동 이력 + 해당일 메타(실측 최저기온·변화·키워드 배수).
 * compound=true인 날엔 구성 트리거(cold_shock/first_freeze) 중복 제외.
 */
export function useSeasonTriggerHistory(season: string | null): HookResult<TriggerEvent[]> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TriggerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!season) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: qErr } = await supabase
        .from("v_hotpack_triggers")
        .select(
          "date, cold_shock, compound, first_freeze, search_spike_hotpack, search_spike_any, temp_min, tmin_delta, max_keyword_ratio, spiked_keywords"
        )
        .eq("season", season)
        .order("date", { ascending: true });
      if (qErr) throw new Error(qErr.message);

      const events: TriggerEvent[] = [];
      for (const r of rows ?? []) {
        if (!r.date) continue;
        const meta = {
          temp_min: r.temp_min,
          tmin_delta: r.tmin_delta,
          max_keyword_ratio: r.max_keyword_ratio,
          spiked_keywords: r.spiked_keywords,
        };
        if (r.compound) {
          events.push({ date: r.date, trigger: "compound", ...meta });
        } else {
          if (r.cold_shock) events.push({ date: r.date, trigger: "cold_shock", ...meta });
          if (r.first_freeze) events.push({ date: r.date, trigger: "first_freeze", ...meta });
        }
        if (r.search_spike_hotpack)
          events.push({ date: r.date, trigger: "search_spike_hotpack", ...meta });
        if (r.search_spike_any && !r.search_spike_hotpack)
          events.push({ date: r.date, trigger: "search_spike_any", ...meta });
      }
      setData(events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "트리거 이력 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [season, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
