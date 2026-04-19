import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  newPo: string;
  setNewPo: (v: string) => void;
  newProduct: string;
  setNewProduct: (v: string) => void;
  newErp: string;
  setNewErp: (v: string) => void;
  newOrderDate: string;
  setNewOrderDate: (v: string) => void;
  onSubmit: () => Promise<void>;
};

export function NewLeadTimeDialog({
  open,
  onOpenChange,
  newPo,
  setNewPo,
  newProduct,
  setNewProduct,
  newErp,
  setNewErp,
  newOrderDate,
  setNewOrderDate,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>신규 건 추가 (수기)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label htmlFor="dlg_po">발주번호</Label>
            <Input id="dlg_po" value={newPo} onChange={(e) => setNewPo(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dlg_prd">품목명</Label>
            <Input
              id="dlg_prd"
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dlg_order_date">발주일 (선택)</Label>
            <Input
              id="dlg_order_date"
              type="date"
              value={newOrderDate}
              onChange={(e) => setNewOrderDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dlg_erp">품목코드 (ERP, 선택)</Label>
            <Input id="dlg_erp" value={newErp} onChange={(e) => setNewErp(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={!newPo.trim() || !newProduct.trim()}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
