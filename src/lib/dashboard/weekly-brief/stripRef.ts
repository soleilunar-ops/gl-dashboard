// 주간 리포트 텍스트에서 [ref:sql.섹션.row_N] 출처 태그를 제거하고
// 결과의 연속 공백을 정리한다. 과거 리포트에 태그가 남아있어도 UX에 영향 없도록.

const REF_RE = /\[ref:[^\]]+\]/g;

export function stripRef(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(REF_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,?!])/g, "$1")
    .trim();
}
