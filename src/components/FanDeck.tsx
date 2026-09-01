import { useEffect, useRef, useState } from "react";
import type { DeckCard, DeckType } from "../types";
import goldenDragon from "../assets/images/golden_dragon.png";
import tarotCover from "../assets/images/ady.jpg";

const DEFAULT_SPREAD_WIDTH = 300;
const DRAW_ANIMATION_MS = 160;

export type FanCardLayout = {
  left: number;
  rotate: number;
  cardWidth: number;
};

export const getFanCardSelection = (deck: DeckCard[], selectedIndex: number) =>
  deck[selectedIndex];

export const clampFanDeckIndex = (index: number, deckCount: number) =>
  Math.min(Math.max(index, 0), Math.max(deckCount - 1, 0));

export const splitDeckIntoRows = <T,>(deck: T[]): [T[], T[]] => {
  const splitIndex = Math.ceil(deck.length / 2);
  return [deck.slice(0, splitIndex), deck.slice(splitIndex)];
};

export const getSpreadRowLayout = (
  index: number,
  cardCount: number,
  availableWidth: number,
): FanCardLayout => {
  const safeCount = Math.max(cardCount, 1);
  const safeWidth = Math.max(availableWidth, 1);
  const cardWidth = Math.max(42, Math.min(76, safeWidth * 0.24));
  const usableWidth = Math.max(0, safeWidth - cardWidth);

  if (safeCount === 1) {
    return { left: usableWidth / 2, rotate: 0, cardWidth };
  }

  return {
    left: (index / (safeCount - 1)) * usableWidth,
    rotate: 0,
    cardWidth,
  };
};

type FanDeckProps = {
  deck: DeckCard[];
  deckIndex: number;
  deckType: DeckType;
  totalCards: number;
  onDraw: (
    cardId: string,
    x: number,
    y: number,
    sourceDeckIndex: number,
  ) => void;
};

export default function FanDeck({
  deck,
  deckIndex,
  deckType,
  totalCards,
  onDraw,
}: FanDeckProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [availableWidth, setAvailableWidth] = useState(DEFAULT_SPREAD_WIDTH);
  const isTarotDeck = deckType === "tarot";

  useEffect(
    () => () => {
      if (drawTimeoutRef.current) clearTimeout(drawTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    setSelectedIndex(null);
  }, [deck]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(Math.max(1, entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleSelect = (index: number) => {
    if (selectedIndex !== null) return;

    const card = getFanCardSelection(deck, index);
    if (!card) return;

    setSelectedIndex(index);
    const completeDraw = () => onDraw(card.id, 150, 150, deckIndex);
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      completeDraw();
      return;
    }

    drawTimeoutRef.current = setTimeout(completeDraw, DRAW_ANIMATION_MS);
  };

  const cardBack = isTarotDeck ? tarotCover : goldenDragon;
  const deckName = isTarotDeck ? "Tarot" : "I Ching";
  const [firstRow, secondRow] = splitDeckIntoRows(deck);
  const renderRow = (row: DeckCard[], offset: number) => (
    <div className="relative h-[clamp(96px,16vh,132px)] min-w-0">
      {row.map((card, index) => {
        const cardIndex = offset + index;
        const layout = getSpreadRowLayout(index, row.length, availableWidth);
        const isSelected = selectedIndex === cardIndex;

        return (
          <button
            key={card.id}
            type="button"
            aria-label={`Draw card ${cardIndex + 1} of ${deck.length} from fan ${deckIndex + 1}`}
            disabled={selectedIndex !== null}
            onClick={() => handleSelect(cardIndex)}
            className={`group absolute top-2 origin-bottom rounded-md border border-white/70 bg-[#020617] p-0 outline-none ring-offset-2 transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-[#166db0] disabled:cursor-default motion-reduce:transition-none ${isSelected ? "opacity-0" : "opacity-100 hover:z-[100]"}`}
            style={{
              left: `${layout.left}px`,
              width: `${layout.cardWidth}px`,
              aspectRatio: "0.72",
              transform: "rotate(0deg)",
              zIndex: index + 1,
            }}
          >
            <span className="block h-full w-full rounded-[3px] transition-transform duration-150 ease-out group-hover:-translate-y-2 group-hover:scale-105 group-focus-visible:-translate-y-2 group-focus-visible:scale-105 motion-reduce:transition-none">
              <img
                src={cardBack}
                alt=""
                aria-hidden="true"
                className="h-full w-full rounded-[3px] object-cover shadow-[0_6px_12px_rgba(15,23,42,0.22)]"
                draggable={false}
              />
              <span className="pointer-events-none absolute inset-0 rounded-[3px] bg-gradient-to-br from-white/20 via-transparent to-black/20" />
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`Fan ${deckIndex + 1}`}>
      <div ref={containerRef} className="relative min-h-0 min-w-0 flex-1 pt-1">
        {renderRow(firstRow, 0)}
        {renderRow(secondRow, firstRow.length)}
      </div>

      <div data-fan-count-footer="true" className="shrink-0 pt-3">
        <p className="text-center text-[12px] font-bold tabular-nums text-[#166db0]">
          {deck.length} / {totalCards}
          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[#64748b]">
            {deckName}
          </span>
        </p>
      </div>

      {deck.length === 0 && (
        <div className="absolute inset-x-0 top-0 flex h-[220px] items-center justify-center bg-white/80 backdrop-blur-[1px]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#ef4444]">
            Empty
          </span>
        </div>
      )}
    </section>
  );
}
