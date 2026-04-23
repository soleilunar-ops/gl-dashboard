"use client";

// 07 v0.2 — 마크다운 + [ref:sql.섹션.row_N] 툴팁 렌더.
// rehype-raw 없이, 마크다운 파싱 전에 [ref:...] 토큰을 unicode 표식으로 변환 후
// ReactMarkdown 커스텀 text 렌더에서 다시 <sup>로 치환.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

// 유니코드 사유역 문자로 토큰 경계 표시 (마크다운 파서가 건드리지 않는 문자)
const REF_PLACEHOLDER_OPEN = "\uE000";
const REF_PLACEHOLDER_CLOSE = "\uE001";

function encodeRefs(md: string): string {
  return md.replace(
    /\[ref:([^\]]+)\]/g,
    (_, id) => `${REF_PLACEHOLDER_OPEN}${id}${REF_PLACEHOLDER_CLOSE}`
  );
}

function renderTextWithRefs(text: string): ReactNode[] {
  // ref 태그는 사용자 UX상 노이즈라 렌더링 시 완전 제거.
  // (과거 생성된 리포트에 태그가 남아 있어도 화면엔 보이지 않음)
  const re = new RegExp(
    `${REF_PLACEHOLDER_OPEN}[^${REF_PLACEHOLDER_CLOSE}]+${REF_PLACEHOLDER_CLOSE}`,
    "g"
  );
  const cleaned = text.replace(re, "");
  return [cleaned];
}

export function MarkdownRenderer({ markdown }: { markdown: string }) {
  if (!markdown) return null;
  const encoded = encodeRefs(markdown);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 모든 텍스트 노드에서 치환
        p: ({ children }) => <p className="wr-md-p">{processChildren(children)}</p>,
        li: ({ children }) => <li className="wr-md-li">{processChildren(children)}</li>,
        h1: ({ children }) => <h3 className="wr-md-h1">{processChildren(children)}</h3>,
        h2: ({ children }) => <h4 className="wr-md-h2">{processChildren(children)}</h4>,
        h3: ({ children }) => <h5 className="wr-md-h3">{processChildren(children)}</h5>,
        strong: ({ children }) => (
          <strong className="wr-md-strong">{processChildren(children)}</strong>
        ),
      }}
    >
      {encoded}
    </ReactMarkdown>
  );
}

function processChildren(children: ReactNode): ReactNode {
  if (typeof children === "string") {
    return <>{renderTextWithRefs(children)}</>;
  }
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? <span key={i}>{renderTextWithRefs(c)}</span> : c
    );
  }
  return children;
}
