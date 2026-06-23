import { describe, expect, it } from "vitest";

import { formatCardInfoLine } from "./cardInfo";

describe("formatCardInfoLine", () => {
  it.each([
    [4, 67, "Four of Pentacles"],
    [5, 47, "Knight of Cups"],
    [6, 15, "Devil"],
  ])(
    "does not repeat an identical Tarot name at position %i",
    (position, cardNumber, name) => {
      expect(
        formatCardInfoLine({
          position,
          deckType: "tarot",
          cardNumber,
          vietnameseName: name,
          englishName: name,
          labels: [],
        }),
      ).toBe(`${position}. Tarot ${cardNumber}: ${name}`);
    },
  );

  it("keeps distinct bilingual I Ching names and energy fields", () => {
    expect(
      formatCardInfoLine({
        position: 1,
        deckType: "iching",
        cardNumber: 1,
        vietnameseName: "Càn Vi Thiên",
        englishName: "The Creative",
        labels: ["Leadership", "Yang"],
      }),
    ).toBe(
      "1. Hexagram 1: Càn Vi Thiên (The Creative) - Energy Field: Leadership, Yang",
    );
  });

  it("treats case and surrounding whitespace as the same name", () => {
    expect(
      formatCardInfoLine({
        position: 1,
        deckType: "tarot",
        cardNumber: 15,
        vietnameseName: " Devil ",
        englishName: "devil",
        labels: [],
      }),
    ).toBe("1. Tarot 15: Devil");
  });
});
