import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IChingCard } from "../types";
import CardDrawingView from "./CardDrawingView";

const card: IChingCard = {
  id: "hex-1",
  deckType: "iching",
  number: 1,
  vietnameseName: "Càn",
  englishName: "The Creative",
  link1: "",
  link2: "",
  link3: "",
  content1: "",
  content2: "",
  content3: "",
  imgPath: "",
};

describe("Reset Canvas", () => {
  it("renders one direct reset control without the removed confirmation dialog", () => {
    Object.assign(globalThis, {
      localStorage: { getItem: () => null, setItem: () => undefined },
    });
    const markup = renderToStaticMarkup(
      <CardDrawingView
        cards={[card]}
        spreadCards={[]}
        setSpreadCards={() => undefined}
        labels={[]}
        setLabels={() => undefined}
        labelGroups={[]}
        setLabelGroups={() => undefined}
        user={null}
        onMasterDataWritten={() => undefined}
      />,
    );

    expect(markup).toContain('id="reset-button"');
    expect(markup).not.toContain("Tarot decks to 3 ordered decks each");
    expect(markup).not.toContain("Are you sure you want to clear the canvas");
  });
});
