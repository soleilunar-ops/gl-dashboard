// 변경 이유: 기상청 단기예보 PCP 값이 문자열·범위 등 다양해 mm 숫자로 안전 변환합니다.
/** PCP fcstValue → mm (합산용 근사치) */
export function parsePcpMillimeters(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "강수없음") return 0;
  if (trimmed.includes("미만")) {
    const num = Number(trimmed.replace(/[^0-9.]/g, ""));
    return Number.isFinite(num) ? num * 0.5 : 0;
  }
  if (trimmed.includes("~")) {
    const parts = trimmed.split("~").map((chunk) => Number(chunk.replace(/[^0-9.]/g, "")));
    const a = parts[0];
    const b = parts[1];
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    if (Number.isFinite(a)) return a;
    return 0;
  }
  const single = Number(trimmed.replace(/[^0-9.]/g, ""));
  return Number.isFinite(single) ? single : 0;
}
