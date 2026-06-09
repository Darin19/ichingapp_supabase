import { DeckCard, DeckMode, DeckType } from "../types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Shuffle, Layers, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { Input } from "@/components/ui/input";
import { HEX_LINES } from "../constants";
import goldenDragon from "../assets/images/golden_dragon.png";
import tarotCover from "../assets/images/ady.jpg";

interface DeckAreaProps {
  cards: DeckCard[];
  deckType: DeckType;
  onDeckTypeChange: (deckType: DeckType) => void;
  mode: DeckMode;
  onModeChange: (mode: DeckMode) => void;
  onDraw: (
    cardId: string,
    x: number,
    y: number,
    sourceDeckIndex?: number,
  ) => void;
  randomDecks: DeckCard[][];
  deckCount: number;
  onShuffle: () => void;
  onUpdateDeckCount: (count: number) => void;
}

export default function DeckArea({
  cards,
  deckType,
  onDeckTypeChange,
  mode,
  onModeChange,
  onDraw,
  randomDecks,
  deckCount,
  onShuffle,
  onUpdateDeckCount,
}: DeckAreaProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("deck-sidebar-width");
    return saved ? parseInt(saved, 10) : 300;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    localStorage.setItem("deck-sidebar-width", sidebarWidth.toString());
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
        const newWidth = Math.max(260, Math.min(600, mouseMoveEvent.clientX));
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

  const isTarotDeck = deckType === "tarot";
  const totalCards = cards.length;

  const filteredCards = cards.filter(
    (c) =>
      c.vietnameseName.toLowerCase().includes(search.toLowerCase()) ||
      c.englishName.toLowerCase().includes(search.toLowerCase()) ||
      c.number.toString().includes(search),
  );

  return (
    <aside
      ref={sidebarRef}
      className={`border-r border-[#e2e8f0] bg-white flex flex-col z-30 shadow-xl h-full min-h-0 overflow-hidden relative transition-[width] duration-0 ${isResizing ? "select-none cursor-col-resize" : ""}`}
    >
      <header className="p-6 border-b border-[#e2e8f0] space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#166db0]" />
          <h2 className="text-[0.75rem] font-bold text-[#465160] uppercase tracking-[0.15em]">
            Deck Controls
          </h2>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#808d9f]">
            Deck Type
          </div>
          <div className="bg-[#f8f9fa] p-1 rounded-xl border border-[#e2e8f0] flex gap-1">
            <Button
              variant={deckType === "iching" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onDeckTypeChange("iching")}
              className={`flex-1 h-8 text-[12px] leading-[15px] rounded-lg transition-all font-bold uppercase tracking-wider ${deckType === "iching" ? "bg-white text-[#166db0] shadow-sm border-[#e2e8f0]" : "text-[#495360] hover:text-[#0f172a]"}`}
            >
              iChing
            </Button>
            <Button
              variant={deckType === "tarot" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onDeckTypeChange("tarot")}
              className={`flex-1 h-8 text-[12px] leading-[15px] rounded-lg transition-all font-bold uppercase tracking-wider ${deckType === "tarot" ? "bg-white text-[#166db0] shadow-sm border-[#e2e8f0]" : "text-[#495360] hover:text-[#0f172a]"}`}
            >
              Tarot
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#808d9f]">
            Draw Mode
          </div>
          <div className="bg-[#f8f9fa] p-1 rounded-xl border border-[#e2e8f0] flex gap-1">
            <Button
              variant={mode === "random" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onModeChange("random")}
              className={`flex-1 h-8 text-[12px] leading-[15px] rounded-lg transition-all font-bold uppercase tracking-wider ${mode === "random" ? "bg-white text-[#166db0] shadow-sm border-[#e2e8f0]" : "text-[#495360] hover:text-[#0f172a]"}`}
            >
              Random
            </Button>
            <Button
              variant={mode === "order" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onModeChange("order")}
              className={`flex-1 h-8 text-[12px] leading-[15px] rounded-lg transition-all font-bold uppercase tracking-wider ${mode === "order" ? "bg-white text-[#166db0] shadow-sm border-[#e2e8f0]" : "text-[#495360] hover:text-[#0f172a]"}`}
            >
              Order
            </Button>
          </div>
        </div>

        {mode === "random" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-[#f8f9fa] p-1.5 rounded-xl border border-[#e2e8f0]">
              <span className="text-[12px] font-bold text-[#000000] uppercase tracking-wider pl-2">
                Decks: {deckCount}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[16px] text-[#495360] hover:bg-white hover:text-[#0f172a] rounded-lg"
                  onClick={() => onUpdateDeckCount(Math.max(1, deckCount - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[16px] text-[#495360] hover:bg-white hover:text-[#0f172a] rounded-lg"
                  onClick={() => onUpdateDeckCount(Math.min(10, deckCount + 1))}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button
              onClick={onShuffle}
              className="w-full h-10 bg-[#166db0] hover:bg-[#0e4a77] text-white rounded-xl shadow-lg shadow-[#166db0]/20 gap-2 text-xs font-bold uppercase tracking-wider"
            >
              <Shuffle className="w-4 h-4" />
              Shuffle All Decks
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <Input
              placeholder={
                isTarotDeck ? "Search tarot cards..." : "Search hexagrams..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 bg-[#f8f9fa] border-[#e2e8f0] rounded-xl text-sm focus:border-[#166db0] transition-all"
            />
          </div>
        )}
      </header>

      <ScrollArea className="flex-1 min-h-0 h-full">
        <div className="p-6 space-y-6 relative">
          {mode === "random" ? (
            <div className="space-y-4">
              {randomDecks.map((deck, i) => (
                <div
                  key={i}
                  onClick={() =>
                    deck.length > 0 && onDraw(deck[0].id, 150, 150, i)
                  }
                  className="group bg-white border border-[#e2e8f0] rounded-2xl p-5 cursor-grab active:cursor-grabbing hover:border-[#166db0] hover:shadow-lg hover:shadow-[#166db0]/5 relative overflow-hidden"
                >
                  <div
                    className={`h-28 ${isTarotDeck ? "bg-[#241b2f]" : "bg-[#020617]"} border border-[#1e293b] rounded-xl mb-4 relative overflow-hidden group-hover:shadow-lg group-hover:shadow-yellow-500/20 flex items-center justify-center`}
                  >
                    {/* CSS Stars for sharpness */}
                    <div className="deck-stars-bg absolute inset-0 opacity-30 pointer-events-none" />

                    {/* Starry Sky Background Image */}
                    <img
                      src={isTarotDeck ? tarotCover : goldenDragon}
                      alt={
                        isTarotDeck
                          ? "Tarot deck cover"
                          : "Golden Dragon Starry Sky"
                      }
                      className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100"
                      referrerPolicy="no-referrer"
                    />

                    {/* Nebula/Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-transparent" />

                    <div className="absolute top-2 right-2">
                      <Sparkles className="w-3.5 h-3.5 text-white opacity-60" />
                    </div>

                    <div
                      className={`${isTarotDeck ? "hidden" : "text-6xl"} relative z-10 opacity-90 group-hover:opacity-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] text-white`}
                    >
                      ☯
                    </div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-sm font-extrabold text-[#0f172a]">
                        {isTarotDeck ? "Tarot" : "Deck"} {i + 1}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold text-[#495360] uppercase tracking-wider mb-0 leading-tight">
                        Cards
                      </div>
                      <div className="text-[15px] font-mono text-[#166db0] font-black leading-tight">
                        {deck.length} / {totalCards}
                      </div>
                    </div>
                  </div>
                  {deck.length === 0 && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center">
                      <span className="text-[10px] font-bold text-[#ef4444] uppercase tracking-widest border border-[#ef4444] px-2 py-1 rounded">
                        Empty
                      </span>
                    </div>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                className="w-full border-2 border-dashed border-[#e2e8f0] text-[#495360] text-xs h-12 rounded-2xl hover:bg-[#f8f9fa] hover:text-[#0f172a] hover:border-[#166db0]/50 transition-all font-bold uppercase tracking-wider"
                onClick={() => onUpdateDeckCount(deckCount + 1)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Deck
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
              {filteredCards.map((card) => {
                if (isTarotDeck) {
                  return (
                    <motion.div
                      key={card.id}
                      whileHover={{ y: -2, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onDraw(card.id, 150, 150)}
                      className="group flex h-[245px] cursor-pointer flex-col items-center overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white p-2.5 transition-all hover:border-[#166db0] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                    >
                      <div className="relative flex min-h-0 flex-1 items-center justify-center">
                        <img
                          src={card.imageUrl || card.imgPath}
                          alt={card.englishName}
                          className="h-full max-w-full rounded-[7px] object-contain shadow-[0_10px_22px_rgba(15,23,42,0.18)]"
                          draggable={false}
                        />
                        <div className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-white/95 px-2 text-[11px] font-black leading-none text-[#166db0] shadow-md ring-1 ring-[#e2e8f0]">
                          {card.number}
                        </div>
                      </div>
                      <div className="w-full px-1 pt-2 text-center">
                        <div className="truncate text-[13px] font-extrabold leading-tight text-[#0f172a]">
                          {card.vietnameseName}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                const hexLines = HEX_LINES[card.number] || [1, 1, 1, 1, 1, 1];
                return (
                  <motion.div
                    key={card.id}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onDraw(card.id, 150, 150)}
                    className="bg-white border border-[#e2e8f0] p-3 rounded-2xl cursor-pointer hover:border-[#166db0] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all flex flex-col items-center justify-between group relative overflow-hidden h-[160px]"
                  >
                    <div className="text-[14px] font-bold text-[#7a6e6e] relative z-10 -top-[2px] transition-colors group-hover:text-[#004c9f]">
                      {String(card.number).padStart(2, "0")}
                    </div>

                    {/* Hexagram Visual */}
                    <div className="w-[50px] h-[54px] flex flex-col-reverse justify-center gap-[5px] mt-0 mb-1 relative z-10 -translate-y-[3.5px]">
                      {hexLines.map((line, idx) => (
                        <div
                          key={idx}
                          className="w-full h-[4.5px] flex items-center gap-[10px] shrink-0"
                        >
                          {line === 1 ? (
                            <div className="w-full h-[4.5px] bg-[#000000] rounded-sm transition-colors group-hover:bg-[#004c9f]" />
                          ) : (
                            <>
                              <div className="w-[20px] h-[4.5px] bg-[#000000] rounded-sm transition-colors group-hover:bg-[#004c9f]" />
                              <div className="w-[20px] h-[4.5px] bg-[#000000] rounded-sm transition-colors group-hover:bg-[#004c9f]" />
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="text-center w-full space-y-[2px] relative z-10 -translate-y-[4px]">
                      <div className="font-extrabold text-[13.2px] text-[#2f1616] truncate leading-tight w-full transition-colors group-hover:text-[#000000] -translate-y-[1px]">
                        {card.vietnameseName}
                      </div>
                      <div
                        className={`text-[10.5px] text-[#7a6e6e] truncate font-bold uppercase transition-colors group-hover:text-[#004c9f] w-full text-center tracking-wider leading-tight mt-[3px] translate-y-[1px]`}
                      >
                        {card.englishName}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
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
  );
}
