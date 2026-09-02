import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IChingCard } from "../types";
import CardDrawingView, {
  getZoomFromPercentageInput,
  getResetCanvasViewport,
  RESET_SUCCESS_TOAST_DURATION_MS,
} from "./CardDrawingView";

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

  it("opens with I Ching in FAN draw mode", () => {
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

    expect(markup).toContain('data-fan-deck-content="true"');
    expect(markup).not.toContain('data-deck-controls-count="true"');
    expect(markup).toContain(">iChing<");
  });

  it("resets the canvas position without changing the current zoom", () => {
    expect(
      getResetCanvasViewport({ zoom: 1.75, offset: { x: 420, y: -96 } }),
    ).toEqual({ zoom: 1.75, offset: { x: 0, y: 0 } });
  });

  it("keeps the successful reset notification visible for one second", () => {
    expect(RESET_SUCCESS_TOAST_DURATION_MS).toBe(1_000);
  });

  it("renders the zoom indicator as an editable control", () => {
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

    expect(markup).toContain('aria-label="Edit zoom percentage"');
    expect(markup).toContain("Zoom: 100%");
  });

  it("converts an entered percentage to a clamped canvas zoom", () => {
    expect(getZoomFromPercentageInput("125", 1)).toBe(1.25);
    expect(getZoomFromPercentageInput("500", 1)).toBe(3);
    expect(getZoomFromPercentageInput("", 1.25)).toBe(1.25);
  });
});
