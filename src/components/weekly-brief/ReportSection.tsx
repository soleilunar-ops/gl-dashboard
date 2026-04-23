"use client";

import { MarkdownRenderer } from "@/lib/dashboard/weekly-brief/markdownRenderer";

interface Props {
  sectionKey: string;
  title: string;
  content: string;
}

export function ReportSection({ sectionKey, title, content }: Props) {
  return (
    <section id={`section-${sectionKey}`} className="wr-section">
      <header className="wr-section-head">
        <h3 className="wr-section-title">{title}</h3>
      </header>
      <div className="wr-section-body">
        <MarkdownRenderer markdown={content} />
      </div>
    </section>
  );
}
