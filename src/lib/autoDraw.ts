import { supabase, isSupabaseConfigured } from "../supabaseClient";
import type { DeckCard, DeckType, Label, LabelGroup } from "../types";

export type AutoDrawEffect = "positive" | "negative" | "neutral";
export type AutoDrawOrientation = "upright" | "reversed";

export interface AutoDrawCardResult {
  card_id: string;
  card_type: DeckType;
  name?: string;
  draw_order: number;
  orientation?: AutoDrawOrientation;
  effect?: AutoDrawEffect;
  position?: string;
  reason?: string;
  match_score?: number;
}

export interface AutoDrawLabelResult {
  label_id?: string;
  group?: string;
  name: string;
  attach_to_card_ids?: string[];
  reason?: string;
}

export interface AutoDrawCanvasNodeResult {
  id?: string;
  type: "card";
  ref_id: string;
  x?: number;
  y?: number;
  label_ids?: string[];
}

export interface AutoDrawResponse {
  error?: string;
  detail?: string;
  scenario_summary?: string;
  themes?: string[];
  note_markdown?: string;
  cards?: AutoDrawCardResult[];
  labels?: AutoDrawLabelResult[];
  canvas_nodes?: AutoDrawCanvasNodeResult[];
  _meta?: {
    provider?: string;
    model?: string;
    reasoning_effort?: string;
    elapsed_ms?: number;
    endpoint_host?: string;
    card_limit?: number;
  };
}

export interface GenerateCanvasFromScenarioArgs {
  scenario: string;
  script?: string;
  cards: DeckCard[];
  labels: Label[];
  labelGroups: LabelGroup[];
  deckTypes: DeckType[];
}

const MAX_CARD_KEYWORDS_LENGTH = 240;

const normalizeKeywords = (keywords?: string) =>
  (keywords || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 12);

export const buildAutoDrawCardsPayload = (cards: DeckCard[]) =>
  cards.map((card) => ({
    id: card.id,
    card_type: card.deckType,
    number: card.number,
    vietnamese_name: card.vietnameseName,
    english_name: card.englishName,
    keywords: normalizeKeywords(card.keywords)
      .join(", ")
      .slice(0, MAX_CARD_KEYWORDS_LENGTH),
  }));

export const buildAutoDrawLabelsPayload = (
  labels: Label[],
  labelGroups: LabelGroup[],
) => {
  const groupById = new Map(labelGroups.map((group) => [group.id, group]));

  return labels.map((label) => ({
    id: label.id,
    name: label.name,
    group_id: label.groupId,
    group: groupById.get(label.groupId)?.name || "Ungrouped",
  }));
};

export async function generateCanvasFromScenario({
  scenario,
  script = "",
  cards,
  labels,
  labelGroups,
  deckTypes,
}: GenerateCanvasFromScenarioArgs) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the frontend environment.",
    );
  }

  const { data, error } = await supabase.functions.invoke<AutoDrawResponse>(
    "generate-canvas",
    {
      body: {
        scenario,
        script,
        deckTypes,
        cards: buildAutoDrawCardsPayload(cards),
        labels: buildAutoDrawLabelsPayload(labels, labelGroups),
        labelGroups: labelGroups.map((group) => ({
          id: group.id,
          name: group.name,
        })),
      },
    },
  );

  if (error) {
    throw new Error(error.message || "Supabase Edge Function failed");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Auto-Draw returned an empty response");
  }

  if (data.error) {
    const detail =
      typeof data.detail === "string"
        ? data.detail.replace(/\s+/g, " ").trim().slice(0, 320)
        : "";
    throw new Error(detail ? `${data.error}: ${detail}` : data.error);
  }

  return data;
}
