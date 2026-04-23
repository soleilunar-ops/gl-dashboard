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
      <h2 className="hb-date-line">
        <time dateTime={header.dateISO}>{header.dayLabel}</time>
      </h2>
      <p className="hb-meta-line">{header.metaLine}</p>
    </div>
  );
}
