/**
 * 하루루 답변 텍스트를 렌더 세그먼트로 쪼개는 유틸.
 * `[ref:sql.row_3]`, `[ref:rag.rag_events.128]` 패턴을 태그 세그먼트로 분리해
 * UI에서 툴팁으로 렌더할 수 있게 한다.
 */

export type HaruruSegment =
  | { kind: "text"; value: string }
  | { kind: "ref"; source: "sql" | "rag"; ref: string };

const REF_PATTERN = /\[ref:(sql|rag)\.([^\]]+)\]/g;
const REF_PLACEHOLDER_PREFIX = "§§REF§§";

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
 * ReactMarkdown이 본문을 렌더하도록 [ref:...] 패턴을 특수 placeholder로 치환.
 * 렌더러 쪽에서 `splitByRefPlaceholders`로 다시 분리해 <RefTag>와 text로 매핑.
 */
export function encodeRefPlaceholders(answer: string): string {
  return answer.replace(REF_PATTERN, (_full, source, ref) => {
    return `${REF_PLACEHOLDER_PREFIX}${source}:${ref}§§END§§`;
  });
}

export function splitByRefPlaceholders(
  text: string
): Array<{ kind: "text"; value: string } | { kind: "ref"; source: "sql" | "rag"; ref: string }> {
  const pattern = new RegExp(`${REF_PLACEHOLDER_PREFIX}(sql|rag):([^§]+)§§END§§`, "g");
  const out: Array<
    { kind: "text"; value: string } | { kind: "ref"; source: "sql" | "rag"; ref: string }
  > = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "ref", source: m[1] as "sql" | "rag", ref: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

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
