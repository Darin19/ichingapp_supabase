import { describe, expect, it } from "vitest";
import type { DeckCard } from "../types";
import {
  shuffleAllDeckStates,
  shuffleArray,
  shuffleDeckControlState,
} from "./deckShuffle";

const cards = ["a", "b", "c"].map((id, index) => ({
  id,
  vietnameseName: id,
  englishName: id,
  number: index + 1,
})) as DeckCard[];

const rng = () => 0;

describe("shuffleArray", () => {
  it("returns a new permutation without mutating the input", () => {
    const original = [...cards];

    const shuffled = shuffleArray(cards, rng);

    expect(shuffled).toEqual([cards[1], cards[2], cards[0]]);
    expect(shuffled).not.toBe(cards);
    expect(cards).toEqual(original);
  });

  it("keeps empty and single-card decks intact", () => {
    expect(shuffleArray([], rng)).toEqual([]);
    expect(shuffleArray([cards[0]], rng)).toEqual([cards[0]]);
  });
});

describe("shuffleDeckControlState", () => {
  it("shuffles every sub-deck while preserving each card set and deck count", () => {
    const state = { deckCount: 2, randomDecks: [[...cards], [...cards]] };

    const shuffled = shuffleDeckControlState(state, rng);

    expect(shuffled).not.toBe(state);
    expect(shuffled.deckCount).toBe(2);
    expect(shuffled.randomDecks.map((deck) => deck.map((card) => card.id))).toEqual([
      ["b", "c", "a"],
      ["b", "c", "a"],
    ]);
    expect(state.randomDecks[0].map((card) => card.id)).toEqual(["a", "b", "c"]);
  });
});

describe("shuffleAllDeckStates", () => {
  it("creates optimistic permutations for both iChing and Tarot", () => {
    const states = {
      iching: { deckCount: 1, randomDecks: [[...cards]] },
      tarot: { deckCount: 1, randomDecks: [[...cards]] },
    };

    const shuffled = shuffleAllDeckStates(states, rng);

    expect(shuffled.iching.randomDecks[0].map((card) => card.id)).toEqual(["b", "c", "a"]);
    expect(shuffled.tarot.randomDecks[0].map((card) => card.id)).toEqual(["b", "c", "a"]);
    expect(states.iching.randomDecks[0].map((card) => card.id)).toEqual(["a", "b", "c"]);
    expect(states.tarot.randomDecks[0].map((card) => card.id)).toEqual(["a", "b", "c"]);
  });
});
