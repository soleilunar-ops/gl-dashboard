interface SummaryCardsProps {
  totalSku: number;
  totalStockAmount: number;
  todayIncoming: number;
  todayOutgoing: number;
}

const wonFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

export function SummaryCards({
  totalSku,
  totalStockAmount,
  todayIncoming,
  todayOutgoing,
}: SummaryCardsProps) {
  const cards = [
    { label: "총 SKU", value: totalSku.toLocaleString(), valueClassName: "text-gray-900" },
    {
      label: "총 재고금액",
      value: wonFormatter.format(totalStockAmount),
      valueClassName: "text-gray-900",
    },
    {
      label: "오늘 입고",
      value: todayIncoming.toLocaleString(),
      valueClassName: "text-emerald-600",
    },
    { label: "오늘 출고", value: todayOutgoing.toLocaleString(), valueClassName: "text-rose-600" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{card.label}</p>
          <p className={`mt-2 text-xl font-semibold ${card.valueClassName}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
