import { useEffect, useRef, useState } from "react";
import type { DeckCard, DeckType } from "../types";
import goldenDragon from "../assets/images/golden_dragon.png";
import tarotCover from "../assets/images/ady.jpg";

const DEFAULT_FAN_WIDTH = 300;
const DRAW_ANIMATION_MS = 160;

export type FanCardLayout = {
  left: number;
  rotate: number;
  lift: number;
  cardWidth: number;
};

export const getFanCardSelection = (deck: DeckCard[], selectedIndex: number) =>
  deck[selectedIndex];

export const clampFanDeckIndex = (index: number, deckCount: number) =>
  Math.min(Math.max(index, 0), Math.max(deckCount - 1, 0));

export const getFanCardLayout = (
  index: number,
  cardCount: number,
  availableWidth: number,
): FanCardLayout => {
  const safeCount = Math.max(cardCount, 1);
  const safeWidth = Math.max(availableWidth, 1);
  const cardWidth = Math.max(42, Math.min(76, safeWidth * 0.24));

  if (safeCount === 1) {
    return { left: 0, rotate: 0, lift: 0, cardWidth };
  }

  const progress = index / (safeCount - 1);
  const normalized = progress * 2 - 1;
  const usableWidth = Math.max(0, safeWidth - cardWidth);

  return {
    left: progress * usableWidth,
    rotate: normalized * 18,
    lift: Math.abs(normalized) * 18,
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
  const drawTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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

  return (
    <section className="relative min-w-0" aria-label={`Fan ${deckIndex + 1}`}>
      <div className="relative h-40 min-w-0 overflow-hidden [contain:layout_paint]">
        {deck.map((card, index) => {
          const layout = getFanCardLayout(
            index,
            deck.length,
            DEFAULT_FAN_WIDTH,
          );
          const isSelected = selectedIndex === index;
          const progress = deck.length > 1 ? index / (deck.length - 1) : 0;

          return (
            <button
              key={card.id}
              type="button"
              aria-label={`Draw card ${index + 1} of ${deck.length} from fan ${deckIndex + 1}`}
              disabled={selectedIndex !== null}
              onClick={() => handleSelect(index)}
              className={`group absolute left-0 origin-bottom rounded-md border border-white/70 bg-[#020617] p-0 outline-none ring-offset-2 transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-[#166db0] disabled:cursor-default motion-reduce:transition-none ${isSelected ? "opacity-0" : "opacity-100 hover:z-[100]"}`}
              style={{
                left: `${progress * 100}%`,
                bottom: `${8 + layout.lift}px`,
                width: "clamp(40px, 17vw, 64px)",
                aspectRatio: "0.72",
                transform: `translateX(-${progress * 100}%) rotate(${layout.rotate}deg)`,
                zIndex: index + 1,
              }}
            >
              <span className="block h-full w-full origin-bottom rounded-[3px] transition-transform duration-150 ease-out group-hover:-translate-y-5 group-hover:scale-105 group-focus-visible:-translate-y-5 group-focus-visible:scale-105 motion-reduce:transition-none">
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

      <p className="mt-1.5 text-center text-[12px] font-bold tabular-nums text-[#166db0]">
        {deck.length} / {totalCards}
        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[#64748b]">
          {deckName}
        </span>
      </p>

      {deck.length === 0 && (
        <div className="absolute inset-x-0 top-0 flex h-40 items-center justify-center bg-white/80 backdrop-blur-[1px]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#ef4444]">
            Empty
          </span>
        </div>
      )}
    </section>
  );
}
