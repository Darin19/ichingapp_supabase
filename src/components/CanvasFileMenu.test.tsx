import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CanvasFileMenu from "./CanvasFileMenu";

describe("CanvasFileMenu accessibility", () => {
  it("associates the hidden file input with a visible-to-assistive-tech label", () => {
    const markup = renderToStaticMarkup(
      <CanvasFileMenu
        cards={[]}
        labels={[]}
        labelGroups={[]}
        onReplaceCanvas={vi.fn()}
        onExport={vi.fn()}
        onDownloadSample={vi.fn()}
      />,
    );
    const input = markup.match(/<input[^>]*type="file"[^>]*>/)?.[0];

    expect(input).toBeDefined();
    expect(input).toContain('title="Import canvas JSON file"');

    const inputId = input?.match(/id="([^"]+)"/)?.[1];
    expect(inputId).toBeDefined();
    expect(markup).toContain(`<label for="${inputId}"`);
  });
});

describe("scrollbar compatibility", () => {
  it("uses the existing WebKit scrollbar fallback without unsupported properties", () => {
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

    expect(css).toContain("::-webkit-scrollbar");
    expect(css).not.toMatch(/scrollbar-(?:color|width)\s*:/);
  });
});
