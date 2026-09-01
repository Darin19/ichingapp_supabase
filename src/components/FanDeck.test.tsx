import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeckCard } from "../types";
import DeckArea from "./DeckArea";
import {
  clampFanDeckIndex,
  getFanCardLayout,
  getFanCardSelection,
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

describe("getFanCardLayout", () => {
  it("keeps a single card centered and unrotated", () => {
    expect(getFanCardLayout(0, 1, 300)).toMatchObject({
      left: 0,
      rotate: 0,
      lift: 0,
    });
  });

  it("fans cards across the available width with an arc and bounded overlap", () => {
    const first = getFanCardLayout(0, 78, 300);
    const middle = getFanCardLayout(39, 78, 300);
    const last = getFanCardLayout(77, 78, 300);

    expect(first.left).toBeLessThan(middle.left);
    expect(middle.left).toBeLessThan(last.left);
    expect(first.rotate).toBeLessThan(0);
    expect(last.rotate).toBeGreaterThan(0);
    expect(middle.lift).toBeLessThanOrEqual(first.lift);
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
  it("shows FAN, TOP, and ORDER controls and exposes each facedown fan position", () => {
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
  });
});
