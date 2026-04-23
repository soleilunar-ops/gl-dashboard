"use client";

import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import InventoryDashboard from "./InventoryDashboard";
import { StockMovementLedgerPanel } from "./StockMovementLedgerPanel";
import type { InventoryItem } from "./_hooks/useInventory";

export default function LogisticsGlTab() {
  const [ledgerItem, setLedgerItem] = useState<InventoryItem | null>(null);

  const handleItemClick = useCallback((item: InventoryItem) => {
    setLedgerItem(item);
  }, []);

  return (
    <div className="space-y-6">
      <InventoryDashboard onItemClick={handleItemClick} />

      <Dialog open={ledgerItem !== null} onOpenChange={(open) => !open && setLedgerItem(null)}>
        <DialogContent
          className={cn(
            "top-4 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-4xl translate-y-0 overflow-y-auto sm:max-w-4xl"
          )}
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>입출고 내역</DialogTitle>
          </DialogHeader>
          {ledgerItem ? (
            <StockMovementLedgerPanel
              selectedItem={ledgerItem}
              onClearItem={() => setLedgerItem(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
