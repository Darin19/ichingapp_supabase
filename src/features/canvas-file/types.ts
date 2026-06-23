import type { DeckCard, Label, LabelGroup, SpreadCard } from "../../types";

export const CANVAS_RELATION_TYPES = [
  "supports",
  "clarifies",
  "contrasts",
  "follows",
  "groups-with",
  "related",
] as const;

export type CanvasRelationType = (typeof CANVAS_RELATION_TYPES)[number];

export interface CanvasFileMetadata {
  name: string;
  description?: string;
  sourceScript?: string;
  noteMarkdown?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasFileMasterGroup {
  id?: string;
  name: string;
}

export interface CanvasFileCustomGroup {
  id: string;
  name: string;
}

export interface CanvasFileMasterLabel {
  id: string;
  source: "master";
  name: string;
  group: CanvasFileMasterGroup;
  description?: string;
}

export interface CanvasFileCustomLabel {
  id: string;
  source: "custom";
  name: string;
  group: CanvasFileCustomGroup;
  description?: string;
}

export type CanvasFileLabel = CanvasFileMasterLabel | CanvasFileCustomLabel;

interface CanvasFileNodeBase {
  id: string;
  cardId: string;
  cardNumber: number;
  displayName: string;
  position: { x: number; y: number };
  order: number;
  labelIds: string[];
}

export interface CanvasFileTarotNode extends CanvasFileNodeBase {
  type: "tarot";
  state: "upright" | "reversed";
}

export interface CanvasFileIChingNode extends CanvasFileNodeBase {
  type: "iching";
  state: "positive" | "neutral" | "negative";
}

export type CanvasFileNode = CanvasFileTarotNode | CanvasFileIChingNode;

export interface CanvasRelation {
  id: string;
  type: CanvasRelationType;
  from: string;
  to: string;
  label?: string;
}

export interface CanvasFileV1 {
  format: "iching-canvas";
  schemaVersion: "1.0.0";
  metadata: CanvasFileMetadata;
  labels: CanvasFileLabel[];
  nodes: CanvasFileNode[];
  relations: CanvasRelation[];
  extensions: Record<string, unknown>;
}

export interface CanvasFileMasterData {
  cards: DeckCard[];
  labels: Label[];
  labelGroups: LabelGroup[];
}

export interface ImportPlanCounts {
  cards: number;
  masterLabels: number;
  customLabels: number;
  relations: number;
}

export interface ImportPlan {
  spreadCards: SpreadCard[];
  metadata: CanvasFileMetadata;
  customLabels: CanvasFileCustomLabel[];
  relations: CanvasRelation[];
  extensions: Record<string, unknown>;
  warnings: string[];
  counts: ImportPlanCounts;
}

export interface CreateCanvasFileInput extends CanvasFileMasterData {
  metadata: CanvasFileMetadata;
  spreadCards: SpreadCard[];
  customLabels?: CanvasFileCustomLabel[];
  relations?: CanvasRelation[];
  extensions?: Record<string, unknown>;
}

export interface CanvasFileStoredMetadata {
  schemaVersion: "1.0.0";
  name: string;
  description: string;
  sourceScript: string;
  createdAt: string;
  customLabels: CanvasFileCustomLabel[];
  relations: CanvasRelation[];
  extensions: Record<string, unknown>;
}
