"use client";

interface Props {
  header: {
    dateISO: string;
    dayLabel: string;
    seasonLabel: string;
    metaLine: string;
  };
}

export function BriefingHeader({ header }: Props) {
  return (
    <div className="hb-card-header">
      <div className="hb-season-badge">
        <span aria-hidden>🔥</span>
        <span>{header.seasonLabel}</span>
      </div>
      <h2 className="hb-date-line">
        <time dateTime={header.dateISO}>{header.dayLabel}</time>
      </h2>
      <p className="hb-meta-line">{header.metaLine}</p>
    </div>
  );
}
