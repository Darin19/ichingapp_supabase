import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
} from "react";
import {
  DeckCard,
  DeckType,
  IChingCard,
  SpreadCard,
  Label,
  LabelGroup,
  DeckMode,
  SavedCanvas,
  IChingPolarity,
  CanvasMetadata,
} from "../types";
import SpreadCanvas from "./SpreadCanvas";
import DeckArea from "./DeckArea";
import CardDetailPopup from "./CardDetailPopup";
import BulkLabelPanel from "./BulkLabelPanel";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Info,
  Save,
  Copy,
  Tag,
  WandSparkles,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  db,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
} from "../lib/supabaseDb";
import { supabase } from "../supabaseClient";
import { handleSupabaseError, OperationType } from "../lib/supabaseErrors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { User } from "@supabase/supabase-js";
import { TAROT_CARDS } from "../constants";
import {
  generateCanvasFromScenario,
  type AutoDrawCardResult,
  type AutoDrawResponse,
} from "../lib/autoDraw";
import {
  createMasterDataVersion,
  writeMasterDataMarker,
} from "../lib/masterDataCache";

const CanvasNoteEditor = lazy(() => import("./CanvasNoteEditor"));

interface CardDrawingViewProps {
  cards: IChingCard[];
  spreadCards: SpreadCard[];
  setSpreadCards: (
    cards: SpreadCard[] | ((prev: SpreadCard[]) => SpreadCard[]),
  ) => void;
  labels: Label[];
  setLabels: (labels: Label[] | ((prev: Label[]) => Label[])) => void;
  labelGroups: LabelGroup[];
  setLabelGroups: (
    groups: LabelGroup[] | ((prev: LabelGroup[]) => LabelGroup[]),
  ) => void;
  user: User | null;
  loadCanvas?: SavedCanvas | null;
  onClearLoadCanvas?: () => void;
  onMasterDataWritten: (version: string) => void;
}

const getDeckCollectionName = (deckType: DeckType) =>
  deckType === "iching" ? "random_decks" : `random_decks_${deckType}`;

const getSpreadCardDeckType = (spreadCard?: SpreadCard | null): DeckType =>
  spreadCard?.deckType || "iching";

const getCardLabel = (
  card?: DeckCard,
  fallbackDeckType: DeckType = "iching",
) => ((card?.deckType || fallbackDeckType) === "iching" ? "Hexagram" : "Tarot");

type CanvasOffset = {
  x: number;
  y: number;
};

type CanvasViewport = {
  zoom: number;
  offset: CanvasOffset;
};

type DeckControlState = {
  deckCount: number;
  randomDecks: DeckCard[][];
};

type StoredDeckControlState = {
  deckCount?: number;
  cardIds?: string[][];
};

type StoredWorkingCanvasState = {
  spreadCards?: SpreadCard[];
  deckStates?: Partial<Record<DeckType, StoredDeckControlState>>;
  workingCanvasMeta?: CanvasMetadata;
  canvasNoteDraft?: string;
  updatedAt?: string;
};

type PendingPosition = {
  x: number;
  y: number;
  revision: number;
};

type ShuffleRpcResult = {
  deck_count?: number;
  shuffled_deck_count?: number;
  decks?: RpcDeckSnapshot[];
};

type RpcDeckSnapshot = {
  id?: string;
  orderIndex?: number;
  order_index?: number;
  cardIds?: string[];
  card_ids?: string[];
};

type DrawCardRpcResult = SpreadCard;

const CANVAS_VIEWPORT_STORAGE_KEY = "iching-card-drawing-viewport";
const WORKING_CANVAS_STATE_STORAGE_KEY =
  "iching-card-drawing-working-state-v1";
const RECENT_LOCAL_STATE_MAX_AGE_MS = 30_000;
const AUTO_DRAW_CARD_LIMIT = 50;
const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = {
  zoom: 1,
  offset: { x: 0, y: 0 },
};
const DEFAULT_BULK_LABEL_PANEL_POSITION = { x: 20, y: 64 };
const AUTO_DRAW_LABEL_GROUP_NAME = "Auto-Draw";

const buildDeckRpcPayload = (cards: DeckCard[]) =>
  cards.map((card, index) => ({
    id: card.id,
    number: card.number,
    sort_order: card.sortOrder ?? card.number ?? index,
  }));

const buildCanvasCardsRpcPayload = (cards: SpreadCard[]) =>
  cards.map((card, index) => ({
    id: card.id,
    card_id: card.cardId,
    deck_type: card.deckType || "iching",
    x: card.x,
    y: card.y,
    labels: card.labels || [],
    is_reversed: card.isReversed ?? false,
    polarity: card.polarity ?? null,
    source_deck_index: card.sourceDeckIndex ?? null,
    draw_sequence: card.drawSequence ?? index + 1,
    placed_sequence: card.placedSequence ?? card.drawSequence ?? index + 1,
    auto_draw_reason: card.autoDrawReason ?? null,
    position_label: card.positionLabel ?? null,
    match_score: card.matchScore ?? null,
  }));

const createDeckControlState = (
  deckCards: DeckCard[],
  count = 3,
): DeckControlState => ({
  deckCount: count,
  randomDecks: Array.from({ length: count }, () => [...deckCards]),
});

const createDeckControlStateFromRpc = (
  result: { deck_count?: number; decks?: RpcDeckSnapshot[] } | null | undefined,
  deckCards: DeckCard[],
) => {
  const rpcDecks = Array.isArray(result?.decks) ? result.decks : null;
  if (!rpcDecks) return null;

  const cardById = new Map(deckCards.map((card) => [card.id, card]));
  const randomDecks = [...rpcDecks]
    .sort(
      (a, b) =>
        (a.orderIndex ?? a.order_index ?? Number.MAX_SAFE_INTEGER) -
          (b.orderIndex ?? b.order_index ?? Number.MAX_SAFE_INTEGER) ||
        (a.id || "").localeCompare(b.id || ""),
    )
    .map((deck) => {
      const cardIds = deck.cardIds || deck.card_ids || [];
      return cardIds
        .map((cardId) => cardById.get(cardId))
        .filter(Boolean) as DeckCard[];
    });

  return {
    deckCount: result?.deck_count ?? randomDecks.length,
    randomDecks,
  } satisfies DeckControlState;
};

const serializeDeckControlState = (
  deckState: DeckControlState,
): StoredDeckControlState => ({
  deckCount: deckState.deckCount,
  cardIds: deckState.randomDecks.map((deck) => deck.map((card) => card.id)),
});

const createDeckControlStateFromStored = (
  storedDeckState: StoredDeckControlState | undefined,
  deckCards: DeckCard[],
) => {
  if (!Array.isArray(storedDeckState?.cardIds)) return null;

  const cardById = new Map(deckCards.map((card) => [card.id, card]));
  const randomDecks = storedDeckState.cardIds.map((deckCardIds) =>
    Array.isArray(deckCardIds)
      ? (deckCardIds
          .map((cardId) => cardById.get(cardId))
          .filter(Boolean) as DeckCard[])
      : [],
  );

  return {
    deckCount: storedDeckState.deckCount ?? randomDecks.length,
    randomDecks,
  } satisfies DeckControlState;
};

const readStoredWorkingCanvasState = (): StoredWorkingCanvasState | null => {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(WORKING_CANVAS_STATE_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as StoredWorkingCanvasState;
  } catch {
    return null;
  }
};

const writeStoredWorkingCanvasState = (state: {
  spreadCards: SpreadCard[];
  deckStates: Record<DeckType, DeckControlState>;
  workingCanvasMeta: CanvasMetadata;
  canvasNoteDraft: string;
}) => {
  if (typeof window === "undefined") return null;

  const snapshot: StoredWorkingCanvasState = {
    spreadCards: state.spreadCards,
    deckStates: {
      iching: serializeDeckControlState(state.deckStates.iching),
      tarot: serializeDeckControlState(state.deckStates.tarot),
    },
    workingCanvasMeta: state.workingCanvasMeta,
    canvasNoteDraft: state.canvasNoteDraft,
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(
      WORKING_CANVAS_STATE_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // A failed local snapshot should not block the Supabase write path.
  }

  return snapshot;
};

const isRecentStoredWorkingCanvasState = (
  state: StoredWorkingCanvasState | null | undefined,
) => {
  const updatedAt = state?.updatedAt ? Date.parse(state.updatedAt) : NaN;
  return (
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt <= RECENT_LOCAL_STATE_MAX_AGE_MS
  );
};

const countDeckCards = (deckState: DeckControlState) =>
  deckState.randomDecks.reduce((total, deck) => total + deck.length, 0);

const removeCardFromDeckStates = (
  states: Record<DeckType, DeckControlState>,
  targetDeckType: DeckType,
  sourceDeckIndex: number,
  cardId: string,
) => {
  const targetState = states[targetDeckType];
  const sourceDeck = targetState.randomDecks[sourceDeckIndex];
  if (!sourceDeck) return states;

  let removed = false;
  const nextDeck = sourceDeck.filter((card) => {
    if (!removed && card.id === cardId) {
      removed = true;
      return false;
    }
    return true;
  });

  if (!removed) return states;

  return {
    ...states,
    [targetDeckType]: {
      ...targetState,
      randomDecks: targetState.randomDecks.map((deck, index) =>
        index === sourceDeckIndex ? nextDeck : deck,
      ),
    },
  } satisfies Record<DeckType, DeckControlState>;
};

const returnCardToDeckStates = (
  states: Record<DeckType, DeckControlState>,
  targetDeckType: DeckType,
  sourceDeckIndex: number,
  card: DeckCard,
) => {
  const targetState = states[targetDeckType];
  const sourceDeck = targetState.randomDecks[sourceDeckIndex];
  if (!sourceDeck || sourceDeck.some((deckCard) => deckCard.id === card.id)) {
    return states;
  }

  return {
    ...states,
    [targetDeckType]: {
      ...targetState,
      randomDecks: targetState.randomDecks.map((deck, index) =>
        index === sourceDeckIndex ? [card, ...deck] : deck,
      ),
    },
  } satisfies Record<DeckType, DeckControlState>;
};

const buildLabelGroupRpcPayload = (group: LabelGroup | null) =>
  group
    ? {
        id: group.id,
        name: group.name,
        sortOrder: group.sortOrder ?? null,
      }
    : null;

const buildLabelsRpcPayload = (labels: Label[]) =>
  labels.map((label) => ({
    id: label.id,
    name: label.name,
    group_id: label.groupId,
    sort_order: label.sortOrder ?? null,
  }));

const clampCanvasZoom = (value: number) => Math.min(Math.max(value, 0.2), 3);

const sanitizeOffset = (offset: CanvasOffset): CanvasOffset => ({
  x: Number.isFinite(offset.x) ? offset.x : DEFAULT_CANVAS_VIEWPORT.offset.x,
  y: Number.isFinite(offset.y) ? offset.y : DEFAULT_CANVAS_VIEWPORT.offset.y,
});

const getInitialCanvasViewport = (): CanvasViewport => {
  if (typeof window === "undefined") return DEFAULT_CANVAS_VIEWPORT;

  try {
    const stored = window.localStorage.getItem(CANVAS_VIEWPORT_STORAGE_KEY);
    if (!stored) return DEFAULT_CANVAS_VIEWPORT;

    const parsed = JSON.parse(stored) as Partial<CanvasViewport>;
    return {
      zoom: clampCanvasZoom(
        Number(parsed.zoom) || DEFAULT_CANVAS_VIEWPORT.zoom,
      ),
      offset: sanitizeOffset(parsed.offset || DEFAULT_CANVAS_VIEWPORT.offset),
    };
  } catch {
    return DEFAULT_CANVAS_VIEWPORT;
  }
};

const isQuotaExceededError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|resource[-_ ]exhausted/i.test(message);
};

const isPermissionDeniedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /permission[-_ ]denied|missing or insufficient permissions/i.test(
    message,
  );
};

const getErrorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    return ["code", "message", "details", "hint"]
      .map((key) => errorRecord[key])
      .filter((value): value is string => typeof value === "string")
      .join(" ");
  }
  return String(error);
};

const isMissingRpcFunctionError = (error: unknown) =>
  /PGRST202|function .* does not exist|could not find the function|schema cache|not found/i.test(
    getErrorText(error),
  );

const areStringArraysEqual = (left: string[] = [], right: string[] = []) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

type AutoDrawNodeInput = {
  ref_id: string;
  x?: number;
  y?: number;
  label_ids?: string[];
  card?: AutoDrawCardResult;
};

type AutoDrawApplyPlan = {
  runId: string;
  spreadCards: SpreadCard[];
  nextLabels: Label[];
  nextLabelGroups: LabelGroup[];
  createdLabels: Label[];
  createdLabelGroup: LabelGroup | null;
  noteMarkdown: string;
};

const normalizeAutoDrawText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();

const toIChingPolarity = (effect?: string): IChingPolarity => {
  if (effect === "positive" || effect === "negative") return effect;
  return null;
};

const getAutoDrawDefaultPosition = (index: number, totalCards: number) => {
  const columns =
    totalCards <= 4
      ? Math.max(1, totalCards)
      : totalCards <= 12
        ? 4
        : totalCards <= 30
          ? 5
          : 6;

  return {
    x: 150 + (index % columns) * 185,
    y: 150 + Math.floor(index / columns) * 235,
  };
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const buildAutoDrawNoteMarkdown = (
  response: AutoDrawResponse,
  scenario: string,
  script: string,
) => {
  if (script.trim()) return script.trim();
  if (response.note_markdown?.trim()) return response.note_markdown.trim();

  const lines = ["# Auto-Draw Reading", "", "## Scenario", scenario.trim()];

  if (response.scenario_summary?.trim()) {
    lines.push("", "## Summary", response.scenario_summary.trim());
  }

  if (response.themes?.length) {
    lines.push(
      "",
      "## Themes",
      ...response.themes
        .filter((theme) => typeof theme === "string" && theme.trim())
        .map((theme) => `- ${theme.trim()}`),
    );
  }

  if (response.cards?.length) {
    lines.push("", "## Cards");
    response.cards.forEach((card) => {
      lines.push(
        `- ${card.draw_order || ""}. ${card.name || card.card_id}: ${
          card.reason || "No reason provided."
        }`,
      );
    });
  }

  return lines.join("\n");
};

const buildAutoDrawApplyPlan = (
  response: AutoDrawResponse,
  allCards: DeckCard[],
  labels: Label[],
  labelGroups: LabelGroup[],
  scenario: string,
  script: string,
): AutoDrawApplyPlan => {
  const cardById = new Map(allCards.map((card) => [card.id, card]));
  const responseCards = Array.isArray(response.cards) ? response.cards : [];
  const cardResultById = new Map(
    responseCards
      .filter((card) => card?.card_id)
      .map((card) => [card.card_id, card]),
  );
  const canvasNodes = Array.isArray(response.canvas_nodes)
    ? response.canvas_nodes.filter((node) => node?.type === "card")
    : [];

  const nodeInputs: AutoDrawNodeInput[] =
    canvasNodes.length > 0
      ? canvasNodes.map((node) => ({
          ref_id: node.ref_id,
          x: node.x,
          y: node.y,
          label_ids: node.label_ids,
          card: cardResultById.get(node.ref_id),
        }))
      : responseCards.map((card) => ({
          ref_id: card.card_id,
          card,
        }));

  if (nodeInputs.length === 0) {
    throw new Error("Auto-Draw did not return any cards");
  }

  if (nodeInputs.length > AUTO_DRAW_CARD_LIMIT) {
    throw new Error(
      `Auto-Draw returned ${nodeInputs.length} cards, expected at most ${AUTO_DRAW_CARD_LIMIT}`,
    );
  }

  const seenNodeCardIds = new Set<string>();
  const duplicateCardIds = new Set<string>();
  nodeInputs.forEach((node) => {
    if (seenNodeCardIds.has(node.ref_id)) duplicateCardIds.add(node.ref_id);
    seenNodeCardIds.add(node.ref_id);
  });
  if (duplicateCardIds.size > 0) {
    throw new Error(
      `Auto-Draw returned duplicate card IDs: ${Array.from(duplicateCardIds).join(", ")}`,
    );
  }

  const unknownCardIds = nodeInputs
    .map((node) => node.ref_id)
    .filter((cardId) => !cardById.has(cardId));
  if (unknownCardIds.length > 0) {
    throw new Error(
      `Auto-Draw returned unknown card IDs: ${unknownCardIds.join(", ")}`,
    );
  }

  const mismatchedCardTypes = nodeInputs
    .filter((node) => {
      const expectedDeckType = cardById.get(node.ref_id)?.deckType;
      const returnedDeckType =
        node.card?.card_type || cardResultById.get(node.ref_id)?.card_type;
      return (
        returnedDeckType &&
        expectedDeckType &&
        returnedDeckType !== expectedDeckType
      );
    })
    .map((node) => node.ref_id);
  if (mismatchedCardTypes.length > 0) {
    throw new Error(
      `Auto-Draw returned mismatched card types: ${mismatchedCardTypes.join(", ")}`,
    );
  }

  const existingLabelById = new Map(labels.map((label) => [label.id, label]));
  const existingLabelByName = new Map<string, Label>();
  labels.forEach((label) => {
    const key = normalizeAutoDrawText(label.name);
    if (!existingLabelByName.has(key)) existingLabelByName.set(key, label);
  });

  const existingGroupByName = new Map(
    labelGroups.map((group) => [normalizeAutoDrawText(group.name), group]),
  );
  let autoDrawGroup =
    existingGroupByName.get(
      normalizeAutoDrawText(AUTO_DRAW_LABEL_GROUP_NAME),
    ) || null;
  let createdLabelGroup: LabelGroup | null = null;
  const createdLabels: Label[] = [];
  const labelTokenToId = new Map<string, string>();
  const labelsToAttachByCardId = new Map<string, Set<string>>();

  const getAutoDrawGroup = () => {
    if (autoDrawGroup) return autoDrawGroup;
    createdLabelGroup = {
      id: crypto.randomUUID(),
      name: AUTO_DRAW_LABEL_GROUP_NAME,
      sortOrder: labelGroups.length,
    };
    autoDrawGroup = createdLabelGroup;
    return autoDrawGroup;
  };

  const rememberLabelToken = (token: string | undefined, labelId: string) => {
    if (!token?.trim()) return;
    labelTokenToId.set(token.trim(), labelId);
    labelTokenToId.set(normalizeAutoDrawText(token), labelId);
  };

  const resolveOrCreateLabel = (labelResult: {
    label_id?: string;
    name?: string;
  }) => {
    const existingById = labelResult.label_id
      ? existingLabelById.get(labelResult.label_id)
      : undefined;
    if (existingById) {
      rememberLabelToken(labelResult.label_id, existingById.id);
      rememberLabelToken(labelResult.name, existingById.id);
      return existingById.id;
    }

    const normalizedName = labelResult.name
      ? normalizeAutoDrawText(labelResult.name)
      : "";
    const existingByName = normalizedName
      ? existingLabelByName.get(normalizedName)
      : undefined;
    if (existingByName) {
      rememberLabelToken(labelResult.label_id, existingByName.id);
      rememberLabelToken(labelResult.name, existingByName.id);
      return existingByName.id;
    }

    if (!labelResult.name?.trim()) return null;

    const group = getAutoDrawGroup();
    const labelsInGroupCount =
      labels.filter((label) => label.groupId === group.id).length +
      createdLabels.length;
    const newLabel: Label = {
      id: crypto.randomUUID(),
      name: labelResult.name.trim(),
      groupId: group.id,
      sortOrder: labelsInGroupCount,
    };
    createdLabels.push(newLabel);
    rememberLabelToken(labelResult.label_id, newLabel.id);
    rememberLabelToken(labelResult.name, newLabel.id);
    return newLabel.id;
  };

  (response.labels || []).forEach((labelResult) => {
    const labelId = resolveOrCreateLabel(labelResult);
    if (!labelId) return;

    (labelResult.attach_to_card_ids || []).forEach((cardId) => {
      if (!cardById.has(cardId)) return;
      const attached = labelsToAttachByCardId.get(cardId) || new Set<string>();
      attached.add(labelId);
      labelsToAttachByCardId.set(cardId, attached);
    });
  });

  const resolveLabelToken = (token: string) => {
    if (existingLabelById.has(token)) return token;
    return (
      labelTokenToId.get(token) ||
      labelTokenToId.get(normalizeAutoDrawText(token))
    );
  };

  const spreadCards = nodeInputs.map((node, index) => {
    const deckCard = cardById.get(node.ref_id)!;
    const cardResult = node.card || cardResultById.get(node.ref_id);
    const fallbackPosition = getAutoDrawDefaultPosition(
      index,
      nodeInputs.length,
    );
    const nodeLabelIds = (node.label_ids || [])
      .map((labelToken) => resolveLabelToken(labelToken))
      .filter(Boolean) as string[];
    const attachedLabelIds = Array.from(
      labelsToAttachByCardId.get(node.ref_id) || new Set<string>(),
    );
    const labelIds = Array.from(
      new Set([...nodeLabelIds, ...attachedLabelIds]),
    );

    return {
      id: crypto.randomUUID(),
      cardId: node.ref_id,
      deckType: deckCard.deckType,
      x: isFiniteNumber(node.x) ? node.x : fallbackPosition.x,
      y: isFiniteNumber(node.y) ? node.y : fallbackPosition.y,
      labels: labelIds,
      isReversed: cardResult?.orientation === "reversed",
      polarity:
        deckCard.deckType === "iching"
          ? toIChingPolarity(cardResult?.effect)
          : null,
      drawSequence: cardResult?.draw_order || index + 1,
      placedSequence: index + 1,
      autoDrawReason: cardResult?.reason,
      positionLabel: cardResult?.position,
      matchScore: isFiniteNumber(cardResult?.match_score)
        ? cardResult?.match_score
        : undefined,
    } satisfies SpreadCard;
  });

  return {
    runId: crypto.randomUUID(),
    spreadCards: spreadCards.sort(
      (a, b) => (a.drawSequence || 0) - (b.drawSequence || 0),
    ),
    nextLabels: [...labels, ...createdLabels],
    nextLabelGroups: createdLabelGroup
      ? [...labelGroups, createdLabelGroup]
      : labelGroups,
    createdLabels,
    createdLabelGroup,
    noteMarkdown: buildAutoDrawNoteMarkdown(response, scenario, script),
  };
};

type AutoDrawDialogProps = {
  open: boolean;
  isGenerating: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (scenario: string, script: string) => Promise<boolean>;
};

function AutoDrawDialog({
  open,
  isGenerating,
  onOpenChange,
  onGenerate,
}: AutoDrawDialogProps) {
  const [scenarioDraft, setScenarioDraft] = useState("");
  const [scriptDraft, setScriptDraft] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    void (async () => {
      const didGenerate = await onGenerate(
        scenarioDraft.trim(),
        scriptDraft.trim(),
      );

      if (didGenerate) {
        setScenarioDraft("");
        setScriptDraft("");
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(920px,calc(100vw-2rem))] max-w-none p-0 sm:max-w-none">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[min(760px,calc(100vh-2rem))] min-h-[520px] flex-col"
        >
          <DialogHeader className="shrink-0 border-b border-[#e2e8f0] px-6 pt-6 pb-4">
            <DialogTitle>Auto-draw</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="auto-draw-scenario"
                className="text-xs font-extrabold uppercase tracking-wider text-[#495360]"
              >
                Scenario
              </label>
              <textarea
                id="auto-draw-scenario"
                value={scenarioDraft}
                onChange={(event) => setScenarioDraft(event.target.value)}
                placeholder="Describe the situation, question, or reading context..."
                className="min-h-[210px] w-full resize-none rounded-xl border border-[#e2e8f0] bg-white p-4 text-sm leading-6 outline-none focus:border-[#166db0]"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="auto-draw-script"
                className="text-xs font-extrabold uppercase tracking-wider text-[#495360]"
              >
                SCRIPT
              </label>
              <textarea
                id="auto-draw-script"
                value={scriptDraft}
                onChange={(event) => setScriptDraft(event.target.value)}
                className="min-h-[170px] w-full resize-none rounded-xl border border-[#e2e8f0] bg-white p-4 text-sm leading-6 outline-none focus:border-[#166db0]"
              />
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isGenerating}
              className="bg-[#166db0] text-white hover:bg-[#0e4a77]"
            >
              {isGenerating ? "Generating..." : "Generate Canvas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CardDrawingView({
  cards,
  spreadCards,
  setSpreadCards,
  labels,
  setLabels,
  labelGroups,
  setLabelGroups,
  user,
  loadCanvas,
  onClearLoadCanvas,
  onMasterDataWritten,
}: CardDrawingViewProps) {
  const [deckType, setDeckType] = useState<DeckType>("iching");
  const [deckMode, setDeckMode] = useState<DeckMode>("random");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [bulkSelectedCardIds, setBulkSelectedCardIds] = useState<string[]>([]);
  const [bulkSelectedLabelIds, setBulkSelectedLabelIds] = useState<string[]>(
    [],
  );
  const [isBulkLabelPanelOpen, setIsBulkLabelPanelOpen] = useState(false);
  const [bulkLabelPanelPosition, setBulkLabelPanelPosition] = useState(
    DEFAULT_BULK_LABEL_PANEL_POSITION,
  );
  const isBulkLabelSaving = false;
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport>(() =>
    getInitialCanvasViewport(),
  );
  const zoom = canvasViewport.zoom;
  const canvasOffset = canvasViewport.offset;
  const iChingCards = useMemo<IChingCard[]>(
    () => cards.map((card) => ({ ...card, deckType: "iching" as const })),
    [cards],
  );
  const deckCardSets = useMemo<Record<DeckType, DeckCard[]>>(
    () => ({
      iching: iChingCards,
      tarot: TAROT_CARDS,
    }),
    [iChingCards],
  );
  const activeCards = useMemo<DeckCard[]>(
    () => deckCardSets[deckType],
    [deckCardSets, deckType],
  );
  const allCards = useMemo<DeckCard[]>(
    () => [...iChingCards, ...TAROT_CARDS],
    [iChingCards],
  );
  const storedWorkingCanvasStateRef = useRef<StoredWorkingCanvasState | null>(
    readStoredWorkingCanvasState(),
  );

  // Deck State
  const [deckStates, setDeckStates] = useState<
    Record<DeckType, DeckControlState>
  >(() => {
    const storedState = storedWorkingCanvasStateRef.current;
    return {
      iching:
        createDeckControlStateFromStored(
          storedState?.deckStates?.iching,
          iChingCards,
        ) ?? createDeckControlState(iChingCards),
      tarot:
        createDeckControlStateFromStored(
          storedState?.deckStates?.tarot,
          TAROT_CARDS,
        ) ?? createDeckControlState(TAROT_CARDS),
    };
  });
  const workingCanvasId = "working-canvas";
  const resetInProgressRef = useRef(false);
  const saveDialogSubmittedRef = useRef(false);
  const deckLoadVersionRef = useRef<Record<DeckType, number>>({
    iching: 0,
    tarot: 0,
  });
  const hasHydratedWorkingCanvasRef = useRef(false);
  const hasHydratedDeckStatesRef = useRef<Record<DeckType, boolean>>({
    iching: false,
    tarot: false,
  });
  const pendingPositionByCardIdRef = useRef<Record<string, PendingPosition>>(
    {},
  );
  const positionRevisionRef = useRef(0);
  const canvasMutationDepthRef = useRef(0);
  const currentDeckState = deckStates[deckType];
  const deckCount = currentDeckState.deckCount;
  const randomDecks = currentDeckState.randomDecks;

  const applyDeckRpcResult = useCallback(
    (
      targetDeckType: DeckType,
      result: { deck_count?: number; decks?: RpcDeckSnapshot[] } | null,
      targetCards: DeckCard[],
    ) => {
      const nextDeckState = createDeckControlStateFromRpc(result, targetCards);
      if (!nextDeckState) return false;

      deckLoadVersionRef.current[targetDeckType] += 1;
      const nextDeckStates = {
        ...deckStatesRef.current,
        [targetDeckType]: nextDeckState,
      };
      deckStatesRef.current = nextDeckStates;
      setDeckStates(nextDeckStates);
      return true;
    },
    [],
  );

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [canvasName, setCanvasName] = useState("");
  const [showAutoDrawDialog, setShowAutoDrawDialog] = useState(false);
  const [isAutoDrawing, setIsAutoDrawing] = useState(false);
  const [isNotePanelOpen, setIsNotePanelOpen] = useState(false);
  const [isNoteEditing, setIsNoteEditing] = useState(false);
  const [canvasNoteDraft, setCanvasNoteDraft] = useState("");
  const isCanvasNoteDirtyRef = useRef(false);
  const canvasNoteDraftRef = useRef(canvasNoteDraft);
  const [workingCanvasMeta, setWorkingCanvasMeta] = useState<CanvasMetadata>(
    {},
  );
  const workingCanvasMetaRef = useRef(workingCanvasMeta);
  const spreadCardsRef = useRef(spreadCards);
  const deckStatesRef = useRef(deckStates);
  const hasRestoredLocalWorkingStateRef = useRef(false);
  const skipNextWorkingStatePersistRef = useRef(false);
  const [isSavingNote, setIsSavingNote] = useState(false);

  const setZoom = useCallback((nextZoom: number) => {
    setCanvasViewport((prev) => ({
      ...prev,
      zoom: clampCanvasZoom(nextZoom),
    }));
  }, []);

  const setCanvasOffset = useCallback((nextOffset: CanvasOffset) => {
    setCanvasViewport((prev) => ({
      ...prev,
      offset: sanitizeOffset(nextOffset),
    }));
  }, []);

  const resetCanvasViewport = useCallback(() => {
    setCanvasViewport({
      zoom: DEFAULT_CANVAS_VIEWPORT.zoom,
      offset: { ...DEFAULT_CANVAS_VIEWPORT.offset },
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      CANVAS_VIEWPORT_STORAGE_KEY,
      JSON.stringify(canvasViewport),
    );
  }, [canvasViewport]);

  const openBulkLabelPanel = useCallback(() => {
    setIsBulkLabelPanelOpen(true);
  }, []);

  const closeBulkLabelPanel = useCallback(() => {
    setIsBulkLabelPanelOpen(false);
    setBulkSelectedCardIds([]);
    setBulkSelectedLabelIds([]);
  }, []);

  const beginCanvasMutation = useCallback(() => {
    canvasMutationDepthRef.current += 1;
    return () => {
      canvasMutationDepthRef.current = Math.max(
        0,
        canvasMutationDepthRef.current - 1,
      );
    };
  }, []);

  const persistWorkingCanvasState = useCallback(
    (
      overrides: Partial<{
        spreadCards: SpreadCard[];
        deckStates: Record<DeckType, DeckControlState>;
        workingCanvasMeta: CanvasMetadata;
        canvasNoteDraft: string;
      }> = {},
    ) => {
      const snapshot = writeStoredWorkingCanvasState({
        spreadCards: overrides.spreadCards ?? spreadCardsRef.current,
        deckStates: overrides.deckStates ?? deckStatesRef.current,
        workingCanvasMeta:
          overrides.workingCanvasMeta ?? workingCanvasMetaRef.current,
        canvasNoteDraft:
          overrides.canvasNoteDraft ?? canvasNoteDraftRef.current,
      });
      if (snapshot) {
        storedWorkingCanvasStateRef.current = snapshot;
      }
    },
    [],
  );

  useEffect(() => {
    if (hasRestoredLocalWorkingStateRef.current) return;

    hasRestoredLocalWorkingStateRef.current = true;
    const storedState = storedWorkingCanvasStateRef.current;
    if (!storedState) return;

    skipNextWorkingStatePersistRef.current = true;
    if (Array.isArray(storedState.spreadCards)) {
      setSpreadCards(storedState.spreadCards);
    }
    if (storedState.workingCanvasMeta) {
      setWorkingCanvasMeta(storedState.workingCanvasMeta);
    }
    isCanvasNoteDirtyRef.current = false;
    setCanvasNoteDraft(
      storedState.canvasNoteDraft ??
        storedState.workingCanvasMeta?.noteMarkdown ??
        "",
    );
  }, [setSpreadCards]);

  useEffect(() => {
    spreadCardsRef.current = spreadCards;
    const existingCardIds = new Set(spreadCards.map((card) => card.id));
    setBulkSelectedCardIds((prev) =>
      prev.filter((id) => existingCardIds.has(id)),
    );
  }, [spreadCards]);

  useEffect(() => {
    deckStatesRef.current = deckStates;
  }, [deckStates]);

  useEffect(() => {
    canvasNoteDraftRef.current = canvasNoteDraft;
  }, [canvasNoteDraft]);

  useEffect(() => {
    workingCanvasMetaRef.current = workingCanvasMeta;
  }, [workingCanvasMeta]);

  useEffect(() => {
    const existingLabelIds = new Set(labels.map((label) => label.id));
    setBulkSelectedLabelIds((prev) =>
      prev.filter((id) => existingLabelIds.has(id)),
    );
  }, [labels]);

  useEffect(() => {
    if (!user || !hasRestoredLocalWorkingStateRef.current) return;
    if (skipNextWorkingStatePersistRef.current) {
      skipNextWorkingStatePersistRef.current = false;
      return;
    }

    persistWorkingCanvasState({
      spreadCards,
      deckStates,
      workingCanvasMeta,
      canvasNoteDraft,
    });
  }, [
    canvasNoteDraft,
    deckStates,
    persistWorkingCanvasState,
    spreadCards,
    user,
    workingCanvasMeta,
  ]);

  const removeCardFromDeckState = useCallback(
    (targetDeckType: DeckType, sourceDeckIndex: number, cardId: string) => {
      deckLoadVersionRef.current[targetDeckType] += 1;

      setDeckStates((prev) =>
        removeCardFromDeckStates(
          prev,
          targetDeckType,
          sourceDeckIndex,
          cardId,
        ),
      );
    },
    [],
  );

  const returnCardToDeckState = useCallback(
    (targetDeckType: DeckType, sourceDeckIndex: number, card: DeckCard) => {
      deckLoadVersionRef.current[targetDeckType] += 1;

      setDeckStates((prev) =>
        returnCardToDeckStates(prev, targetDeckType, sourceDeckIndex, card),
      );
    },
    [],
  );

  const refreshDeckStateFromDb = useCallback(
    async (targetDeckType: DeckType, targetCards: DeckCard[]) => {
      if (!db) return;

      const deckCollection = getDeckCollectionName(targetDeckType);
      const decksSnap = await getDocs(collection(db, deckCollection));
      const sortedDecks = decksSnap.docs
        .map((deckDoc) => ({
          id: deckDoc.id,
          ...(deckDoc.data() as { orderIndex?: number }),
        }))
        .sort(
          (a, b) =>
            (a.orderIndex ?? Number.MAX_SAFE_INTEGER) -
              (b.orderIndex ?? Number.MAX_SAFE_INTEGER) ||
            a.id.localeCompare(b.id),
        );

      const cardById = new Map(targetCards.map((card) => [card.id, card]));
      const fullDecks: DeckCard[][] = [];
      for (const deck of sortedDecks) {
        const deckCardsSnap = await getDocs(
          query(
            collection(db, `${deckCollection}/${deck.id}/cards`),
            where("currentLocation", "==", "deck"),
          ),
        );
        const deckCards = deckCardsSnap.docs
          .map((cardDoc) => {
            const data = cardDoc.data() as {
              sourceCardId?: string;
              sortOrder?: number;
            };
            const card = cardById.get(data.sourceCardId || cardDoc.id);
            return card
              ? {
                  card,
                  sortOrder: data.sortOrder ?? Number.MAX_SAFE_INTEGER,
                }
              : null;
          })
          .filter(Boolean)
          .sort((a, b) => a!.sortOrder - b!.sortOrder)
          .map((entry) => entry!.card);
        fullDecks.push(deckCards);
      }

      const nextTargetDeckState = {
        deckCount: fullDecks.length,
        randomDecks: fullDecks,
      };
      const nextDeckStates = {
        ...deckStatesRef.current,
        [targetDeckType]: nextTargetDeckState,
      };
      deckStatesRef.current = nextDeckStates;
      setDeckStates(nextDeckStates);
      persistWorkingCanvasState({ deckStates: nextDeckStates });
    },
    [persistWorkingCanvasState],
  );

  const ensureDeckStateFromDb = useCallback(
    async (
      targetDeckType: DeckType,
      targetCards: DeckCard[],
      canApply: () => boolean = () => true,
    ) => {
      if (!supabase) return false;

      const { data, error } = await supabase.rpc("ensure_random_decks", {
        p_deck_type: targetDeckType,
        p_cards: buildDeckRpcPayload(targetCards),
        p_deck_count: Math.max(
          1,
          deckStatesRef.current[targetDeckType]?.deckCount || 3,
        ),
      });
      if (error) throw error;

      const nextDeckState = createDeckControlStateFromRpc(data, targetCards);
      if (!nextDeckState) return false;
      if (!canApply()) return true;

      const storedDeckState = createDeckControlStateFromStored(
        storedWorkingCanvasStateRef.current?.deckStates?.[targetDeckType],
        targetCards,
      );
      const shouldKeepRecentLocalDeck = Boolean(
        isRecentStoredWorkingCanvasState(storedWorkingCanvasStateRef.current) &&
          storedDeckState &&
          countDeckCards(storedDeckState) < countDeckCards(nextDeckState),
      );

      deckLoadVersionRef.current[targetDeckType] += 1;
      const deckStateToApply = shouldKeepRecentLocalDeck
        ? storedDeckState!
        : nextDeckState;
      const nextDeckStates = {
        ...deckStatesRef.current,
        [targetDeckType]: deckStateToApply,
      };
      deckStatesRef.current = nextDeckStates;
      setDeckStates(nextDeckStates);
      persistWorkingCanvasState({ deckStates: nextDeckStates });
      return true;
    },
    [persistWorkingCanvasState],
  );

  useEffect(() => {
    hasHydratedWorkingCanvasRef.current = false;
    hasHydratedDeckStatesRef.current = { iching: false, tarot: false };
  }, [user?.id]);

  // Hydrate the working canvas once. Interactive canvas state is local-first.
  useEffect(() => {
    if (!db || !user || hasHydratedWorkingCanvasRef.current) return;

    let cancelled = false;
    hasHydratedWorkingCanvasRef.current = true;

    const hydrateWorkingCanvas = async () => {
      try {
        const metadataSnap = await getDocs(
          doc(db, "canvases", workingCanvasId),
        );
        if (cancelled) return;

        const metadata =
          ((metadataSnap.docs[0]?.data() || {}) as CanvasMetadata) || {};

        const cardsSnap = await getDocs(
          query(collection(db, `canvases/${workingCanvasId}/cards`)),
        );
        if (cancelled) return;

        const cards = cardsSnap.docs
          .map(
            (cardDoc) => ({ id: cardDoc.id, ...cardDoc.data() }) as SpreadCard,
          )
          .sort((a, b) => (a.drawSequence || 0) - (b.drawSequence || 0));

        const storedState = storedWorkingCanvasStateRef.current;
        const shouldKeepRecentLocalCards =
          cards.length === 0 &&
          (storedState?.spreadCards?.length ?? 0) > 0 &&
          isRecentStoredWorkingCanvasState(storedState);
        if (shouldKeepRecentLocalCards) return;

        setWorkingCanvasMeta(metadata);
        if (!isCanvasNoteDirtyRef.current) {
          setCanvasNoteDraft((prev) =>
            prev === (metadata.noteMarkdown || "")
              ? prev
              : metadata.noteMarkdown || "",
          );
        }
        setSpreadCards(cards);
        persistWorkingCanvasState({
          spreadCards: cards,
          workingCanvasMeta: metadata,
          canvasNoteDraft: isCanvasNoteDirtyRef.current
            ? canvasNoteDraftRef.current
            : metadata.noteMarkdown || "",
        });
      } catch (error) {
        if (!cancelled) {
          hasHydratedWorkingCanvasRef.current = false;
          handleSupabaseError(
            error,
            OperationType.GET,
            `canvases/${workingCanvasId}`,
          );
        }
      }
    };

    void hydrateWorkingCanvas();
    return () => {
      cancelled = true;
    };
  }, [db, persistWorkingCanvasState, setSpreadCards, user, workingCanvasId]);

  // Hydrate decks once. Draw/remove/shuffle/deck-count handlers own later state changes.
  useEffect(() => {
    if (!db || !user) return;

    let cancelled = false;
    const deckEntries: Array<[DeckType, DeckCard[]]> = [
      ["iching", deckCardSets.iching],
      ["tarot", deckCardSets.tarot],
    ];

    const hydrateDeckState = async (
      targetDeckType: DeckType,
      targetCards: DeckCard[],
    ) => {
      if (targetCards.length === 0) return;
      if (hasHydratedDeckStatesRef.current[targetDeckType]) return;

      const deckCollection = getDeckCollectionName(targetDeckType);
      const loadVersion = deckLoadVersionRef.current[targetDeckType] + 1;
      deckLoadVersionRef.current[targetDeckType] = loadVersion;
      hasHydratedDeckStatesRef.current[targetDeckType] = true;

      try {
        const loadedFromRpc = await ensureDeckStateFromDb(
          targetDeckType,
          targetCards,
          () =>
            !cancelled &&
            !resetInProgressRef.current &&
            deckLoadVersionRef.current[targetDeckType] === loadVersion,
        );
        if (loadedFromRpc) return;

        if (
          cancelled ||
          resetInProgressRef.current ||
          deckLoadVersionRef.current[targetDeckType] !== loadVersion
        )
          return;

        await refreshDeckStateFromDb(targetDeckType, targetCards);
      } catch (error) {
        if (!cancelled) {
          hasHydratedDeckStatesRef.current[targetDeckType] = false;
          handleSupabaseError(error, OperationType.GET, deckCollection);
        }
      }
    };

    deckEntries.forEach(([targetDeckType, targetCards]) => {
      void hydrateDeckState(targetDeckType, targetCards);
    });

    return () => {
      cancelled = true;
      deckEntries.forEach(([targetDeckType]) => {
        deckLoadVersionRef.current[targetDeckType] += 1;
      });
    };
  }, [db, deckCardSets, ensureDeckStateFromDb, refreshDeckStateFromDb, user]);

  // Load a saved canvas into the working canvas.
  useEffect(() => {
    if (loadCanvas) {
      // Loading a saved canvas into the working canvas
      const executeLoad = async () => {
        const loadedSpreadCards = loadCanvas.spreadCards || [];
        const loadedMetadata: CanvasMetadata = {
          noteMarkdown: loadCanvas.noteMarkdown || "",
          scenario: loadCanvas.scenario || "",
          source: loadCanvas.source || "manual",
          autoDrawRunId: loadCanvas.autoDrawRunId || "",
          cardCount: loadedSpreadCards.length,
          type: "working",
          status: "active",
          updatedAt: new Date().toISOString(),
        };

        if (!db) {
          toast.error("Supabase connection is required to load a canvas");
          onClearLoadCanvas?.();
          return;
        }

        if (!supabase) {
          toast.error("Supabase connection is required to load a canvas");
          onClearLoadCanvas?.();
          return;
        }

        const previousSpreadCards = spreadCardsRef.current;
        const previousWorkingCanvasMeta = workingCanvasMetaRef.current;
        const previousCanvasNoteDraft = canvasNoteDraftRef.current;
        const previousIsNoteEditing = isNoteEditing;
        const endCanvasMutation = beginCanvasMutation();
        try {
          pendingPositionByCardIdRef.current = {};
          isCanvasNoteDirtyRef.current = false;
          spreadCardsRef.current = loadedSpreadCards;
          setSpreadCards(loadedSpreadCards);
          setWorkingCanvasMeta(loadedMetadata);
          setCanvasNoteDraft(loadedMetadata.noteMarkdown || "");
          setIsNoteEditing(false);
          persistWorkingCanvasState({
            spreadCards: loadedSpreadCards,
            workingCanvasMeta: loadedMetadata,
            canvasNoteDraft: loadedMetadata.noteMarkdown || "",
          });

          const { error } = await supabase.rpc("replace_working_canvas", {
            p_cards: buildCanvasCardsRpcPayload(loadedSpreadCards),
            p_note_markdown: loadedMetadata.noteMarkdown || "",
            p_scenario: loadedMetadata.scenario || "",
            p_source: loadedMetadata.source || "manual",
            p_auto_draw_run_id: loadedMetadata.autoDrawRunId || "",
          });
          if (error) throw error;

          toast.success("Canvas loaded");
          onClearLoadCanvas?.();
        } catch (error) {
          spreadCardsRef.current = previousSpreadCards;
          setSpreadCards(previousSpreadCards);
          setWorkingCanvasMeta(previousWorkingCanvasMeta);
          setCanvasNoteDraft(previousCanvasNoteDraft);
          setIsNoteEditing(previousIsNoteEditing);
          persistWorkingCanvasState({
            spreadCards: previousSpreadCards,
            workingCanvasMeta: previousWorkingCanvasMeta,
            canvasNoteDraft: previousCanvasNoteDraft,
          });
          console.error("Load canvas failed:", error);
          toast.error(
            isPermissionDeniedError(error)
              ? "Supabase RLS blocked loading this canvas."
              : "Failed to load canvas",
          );
          onClearLoadCanvas?.();
        } finally {
          endCanvasMutation();
        }
      };
      executeLoad();
    }
  }, [
    beginCanvasMutation,
    isNoteEditing,
    loadCanvas,
    persistWorkingCanvasState,
    setSpreadCards,
  ]);

  const handleReset = () => {
    setShowResetConfirm(true);
  };

  const openSaveDialog = () => {
    saveDialogSubmittedRef.current = false;
    setCanvasName("");
    setShowSaveDialog(true);
  };

  const handleSaveDialogOpenChange = (open: boolean) => {
    setShowSaveDialog(open);
    if (!open) {
      saveDialogSubmittedRef.current = false;
      setCanvasName("");
    }
  };

  const saveWorkingCanvasMetadata = async (metadata: CanvasMetadata) => {
    const updatedAt = new Date().toISOString();
    const nextMetadata: CanvasMetadata = {
      ...workingCanvasMeta,
      ...metadata,
      type: "working",
      status: "active",
      updatedAt,
    };

    workingCanvasMetaRef.current = nextMetadata;
    setWorkingCanvasMeta(nextMetadata);
    persistWorkingCanvasState({
      workingCanvasMeta: nextMetadata,
      canvasNoteDraft: metadata.noteMarkdown ?? canvasNoteDraftRef.current,
    });

    if (!db) {
      return;
    }

    await setDoc(
      doc(db, "canvases", workingCanvasId),
      {
        name: "Working Canvas",
        ...nextMetadata,
        cardCount: metadata.cardCount ?? spreadCards.length,
      },
      { merge: true },
    );
  };

  const handleSaveCanvasNote = async () => {
    setIsSavingNote(true);
    try {
      await saveWorkingCanvasMetadata({
        noteMarkdown: canvasNoteDraft,
        source: workingCanvasMeta.source || "manual",
        cardCount: spreadCards.length,
      });
      isCanvasNoteDirtyRef.current = false;
      setIsNoteEditing(false);
      toast.success("Canvas note saved");
    } catch (error) {
      console.error("Save canvas note failed:", error);
      toast.error("Failed to save canvas note");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleCanvasNoteChange = useCallback((nextMarkdown: string) => {
    isCanvasNoteDirtyRef.current = true;
    setCanvasNoteDraft(nextMarkdown);
  }, []);

  const handleNotePrimaryAction = () => {
    if (isNoteEditing) {
      void handleSaveCanvasNote();
      return;
    }

    setIsNoteEditing(true);
  };

  const handleToggleNotePanel = () => {
    const willOpen = !isNotePanelOpen;
    if (willOpen) {
      setIsNoteEditing(!canvasNoteDraftRef.current.trim());
    }
    setIsNotePanelOpen(willOpen);
  };

  const executeReset = async () => {
    setShowResetConfirm(false);
    if (!db) {
      toast.error("Supabase connection is required to reset the canvas");
      return;
    }

    const previousSpreadCards = spreadCards;
    const previousDeckStates = deckStates;
    const previousCanvasViewport = canvasViewport;
    const previousWorkingCanvasMeta = workingCanvasMeta;
    const previousCanvasNoteDraft = canvasNoteDraft;
    const previousIsNoteEditing = isNoteEditing;
    const endCanvasMutation = beginCanvasMutation();
    let didClearCanvasInDb = false;

    const resetDeckStates = {
      iching: createDeckControlState(iChingCards),
      tarot: createDeckControlState(TAROT_CARDS),
    };
    const resetMetadata: CanvasMetadata = {
      noteMarkdown: "",
      scenario: "",
      source: "manual",
      autoDrawRunId: "",
      cardCount: 0,
      type: "working",
      status: "active",
    };

    setSpreadCards([]);
    closeBulkLabelPanel();
    setDeckStates(resetDeckStates);
    resetCanvasViewport();
    isCanvasNoteDirtyRef.current = false;
    setCanvasNoteDraft("");
    setWorkingCanvasMeta(resetMetadata);
    setIsNoteEditing(true);
    spreadCardsRef.current = [];
    deckStatesRef.current = resetDeckStates;
    persistWorkingCanvasState({
      spreadCards: [],
      deckStates: resetDeckStates,
      workingCanvasMeta: resetMetadata,
      canvasNoteDraft: "",
    });

    resetInProgressRef.current = true;

    try {
      if (!supabase) {
        throw new Error("Supabase client is not available.");
      }

      pendingPositionByCardIdRef.current = {};
      const { error } = await supabase.rpc("reset_working_canvas_and_decks", {
        p_iching_cards: buildDeckRpcPayload(iChingCards),
        p_tarot_cards: buildDeckRpcPayload(TAROT_CARDS),
      });
      if (error) throw error;
      didClearCanvasInDb = true;
    } catch (error) {
      console.error("Reset failed:", error);
      if (!didClearCanvasInDb) {
        setSpreadCards(previousSpreadCards);
        setDeckStates(previousDeckStates);
        setCanvasViewport(previousCanvasViewport);
        setWorkingCanvasMeta(previousWorkingCanvasMeta);
        isCanvasNoteDirtyRef.current = false;
        setCanvasNoteDraft(previousCanvasNoteDraft);
        setIsNoteEditing(previousIsNoteEditing);
        spreadCardsRef.current = previousSpreadCards;
        deckStatesRef.current = previousDeckStates;
        persistWorkingCanvasState({
          spreadCards: previousSpreadCards,
          deckStates: previousDeckStates,
          workingCanvasMeta: previousWorkingCanvasMeta,
          canvasNoteDraft: previousCanvasNoteDraft,
        });
        toast.error(
          isQuotaExceededError(error)
            ? "Supabase quota exceeded. Canvas was not reset in DB."
            : "Reset failed",
        );
      }
    } finally {
      resetInProgressRef.current = false;
      endCanvasMutation();
    }
  };

  const handleSaveCanvas = async () => {
    const nextCanvasName = canvasName.trim();
    if (!nextCanvasName) {
      toast.error("Please enter a canvas name");
      return;
    }

    if (saveDialogSubmittedRef.current) return;
    saveDialogSubmittedRef.current = true;
    setShowSaveDialog(false);
    setCanvasName("");

    try {
      if (!db || !supabase) {
        throw new Error("Supabase connection is required to save a canvas");
      }

      const canvasId = crypto.randomUUID();
      const { error } = await supabase.rpc("save_canvas_snapshot", {
        p_canvas_id: canvasId,
        p_name: nextCanvasName,
        p_cards: buildCanvasCardsRpcPayload(spreadCards),
        p_note_markdown: canvasNoteDraft,
        p_scenario: workingCanvasMeta.scenario || "",
        p_source: workingCanvasMeta.source || "manual",
        p_auto_draw_run_id: workingCanvasMeta.autoDrawRunId || "",
      });
      if (error) throw error;

      toast.success("Canvas saved to Supabase");
    } catch (error) {
      console.error("Save failed:", error);
      toast.error(
        isQuotaExceededError(error)
          ? "Supabase quota exceeded. Canvas was not saved to DB."
          : "Save failed",
      );
    }
  };

  const handleSaveCanvasSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSaveCanvas();
  };

  const handleAutoDrawCanvas = async (
    scenarioInput: string,
    scriptInput: string,
  ) => {
    if (!db || !supabase) {
      toast.error("Supabase connection is required for Auto-Draw");
      return false;
    }

    const scenario = scenarioInput.trim();
    const script = scriptInput.trim();
    if (!scenario && !script) {
      toast.error("Please enter a scenario or script");
      return false;
    }

    const previousSpreadCards = spreadCards;
    const previousLabels = labels;
    const previousLabelGroups = labelGroups;
    const previousWorkingCanvasMeta = workingCanvasMeta;
    const previousCanvasNoteDraft = canvasNoteDraft;
    const previousIsNoteEditing = isNoteEditing;
    let endCanvasMutation: (() => void) | null = null;

    setIsAutoDrawing(true);

    try {
      const response = await generateCanvasFromScenario({
        scenario,
        script,
        cards: allCards,
        labels,
        labelGroups,
        deckTypes: ["iching", "tarot"],
      });
      const plan = buildAutoDrawApplyPlan(
        response,
        allCards,
        labels,
        labelGroups,
        scenario,
        script,
      );
      const updatedAt = new Date().toISOString();
      const nextMetadata: CanvasMetadata = {
        noteMarkdown: plan.noteMarkdown,
        scenario,
        source: "auto-draw",
        autoDrawRunId: plan.runId,
        cardCount: plan.spreadCards.length,
        type: "working",
        status: "active",
        updatedAt,
      };
      const hasCreatedMasterData =
        plan.createdLabels.length > 0 || Boolean(plan.createdLabelGroup);
      const masterDataVersion = hasCreatedMasterData
        ? createMasterDataVersion()
        : null;

      endCanvasMutation = beginCanvasMutation();
      pendingPositionByCardIdRef.current = {};
      const { error } = await supabase.rpc("apply_auto_draw_result", {
        p_cards: buildCanvasCardsRpcPayload(plan.spreadCards),
        p_note_markdown: plan.noteMarkdown,
        p_scenario: scenario,
        p_script: script,
        p_run_id: plan.runId,
        p_created_label_group: buildLabelGroupRpcPayload(
          plan.createdLabelGroup,
        ),
        p_created_labels: buildLabelsRpcPayload(plan.createdLabels),
        p_master_data_version: masterDataVersion || "",
        p_model: response._meta?.model || "",
        p_provider: response._meta?.provider || "freemodel.dev",
        p_reasoning_effort: response._meta?.reasoning_effort || "",
        p_elapsed_ms: response._meta?.elapsed_ms ?? null,
        p_endpoint_host: response._meta?.endpoint_host || "",
        p_card_limit: response._meta?.card_limit ?? AUTO_DRAW_CARD_LIMIT,
        p_structured_output: response,
      });
      if (error) throw error;

      setLabelGroups(plan.nextLabelGroups);
      setLabels(plan.nextLabels);
      if (masterDataVersion) {
        onMasterDataWritten(masterDataVersion);
      }
      spreadCardsRef.current = plan.spreadCards;
      setSpreadCards(plan.spreadCards);
      setWorkingCanvasMeta(nextMetadata);
      isCanvasNoteDirtyRef.current = false;
      setCanvasNoteDraft(plan.noteMarkdown);
      setIsNoteEditing(false);
      persistWorkingCanvasState({
        spreadCards: plan.spreadCards,
        workingCanvasMeta: nextMetadata,
        canvasNoteDraft: plan.noteMarkdown,
      });
      closeBulkLabelPanel();
      setShowAutoDrawDialog(false);
      setIsNotePanelOpen(true);
      toast.success(
        `Auto-Draw placed ${plan.spreadCards.length} cards on the canvas`,
      );
      return true;
    } catch (error) {
      spreadCardsRef.current = previousSpreadCards;
      setSpreadCards(previousSpreadCards);
      setLabels(previousLabels);
      setLabelGroups(previousLabelGroups);
      setWorkingCanvasMeta(previousWorkingCanvasMeta);
      isCanvasNoteDirtyRef.current = false;
      setCanvasNoteDraft(previousCanvasNoteDraft);
      setIsNoteEditing(previousIsNoteEditing);
      persistWorkingCanvasState({
        spreadCards: previousSpreadCards,
        workingCanvasMeta: previousWorkingCanvasMeta,
        canvasNoteDraft: previousCanvasNoteDraft,
      });
      console.error("Auto-Draw failed:", error);
      toast.error(error instanceof Error ? error.message : "Auto-Draw failed");
      return false;
    } finally {
      endCanvasMutation?.();
      setIsAutoDrawing(false);
    }
  };

  const handleUpdateCard = async (updatedCard: IChingCard) => {
    if (!db) {
      return;
    }
    try {
      const version = createMasterDataVersion();
      const batch = writeBatch(db);
      batch.set(
        doc(db, "iching_cards_master", updatedCard.id),
        {
          ...updatedCard,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      writeMasterDataMarker({ batch, db }, version);
      await batch.commit();
      toast.success("Hexagram keywords updated");
    } catch (error) {
      console.error("Update card failed:", error);
      toast.error("Failed to update keywords");
    }
  };

  const getCanvasInfoText = () => {
    return spreadCards
      .map((sc, index) => {
        const card = allCards.find((c) => c.id === sc.cardId);
        const cardLabel = getCardLabel(card, getSpreadCardDeckType(sc));
        const cardLabels = sc.labels
          .map((lId) => labels.find((l) => l.id === lId)?.name)
          .filter(Boolean);
        return `${index + 1}. ${cardLabel} ${card?.number}: ${card?.vietnameseName} (${card?.englishName})${cardLabels.length > 0 ? ` - Energy Field: ${cardLabels.join(", ")}` : ""}`;
      })
      .join("\n");
  };

  const copyInfo = () => {
    navigator.clipboard.writeText(getCanvasInfoText());
    toast.success("Info copied to clipboard");
  };

  const handleSelectCard = useCallback((id: string) => {
    setSelectedCardId(id);
  }, []);

  const toggleBulkCardSelection = useCallback((cardId: string) => {
    setBulkSelectedCardIds((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId],
    );
  }, []);

  const toggleBulkLabelSelection = useCallback((labelId: string) => {
    setBulkSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId],
    );
  }, []);

  const applyLabelsToSelectedCards = async (
    labelIdsToApply: string[] = bulkSelectedLabelIds,
    _successMessage = "Labels applied to selected cards",
  ) => {
    const normalizedLabelIds = Array.from(new Set(labelIdsToApply));
    const currentSpreadCards = spreadCardsRef.current;
    const targetCards = currentSpreadCards.filter((card) =>
      bulkSelectedCardIds.includes(card.id),
    );

    if (targetCards.length === 0) {
      toast.error("Please select cards first");
      return false;
    }

    if (normalizedLabelIds.length === 0) {
      toast.error("Please select labels first");
      return false;
    }

    const buildNextLabels = (card: SpreadCard) =>
      Array.from(new Set([...(card.labels || []), ...normalizedLabelIds]));
    const nextLabelsByCardId = new Map(
      targetCards.map((card) => [card.id, buildNextLabels(card)]),
    );
    const previousLabelsByCardId = new Map(
      targetCards.map((card) => [card.id, card.labels || []]),
    );

    const nextSpreadCards = currentSpreadCards.map((card) =>
        nextLabelsByCardId.has(card.id)
          ? { ...card, labels: nextLabelsByCardId.get(card.id) || [] }
          : card,
    );
    spreadCardsRef.current = nextSpreadCards;
    setSpreadCards(nextSpreadCards);
    persistWorkingCanvasState({ spreadCards: nextSpreadCards });

    if (db) {
      const updatedAt = new Date().toISOString();
      void Promise.allSettled(
        targetCards.map((card) =>
          updateDoc(doc(db, `canvases/${workingCanvasId}/cards`, card.id), {
            labels: nextLabelsByCardId.get(card.id) || [],
            updatedAt,
          }),
        ),
      ).then((results) => {
        const failedCardIds = results
          .map((result, index) =>
            result.status === "rejected" ? targetCards[index]?.id : null,
          )
          .filter(Boolean) as string[];
        if (failedCardIds.length === 0) return;

        const revertedSpreadCards = spreadCardsRef.current.map((card) => {
            const failedLabels = nextLabelsByCardId.get(card.id);
            const previousLabels = previousLabelsByCardId.get(card.id);
            if (
              !failedLabels ||
              !previousLabels ||
              !areStringArraysEqual(card.labels || [], failedLabels)
            )
              return card;

            return { ...card, labels: previousLabels };
          });
        spreadCardsRef.current = revertedSpreadCards;
        setSpreadCards(revertedSpreadCards);
        persistWorkingCanvasState({ spreadCards: revertedSpreadCards });
        const firstFailedResult = results.find(
          (result) => result.status === "rejected",
        );
        handleSupabaseError(
          firstFailedResult?.status === "rejected"
            ? firstFailedResult.reason
            : new Error("Failed to save labels"),
          OperationType.WRITE,
          `canvases/${workingCanvasId}/cards`,
        );
      });
    }

    return true;
  };

  const createLabelGroupFromCanvas = async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const existingGroup = labelGroups.find(
      (group) =>
        group.name.trim().toLocaleLowerCase() ===
        trimmedName.toLocaleLowerCase(),
    );
    if (existingGroup) {
      return existingGroup.id;
    }

    const id = crypto.randomUUID();
    const newGroup: LabelGroup = {
      id,
      name: trimmedName,
      sortOrder: labelGroups.length,
    };

    setLabelGroups((prev) => [...prev, newGroup]);

    if (!db) {
      return id;
    }

    void (async () => {
      const version = createMasterDataVersion();
      const batch = writeBatch(db);
      batch.set(doc(db, "label_groups", id), {
        ...newGroup,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      writeMasterDataMarker({ batch, db }, version);
      await batch.commit();
      onMasterDataWritten(version);
    })().catch((error) => {
      setLabelGroups((prev) => prev.filter((group) => group.id !== id));
      handleSupabaseError(error, OperationType.WRITE, `label_groups/${id}`);
    });

    return id;
  };

  const createLabelAndApplyFromCanvas = async (
    name: string,
    groupId: string,
  ) => {
    const trimmedName = name.trim();
    if (!trimmedName || !groupId) return;

    const group = labelGroups.find((item) => item.id === groupId);
    if (!group) {
      toast.error("Please create or select a label group first");
      return;
    }

    const existingLabel = labels.find(
      (label) =>
        label.groupId === groupId &&
        label.name.trim().toLocaleLowerCase() ===
          trimmedName.toLocaleLowerCase(),
    );
    if (existingLabel) {
      setBulkSelectedLabelIds((prev) =>
        prev.includes(existingLabel.id) ? prev : [...prev, existingLabel.id],
      );
      if (bulkSelectedCardIds.length > 0) {
        void applyLabelsToSelectedCards(
          [existingLabel.id],
          "Existing label applied to selected cards",
        );
      }
      return;
    }

    const id = crypto.randomUUID();
    const labelsInGroup = labels.filter((label) => label.groupId === groupId);
    const newLabel: Label = {
      id,
      name: trimmedName,
      groupId,
      sortOrder: labelsInGroup.length,
    };

    setLabels((prev) => [...prev, newLabel]);
    setBulkSelectedLabelIds((prev) =>
      prev.includes(id) ? prev : [...prev, id],
    );
    if (bulkSelectedCardIds.length > 0) {
      void applyLabelsToSelectedCards(
        [id],
        "Label created and applied to selected cards",
      );
    }

    if (db) {
      void (async () => {
        const version = createMasterDataVersion();
        const batch = writeBatch(db);
        batch.set(doc(db, "labels", id), {
          ...newLabel,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        writeMasterDataMarker({ batch, db }, version);
        await batch.commit();
        onMasterDataWritten(version);
      })().catch((error) => {
        setLabels((prev) => prev.filter((label) => label.id !== id));
        setBulkSelectedLabelIds((prev) =>
          prev.filter((labelId) => labelId !== id),
        );
        const nextSpreadCards = spreadCardsRef.current.map((card) =>
            card.labels?.includes(id)
              ? {
                  ...card,
                  labels: card.labels.filter((labelId) => labelId !== id),
                }
              : card,
        );
        spreadCardsRef.current = nextSpreadCards;
        setSpreadCards(nextSpreadCards);
        persistWorkingCanvasState({ spreadCards: nextSpreadCards });
        handleSupabaseError(error, OperationType.WRITE, `labels/${id}`);
      });
    }
  };

  const handleAddCardToSpread = async (
    cardId: string,
    x: number,
    y: number,
    sourceDeckIndex?: number,
  ) => {
    if (!db || !supabase) {
      toast.error("Supabase connection is required to draw a card");
      return;
    }

    const id = crypto.randomUUID();
    const sourceDeckType = deckType;
    const cardData = activeCards.find((c) => c.id === cardId);
    if (!cardData) return;
    const previousSpreadCards = spreadCardsRef.current;
    const previousDeckStates = deckStatesRef.current;
    const endCanvasMutation = beginCanvasMutation();

    const newSpreadCard: any = {
      id,
      cardId,
      deckType: sourceDeckType,
      x,
      y,
      labels: [],
      isReversed: false,
      polarity: null,
      drawSequence: previousSpreadCards.length + 1,
      placedSequence: previousSpreadCards.length + 1,
    };

    if (sourceDeckIndex !== undefined) {
      newSpreadCard.sourceDeckIndex = sourceDeckIndex;
    }

    const optimisticSpreadCards = [...previousSpreadCards, newSpreadCard];
    let optimisticDeckStates = previousDeckStates;
    if (sourceDeckIndex !== undefined) {
      deckLoadVersionRef.current[sourceDeckType] += 1;
      optimisticDeckStates = removeCardFromDeckStates(
        previousDeckStates,
        sourceDeckType,
        sourceDeckIndex,
        cardId,
      );
      deckStatesRef.current = optimisticDeckStates;
      setDeckStates(optimisticDeckStates);
    }
    spreadCardsRef.current = optimisticSpreadCards;
    setSpreadCards(optimisticSpreadCards);
    persistWorkingCanvasState({
      spreadCards: optimisticSpreadCards,
      deckStates: optimisticDeckStates,
    });

    try {
      const { data, error } = await supabase.rpc(
        "draw_card_to_working_canvas",
        {
          p_spread_card_id: id,
          p_card_id: cardId,
          p_deck_type: sourceDeckType,
          p_source_deck_index: sourceDeckIndex ?? null,
          p_x: x,
          p_y: y,
        },
      );
      if (error) throw error;

      const drawnCard = (data || newSpreadCard) as DrawCardRpcResult;
      const nextCard = {
        ...newSpreadCard,
        ...drawnCard,
      };
      const syncedSpreadCards = spreadCardsRef.current.some(
        (spreadCard) => spreadCard.id === id,
      )
        ? spreadCardsRef.current.map((spreadCard) =>
            spreadCard.id === id ? nextCard : spreadCard,
          )
        : [...spreadCardsRef.current, nextCard];
      spreadCardsRef.current = syncedSpreadCards;
      setSpreadCards(syncedSpreadCards);
      persistWorkingCanvasState({ spreadCards: syncedSpreadCards });

      try {
        const targetCards = deckCardSets[sourceDeckType];
        if (!(await ensureDeckStateFromDb(sourceDeckType, targetCards))) {
          await refreshDeckStateFromDb(sourceDeckType, targetCards);
        }
      } catch (syncError) {
        console.warn("Refresh deck state after draw failed:", syncError);
      }
    } catch (error) {
      spreadCardsRef.current = previousSpreadCards;
      deckStatesRef.current = previousDeckStates;
      setSpreadCards(previousSpreadCards);
      setDeckStates(previousDeckStates);
      persistWorkingCanvasState({
        spreadCards: previousSpreadCards,
        deckStates: previousDeckStates,
      });
      console.error("Draw card failed:", error);
      toast.error(
        isPermissionDeniedError(error)
          ? "Supabase RLS blocked drawing this card. Check local policies and grants."
          : isQuotaExceededError(error)
            ? "Supabase quota exceeded. Card was not added to DB."
            : error instanceof Error &&
                /not available|P0002/i.test(error.message)
              ? "This card is no longer available in that deck. Reset or refresh the deck."
              : "Failed to draw card",
      );
    } finally {
      endCanvasMutation();
    }
  };

  const handleUpdateCardPosition = useCallback(
    async (id: string, x: number, y: number) => {
      const card = spreadCardsRef.current.find((c) => c.id === id);
      if (!card) return;
      if (!db) {
        toast.error("Supabase connection is required to move a card");
        return;
      }

      const previousPosition = { x: card.x, y: card.y };
      const revision = positionRevisionRef.current + 1;
      positionRevisionRef.current = revision;
      pendingPositionByCardIdRef.current[id] = { x, y, revision };

      const nextSpreadCards = spreadCardsRef.current.map((spreadCard) =>
        spreadCard.id === id ? { ...spreadCard, x, y } : spreadCard,
      );
      spreadCardsRef.current = nextSpreadCards;
      setSpreadCards(nextSpreadCards);
      persistWorkingCanvasState({ spreadCards: nextSpreadCards });

      try {
        await updateDoc(doc(db, `canvases/${workingCanvasId}/cards`, id), {
          x,
          y,
          updatedAt: new Date().toISOString(),
        });
        const pending = pendingPositionByCardIdRef.current[id];
        if (pending?.revision === revision) {
          delete pendingPositionByCardIdRef.current[id];
        }
      } catch (error) {
        const pending = pendingPositionByCardIdRef.current[id];
        if (pending?.revision !== revision) return;

        delete pendingPositionByCardIdRef.current[id];
        const revertedSpreadCards = spreadCardsRef.current.map((spreadCard) =>
            spreadCard.id === id && spreadCard.x === x && spreadCard.y === y
              ? {
                  ...spreadCard,
                  x: previousPosition.x,
                  y: previousPosition.y,
                }
              : spreadCard,
        );
        spreadCardsRef.current = revertedSpreadCards;
        setSpreadCards(revertedSpreadCards);
        persistWorkingCanvasState({ spreadCards: revertedSpreadCards });
        console.error("Update position failed:", error);
        toast.error(
          isQuotaExceededError(error)
            ? "Supabase quota exceeded. Card position was not saved."
            : "Failed to save card position",
        );
      }
    },
    [persistWorkingCanvasState, setSpreadCards, workingCanvasId],
  );

  const persistRemoveCardWithTableWrites = useCallback(
    async (cardToRemove: SpreadCard) => {
      if (!supabase) {
        throw new Error("Supabase client is not available.");
      }

      const updatedAt = new Date().toISOString();
      const { error: deleteCardError } = await supabase
        .from("canvas_cards")
        .delete()
        .eq("canvas_id", workingCanvasId)
        .eq("id", cardToRemove.id);
      if (deleteCardError) throw deleteCardError;

      if (cardToRemove.sourceDeckIndex !== undefined) {
        const sourceDeckType = getSpreadCardDeckType(cardToRemove);
        const deckId = `deck-${cardToRemove.sourceDeckIndex + 1}`;
        const { error: returnDeckCardError } = await supabase
          .from("random_deck_cards")
          .update({
            current_location: "deck",
            draw_sequence: null,
            updated_at: updatedAt,
          })
          .eq("deck_type", sourceDeckType)
          .eq("deck_id", deckId)
          .eq("source_card_id", cardToRemove.cardId);
        if (returnDeckCardError) throw returnDeckCardError;

        const { count: remainingCards, error: countDeckCardsError } =
          await supabase
            .from("random_deck_cards")
            .select("id", { count: "exact", head: true })
            .eq("deck_type", sourceDeckType)
            .eq("deck_id", deckId)
            .eq("current_location", "deck");
        if (countDeckCardsError) throw countDeckCardsError;

        const { error: updateDeckError } = await supabase
          .from("random_decks")
          .update({
            remaining_cards: remainingCards ?? 0,
            updated_at: updatedAt,
          })
          .eq("deck_type", sourceDeckType)
          .eq("id", deckId);
        if (updateDeckError) throw updateDeckError;
      }

      const { count: cardCount, error: countCanvasCardsError } = await supabase
        .from("canvas_cards")
        .select("id", { count: "exact", head: true })
        .eq("canvas_id", workingCanvasId);
      if (countCanvasCardsError) throw countCanvasCardsError;

      const { error: updateCanvasError } = await supabase
        .from("canvases")
        .update({
          card_count: cardCount ?? 0,
          updated_at: updatedAt,
        })
        .eq("id", workingCanvasId);
      if (updateCanvasError) throw updateCanvasError;
    },
    [workingCanvasId],
  );

  const handleRemoveCard = useCallback(
    async (id: string) => {
      const cardToRemove = spreadCardsRef.current.find((c) => c.id === id);
      if (!cardToRemove) return;
      if (!db || !supabase) {
        toast.error("Supabase connection is required to remove a card");
        return;
      }

      const previousSpreadCards = spreadCardsRef.current;
      const sourceDeckType = getSpreadCardDeckType(cardToRemove);
      const sourceCard = allCards.find(
        (c) => c.id === cardToRemove.cardId && c.deckType === sourceDeckType,
      );
      const endCanvasMutation = beginCanvasMutation();

      const previousDeckStates = deckStatesRef.current;
      const nextSpreadCards = previousSpreadCards.filter(
        (card) => card.id !== id,
      );
      let nextDeckStates = previousDeckStates;

      if (cardToRemove.sourceDeckIndex !== undefined && sourceCard) {
        deckLoadVersionRef.current[sourceDeckType] += 1;
        nextDeckStates = returnCardToDeckStates(
          previousDeckStates,
          sourceDeckType,
          cardToRemove.sourceDeckIndex,
          sourceCard,
        );
        deckStatesRef.current = nextDeckStates;
        setDeckStates(nextDeckStates);
      }
      spreadCardsRef.current = nextSpreadCards;
      setSpreadCards(nextSpreadCards);
      persistWorkingCanvasState({
        spreadCards: nextSpreadCards,
        deckStates: nextDeckStates,
      });

      try {
        const { error } = await supabase.rpc(
          "remove_card_from_working_canvas",
          {
            p_spread_card_id: id,
          },
        );
        if (error) {
          if (isMissingRpcFunctionError(error)) {
            await persistRemoveCardWithTableWrites(cardToRemove);
          } else {
            throw error;
          }
        }

        if (cardToRemove.sourceDeckIndex !== undefined) {
          try {
            const targetCards = deckCardSets[sourceDeckType];
            if (!(await ensureDeckStateFromDb(sourceDeckType, targetCards))) {
              await refreshDeckStateFromDb(sourceDeckType, targetCards);
            }
          } catch (syncError) {
            console.warn("Refresh deck state after remove failed:", syncError);
          }
        }
      } catch (error) {
        spreadCardsRef.current = previousSpreadCards;
        deckStatesRef.current = previousDeckStates;
        setSpreadCards(previousSpreadCards);
        setDeckStates(previousDeckStates);
        persistWorkingCanvasState({
          spreadCards: previousSpreadCards,
          deckStates: previousDeckStates,
        });
        console.error("Remove card failed:", error);
        toast.error(
          isQuotaExceededError(error)
            ? "Supabase quota exceeded. Card was not removed from DB."
            : "Remove card failed",
        );
        return;
      } finally {
        endCanvasMutation();
      }
    },
    [
      allCards,
      beginCanvasMutation,
      deckCardSets,
      ensureDeckStateFromDb,
      persistRemoveCardWithTableWrites,
      persistWorkingCanvasState,
      refreshDeckStateFromDb,
      setSpreadCards,
    ],
  );

  const handleUpdateCardLabels = useCallback(
    (id: string, labelIds: string[]) => {
      const card = spreadCardsRef.current.find((c) => c.id === id);
      if (!card) return;
      const previousLabels = card.labels || [];
      const nextLabels = Array.from(new Set(labelIds));

      const nextSpreadCards = spreadCardsRef.current.map((spreadCard) =>
        spreadCard.id === id ? { ...spreadCard, labels: nextLabels } : spreadCard,
      );
      spreadCardsRef.current = nextSpreadCards;
      setSpreadCards(nextSpreadCards);
      persistWorkingCanvasState({ spreadCards: nextSpreadCards });

      if (!db) return;

      void updateDoc(doc(db, `canvases/${workingCanvasId}/cards`, id), {
        labels: nextLabels,
        updatedAt: new Date().toISOString(),
      }).catch((error) => {
        const revertedSpreadCards = spreadCardsRef.current.map((spreadCard) =>
            spreadCard.id === id &&
            areStringArraysEqual(spreadCard.labels || [], nextLabels)
              ? { ...spreadCard, labels: previousLabels }
              : spreadCard,
        );
        spreadCardsRef.current = revertedSpreadCards;
        setSpreadCards(revertedSpreadCards);
        persistWorkingCanvasState({ spreadCards: revertedSpreadCards });
        console.error("Update labels failed:", error);
        toast.error("Failed to save labels");
      });
    },
    [persistWorkingCanvasState, setSpreadCards, workingCanvasId],
  );

  const handleUpdateCardState = useCallback(
    (
      id: string,
      updates: { isReversed?: boolean; polarity?: IChingPolarity },
    ) => {
      const card = spreadCardsRef.current.find((c) => c.id === id);
      if (!card) return;
      const previousUpdates: {
        isReversed?: boolean;
        polarity?: IChingPolarity;
      } = {};
      if ("isReversed" in updates) {
        previousUpdates.isReversed = card.isReversed ?? false;
      }
      if ("polarity" in updates) {
        previousUpdates.polarity = card.polarity ?? null;
      }

      const nextSpreadCards = spreadCardsRef.current.map((spreadCard) =>
        spreadCard.id === id ? { ...spreadCard, ...updates } : spreadCard,
      );
      spreadCardsRef.current = nextSpreadCards;
      setSpreadCards(nextSpreadCards);
      persistWorkingCanvasState({ spreadCards: nextSpreadCards });

      if (!db) return;

      void updateDoc(doc(db, `canvases/${workingCanvasId}/cards`, id), {
        ...updates,
        updatedAt: new Date().toISOString(),
      }).catch((error) => {
        const revertedSpreadCards = spreadCardsRef.current.map((spreadCard) => {
            const stillAtOptimisticState = Object.entries(updates).every(
              ([key, value]) => spreadCard[key as keyof SpreadCard] === value,
            );
            return spreadCard.id === id && stillAtOptimisticState
              ? { ...spreadCard, ...previousUpdates }
              : spreadCard;
          });
        spreadCardsRef.current = revertedSpreadCards;
        setSpreadCards(revertedSpreadCards);
        persistWorkingCanvasState({ spreadCards: revertedSpreadCards });
        console.error("Update card state failed:", error);
        toast.error("Failed to save card state");
      });
    },
    [persistWorkingCanvasState, setSpreadCards, workingCanvasId],
  );

  const handleShuffle = async () => {
    if (!db) return;

    try {
      if (!supabase) {
        throw new Error("Supabase client is not available.");
      }

      const { data, error } = await supabase.rpc("shuffle_random_decks", {
        p_deck_type: deckType,
      });
      if (error) throw error;

      const result = (data || {}) as ShuffleRpcResult;
      if (applyDeckRpcResult(deckType, result, activeCards)) {
        persistWorkingCanvasState();
      } else {
        await refreshDeckStateFromDb(deckType, activeCards);
      }
    } catch (err) {
      console.error("Shuffle failed:", err);
      toast.error(
        isQuotaExceededError(err)
          ? "Supabase quota exceeded. Decks were not shuffled in DB."
          : "Failed to shuffle decks",
      );
    }
  };

  const updateDeckCount = async (newCount: number) => {
    if (!db || !supabase) {
      toast.error("Supabase connection is required to change deck count");
      return;
    }
    if (newCount === deckCount) return;

    const previousDeckStates = deckStatesRef.current;
    const nextDeckCount = Math.max(1, Math.min(newCount, 10));
    const targetState = previousDeckStates[deckType];
    const nextRandomDecks =
      nextDeckCount > deckCount
        ? [
            ...targetState.randomDecks,
            ...Array.from({ length: nextDeckCount - deckCount }, () => [
              ...activeCards,
            ]),
          ]
        : targetState.randomDecks.slice(0, nextDeckCount);
    const nextDeckStates = {
      ...previousDeckStates,
      [deckType]: {
        deckCount: nextDeckCount,
        randomDecks: nextRandomDecks,
      },
    };
    deckStatesRef.current = nextDeckStates;
    setDeckStates(nextDeckStates);
    persistWorkingCanvasState({ deckStates: nextDeckStates });

    try {
      const { data, error } = await supabase.rpc("set_random_deck_count", {
        p_deck_type: deckType,
        p_cards: buildDeckRpcPayload(activeCards),
        p_deck_count: nextDeckCount,
      });
      if (error) throw error;

      if (applyDeckRpcResult(deckType, data, activeCards)) {
        persistWorkingCanvasState();
      } else {
        await refreshDeckStateFromDb(deckType, activeCards);
      }
    } catch (err) {
      deckStatesRef.current = previousDeckStates;
      setDeckStates(previousDeckStates);
      persistWorkingCanvasState({ deckStates: previousDeckStates });
      console.error("Update deck count failed:", err);
      toast.error("Failed to change deck count");
    }
  };

  const selectedSpreadCard = selectedCardId
    ? spreadCards.find((c) => c.id === selectedCardId)
    : undefined;
  const selectedDeckCard = selectedSpreadCard
    ? allCards.find((c) => c.id === selectedSpreadCard.cardId)
    : undefined;

  return (
    <div className="h-full flex flex-col relative overflow-hidden bg-[#f8f9fa]">
      {/* Top Right Buttons */}
      <div className="absolute top-6 right-6 z-40 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAutoDrawDialog(true)}
          className="bg-white/90 backdrop-blur-md border-[#e2e8f0] rounded-xl shadow-lg shadow-black/5 font-bold text-xs uppercase tracking-wider gap-2 h-10 px-4 hover:bg-[#166db0] hover:text-white hover:border-[#166db0] transition-all"
        >
          <WandSparkles className="w-4 h-4" />
          Auto-Draw
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleNotePanel}
          className="bg-white/90 backdrop-blur-md border-[#e2e8f0] rounded-xl shadow-lg shadow-black/5 font-bold text-xs uppercase tracking-wider gap-2 h-10 px-4 hover:bg-[#166db0] hover:text-white hover:border-[#166db0] transition-all"
        >
          <FileText className="w-4 h-4" />
          Note
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowInfo(true)}
          className="bg-white/90 backdrop-blur-md border-[#e2e8f0] rounded-xl shadow-lg shadow-black/5 font-bold text-xs uppercase tracking-wider gap-2 h-10 px-4 hover:bg-[#166db0] hover:text-white hover:border-[#166db0] transition-all"
        >
          <Info className="w-4 h-4" />
          Info
        </Button>
        <Button
          size="sm"
          onClick={openSaveDialog}
          className="bg-[#166db0] hover:bg-[#0e4a77] text-white rounded-xl shadow-lg shadow-[#166db0]/20 font-bold text-xs uppercase tracking-wider gap-2 h-10 px-4 transition-all"
        >
          <Save className="w-4 h-4" />
          Save Canvas
        </Button>
      </div>

      {/* Control Buttons - Bottom Right */}
      <div className="absolute bottom-8 right-8 z-40 flex flex-col items-end gap-3">
        <div className="bg-white/90 backdrop-blur-md border border-[#e2e8f0] p-2 rounded-2xl flex items-center gap-2 shadow-2xl shadow-black/10">
          <Button
            id="reset-button"
            variant="ghost"
            size="icon"
            onClick={handleReset}
            className="h-10 w-10 rounded-xl hover:bg-red-50 text-red-500 transition-all active:scale-95"
            title="Reset Canvas"
          >
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>
        <div className="bg-white/80 backdrop-blur-sm border border-[#e2e8f0] px-3 py-1.5 rounded-full shadow-sm">
          <span className="text-[12px] font-bold text-[#495360] uppercase tracking-widest">
            Zoom: {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Main Drawing Area */}
      <div className="flex-1 relative flex min-h-0">
        {/* Left Sidebar - Deck Area */}
        <DeckArea
          cards={activeCards}
          deckType={deckType}
          onDeckTypeChange={setDeckType}
          mode={deckMode}
          onModeChange={setDeckMode}
          onDraw={handleAddCardToSpread}
          randomDecks={randomDecks}
          deckCount={deckCount}
          onShuffle={handleShuffle}
          onUpdateDeckCount={updateDeckCount}
        />

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            data-bulk-label-trigger="true"
            onClick={() => {
              if (isBulkLabelPanelOpen) closeBulkLabelPanel();
              else openBulkLabelPanel();
            }}
            className={`absolute left-5 top-5 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 shadow-xl shadow-black/20 backdrop-blur-md transition-colors ${
              isBulkLabelPanelOpen
                ? "bg-[#166db0] text-white"
                : "bg-white/90 text-[#166db0] hover:bg-white"
            }`}
            title="Bulk labels"
            aria-label="Open bulk labels"
          >
            <Tag className="h-5 w-5" />
          </button>

          {/* Spread Canvas */}
          <SpreadCanvas
            spreadCards={spreadCards}
            cards={allCards}
            labels={labels}
            labelGroups={labelGroups}
            onUpdatePosition={handleUpdateCardPosition}
            onSelectCard={handleSelectCard}
            onUpdateLabels={handleUpdateCardLabels}
            onUpdateCardState={handleUpdateCardState}
            onRemoveCard={handleRemoveCard}
            selectedCardIds={bulkSelectedCardIds}
            onToggleCardSelection={toggleBulkCardSelection}
            zoom={zoom}
            onZoomChange={setZoom}
            offset={canvasOffset}
            onOffsetChange={setCanvasOffset}
          />

          {isBulkLabelPanelOpen && (
            <BulkLabelPanel
              selectedCardCount={bulkSelectedCardIds.length}
              labels={labels}
              labelGroups={labelGroups}
              selectedLabelIds={bulkSelectedLabelIds}
              isSaving={isBulkLabelSaving}
              position={bulkLabelPanelPosition}
              onPositionChange={setBulkLabelPanelPosition}
              onToggleLabel={toggleBulkLabelSelection}
              onClose={closeBulkLabelPanel}
              onClearLabels={() => setBulkSelectedLabelIds([])}
              onSave={() => void applyLabelsToSelectedCards()}
              onCreateGroup={createLabelGroupFromCanvas}
              onCreateLabelAndApply={createLabelAndApplyFromCanvas}
            />
          )}

          {isNotePanelOpen && (
            <section className="absolute right-5 top-20 bottom-5 z-40 flex w-[min(690px,calc(100%-2.5rem))] flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-md">
              <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e2e8f0] px-4">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-extrabold uppercase tracking-wider text-[#0f172a]">
                    Canvas Note
                  </h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleNotePrimaryAction}
                    disabled={isSavingNote}
                    className="h-8 rounded-xl bg-[#166db0] px-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#0e4a77]"
                  >
                    {isSavingNote ? "Saving" : isNoteEditing ? "Save" : "Edit"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsNotePanelOpen(false)}
                    className="h-8 rounded-xl px-3 text-xs font-bold uppercase tracking-wider"
                  >
                    Close
                  </Button>
                </div>
              </header>
              <div className="min-h-0 flex-1 bg-white p-3">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-xs font-bold uppercase tracking-widest text-[#64748b]">
                      Loading editor
                    </div>
                  }
                >
                  <CanvasNoteEditor
                    markdown={canvasNoteDraft}
                    readOnly={!isNoteEditing || isSavingNote}
                    onChange={handleCanvasNoteChange}
                  />
                </Suspense>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Detail Popup */}
      {selectedSpreadCard && selectedDeckCard && (
        <CardDetailPopup
          spreadCard={selectedSpreadCard}
          card={selectedDeckCard}
          onUpdateCard={
            selectedDeckCard.deckType === "iching"
              ? handleUpdateCard
              : undefined
          }
          onClose={() => setSelectedCardId(null)}
        />
      )}

      <AutoDrawDialog
        open={showAutoDrawDialog}
        isGenerating={isAutoDrawing}
        onOpenChange={setShowAutoDrawDialog}
        onGenerate={handleAutoDrawCanvas}
      />

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Canvas</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear the canvas and reset iChing and
              Tarot decks to 3 ordered decks each? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetConfirm(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={executeReset}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent
          className="max-w-2xl w-[min(92vw,42rem)] h-[80vh] max-h-[80vh] overflow-hidden p-0 flex flex-col"
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 !flex !h-[67px] !flex-row !items-center !justify-between space-y-0 border-b border-[#e2e8f0] px-6 py-0">
            <DialogTitle className="min-w-0 flex-1 pr-4 text-xl font-extrabold leading-none text-[#0f172a]">
              Canvas Information
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={copyInfo}
              className="h-8 shrink-0 self-center rounded-xl px-3 font-bold text-xs uppercase tracking-wider"
            >
              <Copy className="w-4 h-4" />
              Copy
            </Button>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 px-6 pt-[5px] pb-4">
            <div className="space-y-4 pb-2 pr-4">
              {spreadCards.map((sc, index) => {
                const card = allCards.find((c) => c.id === sc.cardId);
                const cardLabels = sc.labels
                  .map((lId) => labels.find((l) => l.id === lId)?.name)
                  .filter(Boolean);
                return (
                  <div
                    key={sc.id}
                    className="relative w-[335px] min-w-[335px] max-w-[335px] rounded-2xl border border-[#e2e8f0] bg-[#f8f9fa] px-4 py-3.5 pr-14 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                  >
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-[#166db0] text-[12.5px] font-extrabold text-white shadow-sm ring-2 ring-white">
                      {index + 1}
                    </span>

                    <div className="min-w-0 pt-px">
                      <h4 className="max-w-full break-words pr-1 text-[14.5px] font-bold leading-[1.35] text-[#0f172a] text-pretty">
                        {card?.vietnameseName} ({card?.number})
                      </h4>
                      <p className="mt-[3px] max-w-full break-words pr-1 text-[12.5px] font-medium leading-[1.45] text-[#495360] text-pretty">
                        {card?.englishName}
                      </p>
                    </div>

                    {cardLabels.length > 0 && (
                      <div className="mt-[11px] flex flex-wrap gap-[7px]">
                        {cardLabels.map((l, i) => (
                          <span
                            key={i}
                            className="max-w-full break-words rounded-md border border-[#e2e8f0] bg-white px-2 py-0.5 text-[12px] font-bold text-[#495360]"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {spreadCards.length === 0 && (
                <div className="py-12 text-center text-[#94a3b8]">
                  <p className="text-sm font-bold uppercase tracking-widest">
                    No cards on canvas
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={handleSaveDialogOpenChange}>
        <DialogContent>
          <form onSubmit={handleSaveCanvasSubmit}>
            <DialogHeader>
              <DialogTitle>Save Canvas</DialogTitle>
              <DialogDescription>
                Enter a name for your current canvas state to save it for later.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Canvas name (e.g. My First Spread)"
                value={canvasName}
                onChange={(e) => setCanvasName(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void handleSaveCanvas();
                  }
                }}
                className="rounded-xl"
                autoFocus
              />
            </div>
            <button type="submit" className="sr-only">
              Save Canvas
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
