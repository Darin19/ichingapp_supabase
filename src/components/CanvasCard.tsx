import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  SpreadCard,
  DeckCard,
  Label,
  LabelGroup,
  IChingPolarity,
} from "../types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Info,
  Tag,
  Lock,
  Unlock,
  RotateCcw,
  Sparkles,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { HEX_LINES } from "../constants";

interface CanvasCardProps {
  key?: string;
  spreadCard: SpreadCard;
  card: DeckCard;
  labels: Label[];
  labelGroups: LabelGroup[];
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onSelect: () => void;
  onUpdateLabels: (labelIds: string[]) => void;
  onUpdateCardState: (updates: {
    isReversed?: boolean;
    polarity?: IChingPolarity;
  }) => void;
  onRemove: () => void;
  canvasOffset: { x: number; y: number };
  zoom: number;
  isBulkSelected?: boolean;
  onToggleBulkSelect?: () => void;
}

export default function CanvasCard({
  spreadCard,
  card,
  labels,
  labelGroups,
  onUpdatePosition,
  onSelect,
  onUpdateLabels,
  onUpdateCardState,
  onRemove,
  zoom,
  isBulkSelected = false,
  onToggleBulkSelect,
}: CanvasCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [cardPosition, setCardPosition] = useState({
    x: spreadCard.x,
    y: spreadCard.y,
  });
  const positionRef = useRef(cardPosition);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    lastClientX: number;
    startX: number;
    startY: number;
    didDrag: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const suppressContextMenuDismissClickRef = useRef(false);
  const contextMenuOpenRef = useRef(false);
  const contextMenuDismissTimeoutRef = useRef<number | null>(null);
  const pendingFrameRef = useRef<number | null>(null);
  const pendingPositionRef = useRef(cardPosition);
  const cardRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    positionRef.current = cardPosition;
  }, [cardPosition]);

  useEffect(() => {
    if (!isDragging) {
      const nextPosition = { x: spreadCard.x, y: spreadCard.y };
      setCardPosition(nextPosition);
      positionRef.current = nextPosition;
    }
  }, [isDragging, spreadCard.x, spreadCard.y]);

  useLayoutEffect(() => {
    const cardRoot = cardRootRef.current;
    if (!cardRoot) return;

    cardRoot.style.transform = `translate3d(${cardPosition.x}px, ${cardPosition.y}px, 0)`;
    if (isDragging) {
      cardRoot.style.willChange = "transform";
    } else {
      cardRoot.style.removeProperty("will-change");
    }
  }, [cardPosition.x, cardPosition.y, isDragging]);

  useEffect(() => {
    return () => {
      if (contextMenuDismissTimeoutRef.current !== null) {
        window.clearTimeout(contextMenuDismissTimeoutRef.current);
      }
      if (pendingFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingFrameRef.current);
      }
    };
  }, []);

  const scheduleCardPosition = (nextPosition: { x: number; y: number }) => {
    positionRef.current = nextPosition;
    pendingPositionRef.current = nextPosition;

    if (pendingFrameRef.current !== null) return;
    pendingFrameRef.current = window.requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      setCardPosition(pendingPositionRef.current);
    });
  };

  const flushPendingCardPosition = () => {
    if (pendingFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }
    setCardPosition(positionRef.current);
  };

  const toggleLabel = (labelId: string) => {
    const newLabels = spreadCard.labels.includes(labelId)
      ? spreadCard.labels.filter((id) => id !== labelId)
      : [...spreadCard.labels, labelId];
    onUpdateLabels(newLabels);
  };

  const activeLabels = labels.filter((l) => spreadCard.labels.includes(l.id));
  const isTarot = card.deckType === "tarot" || Boolean(card.imageUrl);
  const hexLines = HEX_LINES[card.number] || [1, 1, 1, 1, 1, 1];
  const isReversed = Boolean(spreadCard.isReversed);
  const polarity = spreadCard.polarity || null;

  const isContextMenuPopupTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(
      target.closest(
        [
          "[data-slot='context-menu-content']",
          "[data-slot='context-menu-sub-content']",
          "[data-slot='context-menu-item']",
          "[data-slot='context-menu-checkbox-item']",
          "[data-slot='context-menu-radio-item']",
          "[data-slot='context-menu-sub-trigger']",
        ].join(","),
      ),
    );

  const stopControlPointer = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  };

  const stopMenuPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleContextMenuOpenChange = (open: boolean) => {
    if (open) {
      contextMenuOpenRef.current = true;
      return;
    }

    if (!contextMenuOpenRef.current) return;

    contextMenuOpenRef.current = false;
    suppressContextMenuDismissClickRef.current = true;
    if (contextMenuDismissTimeoutRef.current !== null) {
      window.clearTimeout(contextMenuDismissTimeoutRef.current);
    }
    contextMenuDismissTimeoutRef.current = window.setTimeout(() => {
      suppressContextMenuDismissClickRef.current = false;
      contextMenuDismissTimeoutRef.current = null;
    }, 350);
  };

  const toggleReversed = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onUpdateCardState({ isReversed: !isReversed });
  };

  const cyclePolarity = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextPolarity: IChingPolarity =
      polarity === null
        ? "positive"
        : polarity === "positive"
          ? "negative"
          : null;
    onUpdateCardState({ polarity: nextPolarity });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isContextMenuPopupTarget(e.target)) return;
    if (isLocked || e.button !== 0 || e.ctrlKey || e.metaKey) return;

    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      lastClientX: e.clientX,
      startX: positionRef.current.x,
      startY: positionRef.current.y,
      didDrag: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - drag.startClientX;
    const deltaY = e.clientY - drag.startClientY;
    if (!drag.didDrag && Math.hypot(deltaX, deltaY) < 3) return;

    if (!drag.didDrag) {
      drag.didDrag = true;
      setIsDragging(true);
    }
    drag.lastClientX = e.clientX;

    const nextPosition = {
      x: drag.startX + deltaX / zoom,
      y: drag.startY + deltaY / zoom,
    };
    scheduleCardPosition(nextPosition);
  };

  const finishPointerDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture may already be released if the browser cancelled the gesture.
    }

    dragRef.current = null;
    setIsDragging(false);
    flushPendingCardPosition();

    if (!drag.didDrag) return;

    suppressNextClickRef.current = true;
    if (drag.lastClientX < 300) {
      onRemove();
      toast.info("Card returned to deck");
      return;
    }

    onUpdatePosition(
      spreadCard.id,
      positionRef.current.x,
      positionRef.current.y,
    );
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 2) {
      e.stopPropagation();
    }
  };

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      isContextMenuPopupTarget(e.target) ||
      suppressContextMenuDismissClickRef.current
    ) {
      suppressContextMenuDismissClickRef.current = false;
      e.stopPropagation();
      return;
    }

    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      e.stopPropagation();
      return;
    }

    if (!isDragging) {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        onToggleBulkSelect?.();
        return;
      }
      onSelect();
    }
  };

  return (
    <div
      ref={cardRootRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onMouseDown={handleMouseDown}
      onClick={handleCardClick}
      className={`absolute flex flex-col items-center gap-2 ${isBulkSelected ? "z-20" : "z-10"}`}
    >
      <ContextMenu onOpenChange={handleContextMenuOpenChange}>
        <ContextMenuTrigger>
          <div
            className={`${isTarot ? "w-[119px]" : "w-[140px] h-[190px] bg-white border border-[#e2e8f0] rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.06)] overflow-hidden hover:border-[#166db0]"} cursor-move group relative ${
              isDragging
                ? "scale-105 opacity-80 rotate-1 shadow-[0_20px_40px_rgba(0,0,0,0.1)]"
                : "transition-all"
            } ${isLocked ? "cursor-pointer" : ""} ${isBulkSelected ? "rounded-2xl ring-2 ring-[#38bdf8] ring-offset-2 ring-offset-[#0f172a]" : ""}`}
          >
            {isTarot ? (
              <div className="relative flex w-full flex-col items-center gap-2">
                <button
                  type="button"
                  aria-label={
                    isReversed ? "Set tarot card upright" : "Reverse tarot card"
                  }
                  title={isReversed ? "Set upright" : "Reverse card"}
                  onClick={toggleReversed}
                  onPointerDown={stopControlPointer}
                  className={`absolute left-1/2 top-[-10px] z-20 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border text-white shadow-[0_6px_16px_rgba(0,0,0,0.45)] transition-all ${
                    isReversed
                      ? "border-[#166db0] bg-[#166db0] opacity-100"
                      : "border-white/35 bg-black/60 opacity-0 hover:bg-[#166db0] group-hover:opacity-100"
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <img
                  src={card.imageUrl || card.imgPath}
                  alt={card.englishName}
                  className={`w-[105px] rounded-[6px] object-contain shadow-[0_13px_25px_rgba(0,0,0,0.58),0_0_13px_rgba(255,255,255,0.12)] transition-transform duration-200 group-hover:scale-[1.015] ${
                    isReversed ? "rotate-180" : ""
                  }`}
                  draggable={false}
                />
                <div className="max-w-[119px] px-1 text-center text-[13.6px] font-extrabold leading-[1.15] text-white drop-shadow-[0_2px_7px_rgba(0,0,0,0.95)]">
                  {card.vietnameseName}
                </div>
              </div>
            ) : (
              <div className="p-4 flex flex-col h-full items-center justify-between relative z-10">
                <button
                  type="button"
                  aria-label="Toggle iChing card polarity"
                  title={
                    polarity === "positive"
                      ? "Positive energy"
                      : polarity === "negative"
                        ? "Negative energy"
                        : "Set energy polarity"
                  }
                  onClick={cyclePolarity}
                  onPointerDown={stopControlPointer}
                  className={`absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border transition-all ${
                    polarity === "positive"
                      ? "border-sky-300 bg-sky-50 text-sky-600 shadow-[0_6px_14px_rgba(14,165,233,0.22)]"
                      : polarity === "negative"
                        ? "border-red-300 bg-red-50 text-red-600 shadow-[0_6px_14px_rgba(239,68,68,0.2)]"
                        : "border-[#e2e8f0] bg-white/90 text-[#94a3b8] opacity-0 shadow-sm hover:text-[#166db0] group-hover:opacity-100"
                  }`}
                >
                  {polarity === "positive" ? (
                    <Sparkles className="h-4 w-4" />
                  ) : polarity === "negative" ? (
                    <Flame className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                </button>
                <div className="text-[19px] font-bold text-[#000000] relative -top-[2px]">
                  {String(card.number).padStart(2, "0")}
                </div>

                {/* Hexagram Visual */}
                <div className="w-[60px] h-[60px] flex flex-col-reverse justify-center gap-1.5 mt-0 mb-2 relative -top-[2px]">
                  {hexLines.map((line, idx) => (
                    <div key={idx} className="w-full h-[5px] flex gap-[10px]">
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

                <div className="text-center w-full space-y-[3px]">
                  <div className="font-extrabold text-[15px] text-[#0f172a] truncate leading-tight w-[125px] ml-[-10px] mr-0 mt-0 relative -top-[2px]">
                    {card.vietnameseName}
                  </div>
                  <div className="text-[12px] text-[#333a41] italic truncate font-medium w-[125px] ml-[-11px] mr-0 text-center">
                    {card.englishName}
                  </div>
                </div>
              </div>
            )}

            {isLocked && (
              <div
                className={`absolute top-3 right-3 ${isTarot ? "text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)]" : "text-[#166db0]"}`}
              >
                <Lock className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent
          onClick={stopMenuPropagation}
          onPointerDown={stopMenuPropagation}
          className="w-[180px] bg-white border-[#e2e8f0] text-[#0f172a] p-1.5 shadow-2xl rounded-xl"
        >
          <ContextMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="gap-2 text-xs py-2.5 hover:bg-[#f1f5f9] rounded-lg font-semibold"
          >
            <Info className="w-4 h-4 text-[#166db0]" />
            View Details
          </ContextMenuItem>

          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2 text-xs py-2.5 hover:bg-[#f1f5f9] rounded-lg font-semibold">
              <Tag className="w-4 h-4 text-[#166db0]" />
              Assign Labels
            </ContextMenuSubTrigger>
            <ContextMenuSubContent
              onClick={stopMenuPropagation}
              onPointerDown={stopMenuPropagation}
              className="w-48 bg-white border-[#e2e8f0] p-1.5 rounded-xl shadow-2xl"
            >
              {labelGroups.map((group) => (
                <React.Fragment key={group.id}>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="text-xs py-2.5 rounded-lg font-semibold">
                      {group.name}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent
                      onClick={stopMenuPropagation}
                      onPointerDown={stopMenuPropagation}
                      className="w-40 bg-white border-[#e2e8f0] p-1.5 rounded-xl shadow-2xl"
                    >
                      {labels
                        .filter((l) => l.groupId === group.id)
                        .map((label) => (
                          <ContextMenuCheckboxItem
                            key={label.id}
                            checked={spreadCard.labels.includes(label.id)}
                            onCheckedChange={() => toggleLabel(label.id)}
                            className="text-xs py-2.5 rounded-lg font-medium"
                          >
                            {label.name}
                          </ContextMenuCheckboxItem>
                        ))}
                      {labels.filter((l) => l.groupId === group.id).length ===
                        0 && (
                        <div className="px-2 py-2 text-[10px] text-[#94a3b8] italic">
                          No labels
                        </div>
                      )}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </React.Fragment>
              ))}
              {labelGroups.length === 0 && (
                <div className="px-2 py-2 text-[10px] text-[#94a3b8] italic">
                  No label groups
                </div>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator className="bg-[#e2e8f0] my-1.5" />

          <ContextMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setIsLocked((locked) => !locked);
            }}
            className="gap-2 text-xs py-2.5 hover:bg-[#f1f5f9] rounded-lg font-semibold"
          >
            {isLocked ? (
              <Unlock className="w-4 h-4 text-[#166db0]" />
            ) : (
              <Lock className="w-4 h-4 text-[#166db0]" />
            )}
            {isLocked ? "Unlock Position" : "Lock Position"}
          </ContextMenuItem>

          <ContextMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-red-500 focus:text-red-600 gap-2 text-xs py-2.5 hover:bg-red-50 rounded-lg font-semibold"
          >
            <Trash2 className="w-4 h-4" />
            Remove Card
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Labels Display - Below Card */}
      {activeLabels.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 max-w-[140px]">
          {activeLabels.map((label) => (
            <Badge
              key={label.id}
              variant="secondary"
              className="text-[13px] px-2 py-0.5 bg-[#f1f5f9] text-[#495360] border-[#e2e8f0] rounded-full font-bold"
            >
              {label.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
