import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeckCard } from "../types";
import DeckArea from "./DeckArea";
import FanDeck from "./FanDeck";
import {
  clampFanDeckIndex,
  getFanCardSelection,
  getSpreadRowLayout,
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

describe("two-row FAN layout", () => {
  it("splits Tarot, I Ching, and odd decks with the logical order intact", () => {
    const tarot = Array.from({ length: 78 }, (_, index) => ({ ...deck[0], id: `t-${index}` }));
    const iching = Array.from({ length: 64 }, (_, index) => ({ ...deck[0], id: `i-${index}` }));

    expect(splitDeckIntoRows(tarot)).toEqual([tarot.slice(0, 39), tarot.slice(39)]);
    expect(splitDeckIntoRows(iching)).toEqual([iching.slice(0, 32), iching.slice(32)]);
    expect(splitDeckIntoRows(deck)).toEqual([deck.slice(0, 3), deck.slice(3)]);
  });

  it("spreads every row within bounds without rotation or an arc", () => {
    const first = getSpreadRowLayout(0, 39, 300);
    const last = getSpreadRowLayout(38, 39, 300);

    expect(first.left).toBe(0);
    expect(last.left + last.cardWidth).toBeLessThanOrEqual(300);
    expect(first.rotate).toBe(0);
    expect(last.rotate).toBe(0);
    expect(first.cardWidth).toBeGreaterThanOrEqual(42);
    expect(first.cardWidth).toBeLessThanOrEqual(76);
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
    expect(markup).toContain(">5 / 5<");
    expect(markup).toContain('data-fan-deck-content="true"');
    expect(markup).toContain('data-deck-controls-header="true"');
    expect(markup).toContain('data-random-deck-toolbar="true"');
    expect(markup).toContain('aria-label="Shuffle all decks"');
    expect(markup).not.toContain("Shuffle All Decks");
    expect(markup).not.toContain("Add New Deck");
  });

  it("keeps the Deck Controls header invariant across TOP and ORDER", () => {
    const localStorage = { getItem: () => null, setItem: () => undefined };
    Object.assign(globalThis, { localStorage });

    const topMarkup = renderToStaticMarkup(
      <DeckArea {...{ cards: deck, deckType: "iching", onDeckTypeChange: () => undefined, mode: "random", onModeChange: () => undefined, onDraw: () => undefined, randomDecks: [deck], deckCount: 1, onShuffle: () => undefined, onUpdateDeckCount: () => undefined }} />,
    );
    const orderMarkup = renderToStaticMarkup(
      <DeckArea {...{ cards: deck, deckType: "iching", onDeckTypeChange: () => undefined, mode: "order", onModeChange: () => undefined, onDraw: () => undefined, randomDecks: [deck], deckCount: 1, onShuffle: () => undefined, onUpdateDeckCount: () => undefined }} />,
    );

    expect(topMarkup).toContain('data-deck-controls-header="true"');
    expect(topMarkup).toContain('data-random-deck-toolbar="true"');
    expect(topMarkup).toContain('aria-label="Shuffle all decks"');
    expect(topMarkup).not.toContain("Shuffle All Decks");
    expect(topMarkup).not.toContain("Add New Deck");
    expect(orderMarkup).toContain('data-deck-controls-header="true"');
    expect(orderMarkup).toContain('data-order-search="true"');
    expect(orderMarkup).not.toContain('data-random-deck-toolbar="true"');
    expect(orderMarkup).not.toContain("Add New Deck");
  });

  it("places the count in a dedicated FAN footer below the two rows", () => {
    const markup = renderToStaticMarkup(
      <FanDeck deck={deck} deckIndex={0} deckType="iching" totalCards={64} onDraw={() => undefined} />,
    );

    expect(markup).toContain('data-fan-count-footer="true"');
    expect(markup).toContain(">5 / 64<");
  });
});
