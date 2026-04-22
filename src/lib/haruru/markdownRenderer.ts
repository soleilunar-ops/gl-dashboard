/**
 * 하루루 답변 텍스트를 렌더 세그먼트로 쪼개는 유틸.
 * `[ref:sql.row_3]`, `[ref:rag.rag_events.128]` 패턴을 태그 세그먼트로 분리해
 * UI에서 툴팁으로 렌더할 수 있게 한다.
 */

export type HaruruSegment =
  | { kind: "text"; value: string }
  | { kind: "ref"; source: "sql" | "rag"; ref: string };

const REF_PATTERN = /\[ref:(sql|rag)\.([^\]]+)\]/g;

export function splitAnswerSegments(answer: string): HaruruSegment[] {
  const segments: HaruruSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  REF_PATTERN.lastIndex = 0;
  while ((m = REF_PATTERN.exec(answer)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", value: answer.slice(last, m.index) });
    }
    segments.push({
      kind: "ref",
      source: m[1] as "sql" | "rag",
      ref: m[2],
    });
    last = m.index + m[0].length;
  }
  if (last < answer.length) {
    segments.push({ kind: "text", value: answer.slice(last) });
  }
  return segments;
}

/**
 * 🔗 근거 블록(── 뒤의 "근거:" 부분)을 본문과 분리.
 * 근거 블록은 메시지 하단에 접기/펼치기 UI로 표시하기 위함.
 */
export interface SplitAnswer {
  body: string;
  citations: string | null;
}

export function splitBodyAndCitations(answer: string): SplitAnswer {
  const idx = answer.indexOf("\n---");
  if (idx < 0) return { body: answer, citations: null };
  return {
    body: answer.slice(0, idx).trimEnd(),
    citations: answer.slice(idx + 4).trim(),
  };
}
