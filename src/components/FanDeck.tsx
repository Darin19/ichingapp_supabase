import { useEffect, useRef, useState } from "react";
import type { DeckCard, DeckType } from "../types";
import goldenDragon from "../assets/images/golden_dragon.png";
import tarotCover from "../assets/images/ady.jpg";

const DEFAULT_SPREAD_WIDTH = 300;
const DRAW_ANIMATION_MS = 160;
export const MIN_CARD_WIDTH = 42;
export const MAX_CARD_WIDTH = 76;
export const MIN_ROW_GAP = 3;
export const MAX_ROW_GAP = 8;
const CARD_ASPECT_RATIO = 0.72;
const ROW_TOP_PADDING = 8;

type FanRows<T> = [T[], T[], T[]];

export type FanCardLayout = {
  left: number;
  rotate: number;
  cardWidth: number;
};

export type FanDeckMetrics = {
  cardWidth: number;
  cardHeight: number;
  rowGap: number;
};

export const getFanCardSelection = (deck: DeckCard[], selectedIndex: number) =>
  deck[selectedIndex];

export const clampFanDeckIndex = (index: number, deckCount: number) =>
  Math.min(Math.max(index, 0), Math.max(deckCount - 1, 0));

export const splitDeckIntoRows = <T,>(deck: T[]): FanRows<T> => {
  const baseRowLength = Math.floor(deck.length / 3);
  const remainder = deck.length % 3;
  const firstRowLength = baseRowLength + (remainder > 0 ? 1 : 0);
  const secondRowLength = baseRowLength + (remainder > 1 ? 1 : 0);

  return [
    deck.slice(0, firstRowLength),
    deck.slice(firstRowLength, firstRowLength + secondRowLength),
    deck.slice(firstRowLength + secondRowLength),
  ];
};

export const getFanDeckMetrics = (availableWidth: number): FanDeckMetrics => {
  const cardWidth = Math.max(
    MIN_CARD_WIDTH,
    Math.min(MAX_CARD_WIDTH, Math.max(availableWidth, 1) * 0.24),
  );
  const cardScale = (cardWidth - MIN_CARD_WIDTH) / (MAX_CARD_WIDTH - MIN_CARD_WIDTH);

  return {
    cardWidth,
    cardHeight: cardWidth / CARD_ASPECT_RATIO,
    rowGap: MIN_ROW_GAP + (MAX_ROW_GAP - MIN_ROW_GAP) * cardScale,
  };
};

export const reconcileFanRows = (
  previousRows: FanRows<DeckCard>,
  deck: DeckCard[],
): FanRows<DeckCard> => {
  const remainingCardIds = new Set(deck.map((card) => card.id));
  const remainingRows = previousRows.map((row) =>
    row.filter((card) => remainingCardIds.has(card.id)),
  ) as FanRows<DeckCard>;
  const flattenedIds = remainingRows.flat().map((card) => card.id);

  // A draw only removes cards and preserves the deck order. In that case, keep
  // each card in its original visual row so that row alone reflows. A shuffle,
  // reset, or deck replacement gets a fresh balanced three-row split.
  if (
    flattenedIds.length === deck.length &&
    flattenedIds.every((id, index) => id === deck[index]?.id)
  ) {
    return remainingRows;
  }

  return splitDeckIntoRows(deck);
};

export const getSpreadRowLayout = (
  index: number,
  cardCount: number,
  availableWidth: number,
): FanCardLayout => {
  const safeCount = Math.max(cardCount, 1);
  const safeWidth = Math.max(availableWidth, 1);
  const { cardWidth } = getFanDeckMetrics(safeWidth);
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
  onDraw,
}: FanDeckProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [availableWidth, setAvailableWidth] = useState(DEFAULT_SPREAD_WIDTH);
  const [storedRows, setStoredRows] = useState<FanRows<DeckCard>>(() =>
    splitDeckIntoRows(deck),
  );
  const isTarotDeck = deckType === "tarot";

  useEffect(
    () => () => {
      if (drawTimeoutRef.current) clearTimeout(drawTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    setSelectedCardId(null);
  }, [deck]);

  const rows = reconcileFanRows(storedRows, deck);

  useEffect(() => {
    setStoredRows((previousRows) => reconcileFanRows(previousRows, deck));
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

  const handleSelect = (card: DeckCard) => {
    if (selectedCardId !== null) return;

    setSelectedCardId(card.id);
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
  const metrics = getFanDeckMetrics(availableWidth);
  const renderRow = (row: DeckCard[]) => (
    <div
      className="relative min-w-0 shrink-0"
      style={{ height: `${metrics.cardHeight + ROW_TOP_PADDING}px` }}
    >
      {row.map((card, index) => {
        const cardIndex = deck.indexOf(card);
        const layout = getSpreadRowLayout(index, row.length, availableWidth);
        const isSelected = selectedCardId === card.id;

        return (
          <button
            key={card.id}
            type="button"
            aria-label={`Draw card ${cardIndex + 1} of ${deck.length} from fan ${deckIndex + 1}`}
            disabled={selectedCardId !== null}
            onClick={() => handleSelect(card)}
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
                className="h-full w-full rounded-[3px] object-cover"
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
      <div
        ref={containerRef}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col pt-1"
        style={{ gap: `${metrics.rowGap}px` }}
      >
        {rows.map((row, index) => (
          <div key={`fan-row-${index}`} data-fan-card-row="true">
            {renderRow(row)}
          </div>
        ))}
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
