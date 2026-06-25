import { describe, expect, it } from "vitest";
import sampleText from "../../../docs/canvas-file-v1/canvas-file-v1.sample.json?raw";
import { INITIAL_CARDS, TAROT_CARDS } from "../../constants";
import type { DeckCard, Label, LabelGroup } from "../../types";
import {
  CANVAS_FILE_MAX_BYTES,
  CanvasFileValidationError,
  createCanvasFile,
  createCanvasExportFilename,
  createImportPlan,
  formatCanvasFileError,
  parseCanvasFileText,
  serializeCanvasFile,
  type CanvasFileLabel,
  type CanvasFileV1,
} from "./index";

const sample = JSON.parse(sampleText) as CanvasFileV1;

const cards: DeckCard[] = sample.nodes.map((node) => ({
  id: node.cardId,
  deckType: node.type,
  number: node.cardNumber,
  vietnameseName: node.displayName,
  englishName: node.displayName,
  imgPath: "",
}));

const masterFileLabels = sample.labels.filter(
  (label): label is Extract<CanvasFileLabel, { source: "master" }> =>
    label.source === "master",
);

const labelGroups: LabelGroup[] = Array.from(
  new Map(
    masterFileLabels.map((label) => [
      label.group.id,
      { id: label.group.id!, name: label.group.name },
    ]),
  ).values(),
);

const labels: Label[] = masterFileLabels.map((label) => ({
  id: label.id,
  name: label.name,
  groupId: label.group.id!,
}));

const cloneSample = () => structuredClone(sample);

describe("parseCanvasFileText", () => {
  it("validates the canonical 16-card sample", () => {
    const parsed = parseCanvasFileText(sampleText);

    expect(parsed.nodes).toHaveLength(16);
    expect(parsed.nodes.filter((node) => node.type === "iching")).toHaveLength(
      8,
    );
    expect(parsed.nodes.filter((node) => node.type === "tarot")).toHaveLength(
      8,
    );
    expect(new Set(parsed.nodes.map((node) => node.state))).toEqual(
      new Set(["positive", "neutral", "negative", "upright", "reversed"]),
    );
  });

  it("reports invalid JSON without exposing parser internals", () => {
    expect(() => parseCanvasFileText("{oops")).toThrowError(
      /không phải JSON hợp lệ/i,
    );
  });

  it("reports unsupported versions explicitly", () => {
    const file = cloneSample();
    file.schemaVersion = "2.0.0" as "1.0.0";

    expect(() => parseCanvasFileText(JSON.stringify(file))).toThrowError(
      /2\.0\.0.*không được hỗ trợ/i,
    );
  });

  it("rejects files larger than 5 MiB", () => {
    const oversized = " ".repeat(CANVAS_FILE_MAX_BYTES + 1);

    expect(() => parseCanvasFileText(oversized)).toThrowError(/5 MiB/i);
  });

  it.each([
    [
      "duplicate label id",
      (file: CanvasFileV1) => file.labels.push(file.labels[0]),
    ],
    [
      "duplicate node id",
      (file: CanvasFileV1) => file.nodes.push(file.nodes[0]),
    ],
    [
      "duplicate node order",
      (file: CanvasFileV1) => {
        file.nodes[1].order = file.nodes[0].order;
      },
    ],
    [
      "dangling label",
      (file: CanvasFileV1) => file.nodes[0].labelIds.push("missing-label"),
    ],
    [
      "dangling relation",
      (file: CanvasFileV1) => {
        file.relations[0].to = "missing-node";
      },
    ],
    [
      "self relation",
      (file: CanvasFileV1) => {
        file.relations[0].to = file.relations[0].from;
      },
    ],
    [
      "updated before created",
      (file: CanvasFileV1) => {
        file.metadata.updatedAt = "2026-06-22T00:00:00Z";
      },
    ],
  ])("rejects semantic error: %s", (_, mutate) => {
    const file = cloneSample();
    mutate(file);

    expect(() => parseCanvasFileText(JSON.stringify(file))).toThrow(
      CanvasFileValidationError,
    );
  });
});

describe("createImportPlan", () => {
  it("resolves the canonical sample against the current in-code card master", () => {
    const plan = createImportPlan(sample, {
      cards: [...INITIAL_CARDS, ...TAROT_CARDS],
      labels,
      labelGroups,
    });

    expect(plan.spreadCards).toHaveLength(16);
    expect(
      plan.warnings.filter((warning) => warning.startsWith("Card “")),
    ).toEqual([]);
  });

  it("maps all five file states and resolves sample master/custom labels", () => {
    const plan = createImportPlan(sample, { cards, labels, labelGroups });

    expect(plan.spreadCards).toHaveLength(16);
    expect(plan.customLabels).toHaveLength(1);
    expect(plan.relations).toEqual(sample.relations);
    expect(plan.extensions).toEqual(sample.extensions);
    expect(plan.counts).toEqual({
      cards: 16,
      masterLabels: 15,
      customLabels: 1,
      relations: 10,
    });

    const negative = plan.spreadCards.find(
      (card) => card.cardId === "hexagram-44",
    );
    const neutral = plan.spreadCards.find(
      (card) => card.cardId === "hexagram-17",
    );
    const reversed = plan.spreadCards.find(
      (card) => card.cardId === "tarot-rws-tarot-15-devil",
    );

    expect(negative?.polarity).toBe("negative");
    expect(neutral?.polarity).toBeNull();
    expect(reversed?.isReversed).toBe(true);
  });

  it("resolves a master label by group id and name without warning", () => {
    const file = cloneSample();
    const target = file.labels[0];
    target.id = "stale-master-id";
    const sameNameWrongGroup: Label = {
      id: "wrong-group-label",
      name: target.name,
      groupId: "wrong-group",
    };

    const plan = createImportPlan(file, {
      cards,
      labels: [sameNameWrongGroup, ...labels],
      labelGroups: [{ id: "wrong-group", name: "Other" }, ...labelGroups],
    });

    expect(plan.spreadCards.flatMap((card) => card.labels)).not.toContain(
      "wrong-group-label",
    );
    expect(plan.warnings.some((warning) => /group.*name/i.test(warning))).toBe(
      false,
    );
  });

  it("warns when resolving a master label by group name and label name", () => {
    const file = cloneSample();
    const target = file.labels[0];
    target.id = "stale-master-id";
    target.group.id = "stale-group-id";

    const plan = createImportPlan(file, { cards, labels, labelGroups });

    expect(plan.warnings.some((warning) => /group.*name/i.test(warning))).toBe(
      true,
    );
  });

  it("falls back to a canvas-local custom label without master-data writes", () => {
    const file = cloneSample();
    const unresolved = file.labels.find((label) => label.source === "master")!;
    unresolved.id = "not-in-master";
    unresolved.name = "A label that does not exist";
    unresolved.group = { id: "not-in-master-group", name: "Missing Group" };

    const plan = createImportPlan(file, { cards, labels, labelGroups });
    const fallback = plan.customLabels.find(
      (label) => label.name === unresolved.name,
    );

    expect(fallback?.id).toMatch(/^custom:imported:/);
    expect(fallback?.group.id).toMatch(/^custom-group:imported:/);
    expect(
      plan.warnings.some((warning) => /custom canvas-local/i.test(warning)),
    ).toBe(true);
    expect(labels.some((label) => label.id === fallback?.id)).toBe(false);
  });

  it("rejects an unresolved card", () => {
    const file = cloneSample();
    file.nodes[0].cardId = "missing-card";
    file.nodes[0].cardNumber = 64;
    file.nodes[0].displayName = "Missing Card";

    expect(() =>
      createImportPlan(file, { cards, labels, labelGroups }),
    ).toThrowError(/không resolve được card/i);
  });
});

describe("Canvas File round-trip", () => {
  it("preserves the canonical sample through import and export", () => {
    const plan = createImportPlan(sample, { cards, labels, labelGroups });
    const exported = createCanvasFile({
      metadata: plan.metadata,
      spreadCards: plan.spreadCards,
      cards,
      labels,
      labelGroups,
      customLabels: plan.customLabels,
      relations: plan.relations,
      extensions: plan.extensions,
    });
    const reparsed = parseCanvasFileText(serializeCanvasFile(exported));

    expect(reparsed.metadata).toEqual(sample.metadata);
    expect(reparsed.nodes).toEqual(sample.nodes);
    expect(reparsed.relations).toEqual(sample.relations);
    expect(reparsed.extensions).toEqual(sample.extensions);
    expect(reparsed.labels.find((label) => label.source === "custom")).toEqual(
      sample.labels.find((label) => label.source === "custom"),
    );
  });
});

describe("createCanvasExportFilename", () => {
  it("formats the export filename with local date/time components", () => {
    const date = new Date(2026, 5, 23, 9, 7, 5);

    expect(createCanvasExportFilename(date)).toBe(
      "canvas-export-20260623-090705.json",
    );
  });
});

describe("formatCanvasFileError", () => {
  it("keeps Supabase/PostgREST error details visible for import failures", () => {
    const message = formatCanvasFileError({
      code: "PGRST202",
      message: "Could not find the function public.replace_working_canvas_v2",
      details: "Searched for the function in the schema cache.",
      hint: "Perhaps you meant to call public.replace_working_canvas",
    });

    expect(message).toContain("PGRST202");
    expect(message).toContain(
      "Could not find the function public.replace_working_canvas_v2",
    );
    expect(message).toContain("Searched for the function in the schema cache.");
    expect(message).toContain(
      "Perhaps you meant to call public.replace_working_canvas",
    );
  });
});
