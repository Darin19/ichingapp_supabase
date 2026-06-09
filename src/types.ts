export type DeckType = "iching" | "tarot";
export type IChingPolarity = "positive" | "negative" | null;
export type CanvasSource = "manual" | "auto-draw";

export interface DeckCard {
  id: string;
  deckType: DeckType;
  number: number;
  sortOrder?: number;
  vietnameseName: string;
  englishName: string;
  link1?: string;
  link2?: string;
  link3?: string;
  content1?: string;
  content2?: string;
  content3?: string;
  imgPath: string;
  imageUrl?: string;
  keywords?: string;
}

export interface IChingCard extends DeckCard {
  deckType: "iching";
  link1: string;
  link2: string;
  link3: string;
  content1: string;
  content2: string;
  content3: string;
}

export interface TarotCard extends DeckCard {
  deckType: "tarot";
  imageUrl: string;
  fileName: string;
}

export interface Label {
  id: string;
  name: string;
  groupId: string;
  uid?: string;
  sortOrder?: number;
}

export interface LabelGroup {
  id: string;
  name: string;
  uid?: string;
  sortOrder?: number;
}

export interface MasterDataSnapshot {
  version: string;
  cards: IChingCard[];
  labelGroups: LabelGroup[];
  labels: Label[];
}

export interface SpreadCard {
  id: string;
  cardId: string;
  deckType?: DeckType;
  x: number;
  y: number;
  labels: string[]; // Array of label IDs
  isReversed?: boolean;
  polarity?: IChingPolarity;
  uid?: string;
  sourceDeckIndex?: number; // Index of the random deck it was drawn from
  drawSequence?: number;
  placedSequence?: number;
  autoDrawReason?: string;
  positionLabel?: string;
  matchScore?: number;
}

export type DeckMode = "random" | "order";

export interface CanvasMetadata {
  noteMarkdown?: string;
  scenario?: string;
  source?: CanvasSource;
  autoDrawRunId?: string;
  cardCount?: number;
  type?: "working" | "saved";
  status?: string;
  updatedAt?: string;
}

export interface SavedCanvas extends CanvasMetadata {
  id: string;
  name: string;
  spreadCards: SpreadCard[];
  randomDecks?: DeckCard[][];
  deckCount?: number;
  createdAt: string;
  uid?: string;
}
