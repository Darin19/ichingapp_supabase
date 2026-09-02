import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeckCard } from "../types";
import DeckArea from "./DeckArea";
import FanDeck from "./FanDeck";
import {
  clampFanDeckIndex,
  getFanDeckMetrics,
  getFanCardSelection,
  getSpreadRowLayout,
  reconcileFanRows,
  splitDeckIntoRows,
} from "./FanDeck";

const deck = [
  { id: "a", vietnameseName: "A", englishName: "A", number: 1 },
  { id: "f", vietnameseName: "F", englishName: "F", number: 2 },
  { id: "d", vietnameseName: "D", englishName: "D", number: 3 },
  { id: "b", vietnameseName: "B", englishName: "B", number: 4 },
  { id: "c", vietnameseName: "C", englishName: "C", number: 5 },
] as DeckCard[];

describe("getFanCardSelection", () => {
  it("returns the exact shuffled card at the selected fan position", () => {
    expect(getFanCardSelection(deck, 3)).toEqual(deck[3]);
  });

  it("does not select a card for an out-of-range fan position", () => {
    expect(getFanCardSelection(deck, 5)).toBeUndefined();
  });
});

describe("three-row FAN layout", () => {
  it("splits Tarot, I Ching, and odd decks into three balanced rows with the logical order intact", () => {
    const tarot = Array.from({ length: 78 }, (_, index) => ({
      ...deck[0],
      id: `t-${index}`,
    }));
    const iching = Array.from({ length: 64 }, (_, index) => ({
      ...deck[0],
      id: `i-${index}`,
    }));

    expect(splitDeckIntoRows(tarot)).toEqual([
      tarot.slice(0, 26),
      tarot.slice(26, 52),
      tarot.slice(52),
    ]);
    expect(splitDeckIntoRows(iching)).toEqual([
      iching.slice(0, 22),
      iching.slice(22, 43),
      iching.slice(43),
    ]);
    expect(splitDeckIntoRows(deck)).toEqual([
      deck.slice(0, 2),
      deck.slice(2, 4),
      deck.slice(4),
    ]);
  });

  it("keeps cards and two-pixel tighter row gaps clamped, then leaves added sidebar width as whitespace", () => {
    expect(getFanDeckMetrics(1)).toMatchObject({ cardWidth: 42, rowGap: 0 });
    expect(getFanDeckMetrics(1000)).toMatchObject({ cardWidth: 76, rowGap: 4 });
    expect(getFanDeckMetrics(600)).toEqual(getFanDeckMetrics(1000));
  });

  it("spreads every row from its actual remaining card count within bounds", () => {
    const first = getSpreadRowLayout(0, 22, 300);
    const last = getSpreadRowLayout(21, 22, 300);
    const afterDraw = getSpreadRowLayout(20, 21, 300);

    expect(first.left).toBe(0);
    expect(last.left + last.cardWidth).toBeLessThanOrEqual(300);
    expect(afterDraw.left + afterDraw.cardWidth).toBeLessThanOrEqual(300);
    expect(first.rotate).toBe(0);
    expect(last.rotate).toBe(0);
    expect(first.cardWidth).toBeGreaterThanOrEqual(42);
    expect(first.cardWidth).toBeLessThanOrEqual(76);
  });

  it("keeps remaining cards in their original row when a fan card is removed", () => {
    const rows = splitDeckIntoRows(deck);
    expect(
      reconcileFanRows(rows, [deck[0], deck[1], deck[3], deck[4]]),
    ).toEqual([[deck[0], deck[1]], [deck[3]], [deck[4]]]);
  });
});

describe("clampFanDeckIndex", () => {
  it("keeps the active fan deck within the currently available decks", () => {
    expect(clampFanDeckIndex(2, 3)).toBe(2);
    expect(clampFanDeckIndex(2, 1)).toBe(0);
    expect(clampFanDeckIndex(-1, 3)).toBe(0);
  });
});

describe("FAN draw mode", () => {
  it("uses the shared controls and compact random-deck toolbar without an Add Deck button", () => {
    const localStorage = { getItem: () => null, setItem: () => undefined };
    Object.assign(globalThis, { localStorage });

    const markup = renderToStaticMarkup(
      <DeckArea
        cards={deck}
        deckType="iching"
        onDeckTypeChange={() => undefined}
        mode="fan"
        onModeChange={() => undefined}
        onDraw={() => undefined}
        randomDecks={[deck, deck]}
        deckCount={2}
        onShuffle={() => undefined}
        onUpdateDeckCount={() => undefined}
      />,
    );

    expect(markup).toContain(">Fan<");
    expect(markup).toContain(">Top<");
    expect(markup).toContain(">Order<");
    expect(markup).toContain('aria-label="Draw card 4 of 5 from fan 1"');
    expect(markup).not.toContain('aria-label="Draw card 4 of 5 from fan 2"');
    expect(markup).toContain('data-fan-deck-content="true"');
    expect(markup).not.toContain('data-deck-controls-count="true"');
    expect(markup).not.toContain('class="-translate-y-[5px]"');
    expect(markup).toContain(
      'data-fan-rows-container="true" class="relative flex min-w-0 flex-col pt-1 -translate-y-[6px]"',
    );
    expect(markup).not.toContain("rounded-md bg-white/95");
    expect(markup).not.toContain("shadow-[0_6px_12px_rgba(15,23,42,0.22)]");
    expect(markup).toContain('data-deck-controls-header="true"');
    expect(markup).toContain('data-random-deck-toolbar="true"');
    expect(markup).toContain("text-[11px] font-bold uppercase tracking-wider");
    expect(markup).toContain("text-black font-black");
    expect(markup).toContain("Deck 1<span");
    expect(markup).toContain(">(5)</span>");
    expect(markup).toContain('aria-label="Shuffle all decks"');
    expect(markup).toContain("w-[81px]");
    expect(markup).not.toContain("Shuffle All Decks");
    expect(markup).not.toContain("Add New Deck");
  });

  it("keeps the Deck Controls header invariant across TOP and ORDER", () => {
    const localStorage = { getItem: () => null, setItem: () => undefined };
    Object.assign(globalThis, { localStorage });

    const topMarkup = renderToStaticMarkup(
      <DeckArea
        {...{
          cards: deck,
          deckType: "iching",
          onDeckTypeChange: () => undefined,
          mode: "random",
          onModeChange: () => undefined,
          onDraw: () => undefined,
          randomDecks: [deck],
          deckCount: 1,
          onShuffle: () => undefined,
          onUpdateDeckCount: () => undefined,
        }}
      />,
    );
    const orderMarkup = renderToStaticMarkup(
      <DeckArea
        {...{
          cards: deck,
          deckType: "iching",
          onDeckTypeChange: () => undefined,
          mode: "order",
          onModeChange: () => undefined,
          onDraw: () => undefined,
          randomDecks: [deck],
          deckCount: 1,
          onShuffle: () => undefined,
          onUpdateDeckCount: () => undefined,
        }}
      />,
    );

    expect(topMarkup).toContain('data-deck-controls-header="true"');
    expect(topMarkup).toContain('data-random-deck-toolbar="true"');
    expect(topMarkup).toContain(
      'data-random-deck-list="true" class="space-y-2 -translate-y-[16px]"',
    );
    expect(topMarkup).toContain(
      'data-random-deck-card="true" class="group bg-white border border-[#e2e8f0]/70 rounded-xl px-5 pt-4 pb-[6px] cursor-grab active:cursor-grabbing hover:shadow-lg hover:shadow-[#166db0]/5 relative overflow-hidden"',
    );
    expect(topMarkup).toContain(
      'data-random-deck-summary="true" class="flex justify-between items-end -translate-y-[4px]"',
    );
    expect(topMarkup).not.toContain(">Cards<");
    expect(topMarkup).toContain('aria-label="Shuffle all decks"');
    expect(topMarkup).not.toContain("Shuffle All Decks");
    expect(topMarkup).not.toContain("Add New Deck");
    expect(orderMarkup).toContain('data-deck-controls-header="true"');
    expect(orderMarkup).toContain('data-order-search="true"');
    expect(orderMarkup).not.toContain('data-random-deck-toolbar="true"');
    expect(orderMarkup).not.toContain("Add New Deck");
  });

  it("keeps full I Ching and Tarot FAN layouts free of the removed count", () => {
    const localStorage = { getItem: () => null, setItem: () => undefined };
    Object.assign(globalThis, { localStorage });
    const iChingCards = Array.from({ length: 64 }, (_, index) => ({
      ...deck[0],
      id: `iching-${index}`,
    }));
    const tarotCards = Array.from({ length: 78 }, (_, index) => ({
      ...deck[0],
      id: `tarot-${index}`,
    }));
    const iChingMarkup = renderToStaticMarkup(
      <DeckArea
        cards={iChingCards}
        deckType="iching"
        onDeckTypeChange={() => undefined}
        mode="fan"
        onModeChange={() => undefined}
        onDraw={() => undefined}
        randomDecks={[iChingCards]}
        deckCount={1}
        onShuffle={() => undefined}
        onUpdateDeckCount={() => undefined}
      />,
    );
    const tarotMarkup = renderToStaticMarkup(
      <DeckArea
        cards={tarotCards}
        deckType="tarot"
        onDeckTypeChange={() => undefined}
        mode="fan"
        onModeChange={() => undefined}
        onDraw={() => undefined}
        randomDecks={[tarotCards]}
        deckCount={1}
        onShuffle={() => undefined}
        onUpdateDeckCount={() => undefined}
      />,
    );

    expect(iChingMarkup).not.toContain('data-deck-controls-count="true"');
    expect(tarotMarkup).not.toContain('data-deck-controls-count="true"');
    expect((tarotMarkup.match(/data-fan-card-row="true"/g) || []).length).toBe(
      3,
    );
  });
});
