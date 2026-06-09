import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { IChingCard } from "../types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, Save, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { db, doc, writeBatch } from "../lib/supabaseDb";
import { handleSupabaseError, OperationType } from "../lib/supabaseErrors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { HEX_LINES } from "../constants";
import {
  createMasterDataVersion,
  writeMasterDataMarker,
} from "../lib/masterDataCache";

interface MasterDataViewProps {
  cards: IChingCard[];
  setCards: (
    cards: IChingCard[] | ((prev: IChingCard[]) => IChingCard[]),
  ) => void;
  onSyncMasterData: () => void | Promise<void>;
  isSyncingMasterData: boolean;
  onMasterDataWritten: (version: string) => void;
}

export default function MasterDataView({
  cards,
  setCards,
  onSyncMasterData,
  isSyncingMasterData,
  onMasterDataWritten,
}: MasterDataViewProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    cards[0]?.id || null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [editingCard, setEditingCard] = useState<IChingCard | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("master-sidebar-width");
    return saved ? parseInt(saved, 10) : 320;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    localStorage.setItem("master-sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth]);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    sidebar.style.width = `${sidebarWidth}px`;
  }, [sidebarWidth]);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = Math.max(280, Math.min(600, mouseMoveEvent.clientX));
        setSidebarWidth(newWidth);
      }
    },
    [isResizing],
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const selectedCard = cards.find((c) => c.id === selectedCardId);

  useEffect(() => {
    if (hasChanges) return;
    setEditingCard(selectedCard ? { ...selectedCard } : null);
  }, [hasChanges, selectedCard]);

  const filteredCards = cards.filter(
    (c) =>
      c.number.toString().includes(searchQuery) ||
      c.vietnameseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.englishName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSelectCard = (id: string) => {
    if (hasChanges) {
      setPendingCardId(id);
      return;
    }
    executeSelectCard(id);
  };

  const executeSelectCard = (id: string) => {
    setSelectedCardId(id);
    const card = cards.find((c) => c.id === id);
    setEditingCard(card ? { ...card } : null);
    setHasChanges(false);
    setPendingCardId(null);
  };

  const handleInputChange = (
    field: keyof IChingCard,
    value: string | number,
  ) => {
    if (!editingCard) return;
    setEditingCard({ ...editingCard, [field]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!editingCard) return;

    const updatedAt = new Date().toISOString();
    const updatedCard = {
      ...editingCard,
      updatedAt,
    };

    if (db) {
      const path = `iching_cards_master/${editingCard.id}`;
      try {
        const version = createMasterDataVersion();
        const batch = writeBatch(db);
        batch.set(doc(db, "iching_cards_master", editingCard.id), updatedCard);
        writeMasterDataMarker({ batch, db }, version);
        await batch.commit();
        setCards((prev) =>
          prev.map((c) => (c.id === editingCard.id ? updatedCard : c)),
        );
        onMasterDataWritten(version);
        toast.success("Card saved to cloud");
      } catch (error) {
        handleSupabaseError(error, OperationType.WRITE, path);
      }
    } else {
      setCards((prev) =>
        prev.map((c) => (c.id === editingCard.id ? updatedCard : c)),
      );
      toast.success("Card saved locally");
    }
    setHasChanges(false);
  };

  // Initialize editing card if not set
  if (!editingCard && selectedCard) {
    setEditingCard({ ...selectedCard });
  }

  const hexLines = editingCard
    ? HEX_LINES[editingCard.number] || [1, 1, 1, 1, 1, 1]
    : [];

  return (
    <div
      className={`flex h-full bg-[#f8f9fa] overflow-hidden ${isResizing ? "select-none cursor-col-resize" : ""}`}
    >
      {/* Sidebar - List of Cards */}
      <aside
        ref={sidebarRef}
        className="border-r border-[#e2e8f0] flex flex-col bg-white shadow-xl z-10 h-full min-h-0 overflow-hidden relative transition-[width] duration-0"
      >
        <div className="p-6 border-b border-[#e2e8f0]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <Input
              placeholder="Search hexagrams..."
              className="pl-10 h-10 bg-[#f8f9fa] border-[#e2e8f0] rounded-xl text-sm focus:border-[#166db0] transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1 min-h-0 h-full">
          <div className="p-4 space-y-2">
            {filteredCards.map((card) => {
              const isSelected = selectedCardId === card.id;
              return (
                <button
                  key={card.id}
                  onClick={() => handleSelectCard(card.id)}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all text-left group border ${
                    isSelected
                      ? "bg-[#166db0]/5 border-[#166db0]"
                      : "hover:bg-[#f8f9fa] border-transparent"
                  }`}
                >
                  <span
                    className={`text-[12px] font-bold w-6 transition-colors ${isSelected ? "text-[#004c9f]" : "text-[#7a6e6e]"}`}
                  >
                    #{String(card.number).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0 space-y-[1px]">
                    <div
                      className={`font-extrabold truncate text-sm transition-colors ${isSelected ? "text-[#000000]" : "text-[#2f1616]"}`}
                    >
                      {card.vietnameseName}
                    </div>
                    <div
                      className={`text-[10.5px] truncate font-bold uppercase tracking-wider transition-colors ${isSelected ? "text-[#004c9f]" : "text-[#7a6e6e]"}`}
                    >
                      {card.englishName}
                    </div>
                  </div>
                  <div
                    className={`text-3xl transition-all group-hover:scale-110 drop-shadow-sm transition-colors ${isSelected ? "text-[#004c9f] opacity-100 scale-110" : "text-[#000000] opacity-80"}`}
                  >
                    {card.imgPath}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Resize Handle */}
        <div
          onMouseDown={startResizing}
          className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize group flex items-center justify-center transition-colors hover:bg-[#166db0]/10 ${isResizing ? "bg-[#166db0]/20" : ""}`}
        >
          <div
            className={`w-[2px] h-8 bg-[#e2e8f0] rounded-full transition-colors group-hover:bg-[#166db0]/40 ${isResizing ? "bg-[#166db0]" : ""}`}
          />
        </div>
      </aside>

      {/* Main Content - Editor */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f8f9fa] h-full min-h-0">
        {editingCard ? (
          <>
            <header className="h-16 border-b border-[#e2e8f0] flex items-center justify-between px-8 bg-white shadow-sm z-10">
              <div className="flex items-center gap-4">
                <h2 className="text-[14.5px] font-bold text-[#3c424b] uppercase tracking-[0.15em]">
                  Diệp Thiên Đế Nghịch Thiên Hoang Cổ Thánh Thể
                </h2>
                {hasChanges && (
                  <div className="flex items-center gap-1.5 text-[#166db0] text-[10px] font-bold uppercase tracking-widest bg-[#166db0]/5 px-2 py-1 rounded-full border border-[#166db0]/10">
                    <AlertCircle className="w-3 h-3" />
                    Unsaved Changes
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onSyncMasterData()}
                  disabled={isSyncingMasterData || hasChanges}
                  className="h-10 gap-2 rounded-xl border-[#e2e8f0] bg-white px-4 text-xs font-bold uppercase tracking-wider text-[#495360] hover:border-[#166db0] hover:text-[#166db0]"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isSyncingMasterData ? "animate-spin" : ""}`}
                  />
                  Sync
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges}
                  className="bg-[#166db0] hover:bg-[#0e4a77] text-white gap-2 px-6 h-10 rounded-xl shadow-lg shadow-[#166db0]/20 font-bold uppercase tracking-wider text-xs"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </Button>
              </div>
            </header>

            <ScrollArea className="flex-1 min-h-0 h-full">
              <div className="max-w-4xl mx-auto p-10 space-y-12">
                {/* Preview Card */}
                <div className="flex justify-center items-start">
                  <div className="w-[140px] h-[190px] bg-white border border-[#e2e8f0] rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.08)] relative flex flex-col items-center justify-between p-4 overflow-hidden">
                    <div className="text-[19px] font-bold text-[#000000] relative -top-[2px] z-10">
                      {String(editingCard.number).padStart(2, "0")}
                    </div>

                    {/* Hexagram Visual */}
                    <div className="w-[60px] h-[60px] flex flex-col-reverse justify-center gap-1.5 mt-0 mb-2 relative -top-[2px] z-10">
                      {hexLines.map((line, idx) => (
                        <div
                          key={idx}
                          className="w-full h-[5px] flex gap-[10px]"
                        >
                          {line === 1 ? (
                            <div className="w-full bg-[#0f172a] rounded-full" />
                          ) : (
                            <>
                              <div className="w-[25px] bg-[#0f172a] rounded-full" />
                              <div className="w-[25px] bg-[#0f172a] rounded-full" />
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="text-center w-full space-y-0.5 relative z-10">
                      <div className="font-extrabold text-[15px] text-[#0f172a] truncate leading-tight w-[125px] ml-[-10px] mr-0 mt-0 relative -top-[2px]">
                        {editingCard.vietnameseName}
                      </div>
                      <div className="text-[12px] text-[#333a41] italic truncate font-medium w-[125px] ml-[-11px] mr-0 text-center">
                        {editingCard.englishName}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-[25px]">
                    <h3 className="text-[0.75rem] font-bold text-[#495360] uppercase tracking-[0.15em] border-l-2 border-[#166db0] pl-3">
                      Basic Information
                    </h3>
                    <div className="space-y-2.5">
                      <Label className="text-[0.7rem] text-[#495360] uppercase tracking-wider font-bold pl-1">
                        Vietnamese Name
                      </Label>
                      <Input
                        value={editingCard.vietnameseName}
                        onChange={(e) =>
                          handleInputChange("vietnameseName", e.target.value)
                        }
                        className="bg-white border-[#e2e8f0] focus:border-[#166db0] h-11 rounded-xl shadow-sm"
                      />
                    </div>
                    <div className="space-y-2.5">
                      <Label className="text-[0.7rem] text-[#495360] uppercase tracking-wider font-bold pl-1">
                        English Name
                      </Label>
                      <Input
                        value={editingCard.englishName}
                        onChange={(e) =>
                          handleInputChange("englishName", e.target.value)
                        }
                        className="bg-white border-[#e2e8f0] focus:border-[#166db0] h-11 rounded-xl shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-[25px]">
                    <h3 className="text-[0.75rem] font-bold text-[#495360] uppercase tracking-[0.15em] border-l-2 border-[#166db0] pl-3">
                      Reference
                    </h3>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2.5">
                        <Label className="text-[0.7rem] text-[#495360] uppercase tracking-wider font-bold pl-1">
                          Resource {i}
                        </Label>
                        <Input
                          value={(editingCard as any)[`link${i}`]}
                          onChange={(e) =>
                            handleInputChange(`link${i}` as any, e.target.value)
                          }
                          placeholder="https://..."
                          className="bg-white border-[#e2e8f0] focus:border-[#166db0] h-11 rounded-xl shadow-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-[30px]">
                  <h3 className="text-[0.75rem] font-bold text-[#495360] uppercase tracking-[0.15em] border-l-2 border-[#166db0] pl-3">
                    Interpretation
                  </h3>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-3">
                      <Label className="text-[0.7rem] text-[#495360] uppercase tracking-wider font-bold pl-1">
                        Content {i}
                      </Label>
                      <textarea
                        value={(editingCard as any)[`content${i}`]}
                        onChange={(e) =>
                          handleInputChange(
                            `content${i}` as any,
                            e.target.value,
                          )
                        }
                        rows={6}
                        className="w-full bg-white border border-[#e2e8f0] rounded-2xl p-5 text-[0.95rem] leading-relaxed text-[#0f172a] focus:outline-none focus:border-[#166db0] transition-all shadow-sm"
                        placeholder={`Enter detailed interpretation for section ${i}...`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#94a3b8] gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md border border-[#e2e8f0]">
              <Search className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm font-bold uppercase tracking-widest opacity-60">
              Select a card to edit
            </p>
          </div>
        )}
      </main>

      <Dialog
        open={!!pendingCardId}
        onOpenChange={(open) => !open && setPendingCardId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to discard them
              and select another card?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCardId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingCardId && executeSelectCard(pendingCardId)}
            >
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
