/**
 * .env.local 에서 팀이 쓰는 이름( final_key / final_api_key )과 표준 이름을 함께 지원한다.
 * 서버 전용 — 클라이언트 번들에 넣지 말 것.
 */

export function resolveAnthropicApiKey(): string | undefined {
  const v = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? process.env.final_key;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export function resolveOpenAiApiKey(): string | undefined {
  const v = process.env.OPENAI_API_KEY ?? process.env.final_api_key;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
