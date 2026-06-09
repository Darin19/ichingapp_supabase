import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../supabaseClient";

type AnyRecord = Record<string, any>;

type BaseRef = {
  path: string;
  segments: string[];
};

export type DocumentReference = BaseRef & {
  kind: "document";
};

export type CollectionReference = BaseRef & {
  kind: "collection";
};

type QueryConstraint =
  | { type: "orderBy"; field: string; direction: "asc" | "desc" }
  | { type: "where"; field: string; op: "=="; value: unknown };

export type QueryReference = CollectionReference & {
  constraints: QueryConstraint[];
};

type TableInfo = {
  table: string;
  constraints: AnyRecord;
  defaults: AnyRecord;
  onConflict: string;
};

type SnapshotMetadata = {
  hasPendingWrites: boolean;
};

const metadata: SnapshotMetadata = { hasPendingWrites: false };

const camelToSnakeKey: Record<string, string> = {
  addedAt: "added_at",
  appliedCanvasId: "applied_canvas_id",
  autoDrawReason: "auto_draw_reason",
  autoDrawRunId: "auto_draw_run_id",
  cardCount: "card_count",
  cardId: "card_id",
  cardLimit: "card_limit",
  content1: "content1",
  content2: "content2",
  content3: "content3",
  createdAt: "created_at",
  currentLocation: "current_location",
  deckCount: "deck_count",
  deckId: "deck_id",
  deckType: "deck_type",
  drawSequence: "draw_sequence",
  elapsedMs: "elapsed_ms",
  endpointHost: "endpoint_host",
  englishName: "english_name",
  groupId: "group_id",
  imageUrl: "image_url",
  imgPath: "img_path",
  isDefault: "is_default",
  isReversed: "is_reversed",
  matchScore: "match_score",
  noteMarkdown: "note_markdown",
  orderIndex: "order_index",
  placedSequence: "placed_sequence",
  positionLabel: "position_label",
  reasoningEffort: "reasoning_effort",
  remainingCards: "remaining_cards",
  returnedCardCount: "returned_card_count",
  sortOrder: "sort_order",
  sourceCardId: "source_card_id",
  sourceDeckIndex: "source_deck_index",
  structuredOutput: "structured_output",
  totalCards: "total_cards",
  updatedAt: "updated_at",
  vietnameseName: "vietnamese_name",
};

const snakeToCamelKey = Object.fromEntries(
  Object.entries(camelToSnakeKey).map(([camel, snake]) => [snake, camel]),
) as Record<string, string>;

const tableColumns: Record<string, Set<string>> = {
  app_cache: new Set(["id", "version", "updated_at"]),
  auto_draw_runs: new Set([
    "id",
    "scenario",
    "script",
    "model",
    "provider",
    "reasoning_effort",
    "elapsed_ms",
    "endpoint_host",
    "card_limit",
    "returned_card_count",
    "status",
    "applied_canvas_id",
    "structured_output",
    "created_at",
    "updated_at",
  ]),
  canvas_cards: new Set([
    "canvas_id",
    "id",
    "card_id",
    "deck_type",
    "x",
    "y",
    "labels",
    "is_reversed",
    "polarity",
    "uid",
    "source_deck_index",
    "draw_sequence",
    "placed_sequence",
    "auto_draw_reason",
    "position_label",
    "match_score",
    "created_at",
    "updated_at",
  ]),
  canvases: new Set([
    "id",
    "name",
    "type",
    "status",
    "card_count",
    "note_markdown",
    "scenario",
    "source",
    "auto_draw_run_id",
    "deck_count",
    "uid",
    "created_at",
    "updated_at",
  ]),
  iching_cards_master: new Set([
    "id",
    "deck_type",
    "number",
    "sort_order",
    "vietnamese_name",
    "english_name",
    "link1",
    "link2",
    "link3",
    "content1",
    "content2",
    "content3",
    "img_path",
    "image_url",
    "keywords",
    "uid",
    "created_at",
    "updated_at",
  ]),
  label_groups: new Set([
    "id",
    "name",
    "uid",
    "sort_order",
    "created_at",
    "updated_at",
  ]),
  labels: new Set([
    "id",
    "name",
    "group_id",
    "uid",
    "sort_order",
    "created_at",
    "updated_at",
  ]),
  random_deck_cards: new Set([
    "deck_type",
    "deck_id",
    "id",
    "source_card_id",
    "number",
    "current_location",
    "draw_sequence",
    "sort_order",
    "added_at",
    "updated_at",
  ]),
  random_decks: new Set([
    "deck_type",
    "id",
    "name",
    "order_index",
    "total_cards",
    "remaining_cards",
    "is_default",
    "created_at",
    "updated_at",
  ]),
};

const ensureClient = (): SupabaseClient => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
};

export const db = isSupabaseConfigured ? { provider: "supabase" } : null;

const normalizeSegments = (segments: string[]) =>
  segments.flatMap((segment) => segment.split("/").filter(Boolean));

export const collection = (_db: unknown, ...segments: string[]) => {
  const normalized = normalizeSegments(segments);
  return {
    kind: "collection",
    path: normalized.join("/"),
    segments: normalized,
  } as CollectionReference;
};

export const doc = (_db: unknown, ...segments: string[]) => {
  const normalized = normalizeSegments(segments);
  return {
    kind: "document",
    path: normalized.join("/"),
    segments: normalized,
  } as DocumentReference;
};

export const orderBy = (field: string, direction: "asc" | "desc" = "asc") =>
  ({ type: "orderBy", field, direction }) as QueryConstraint;

export const where = (field: string, op: "==", value: unknown) =>
  ({ type: "where", field, op, value }) as QueryConstraint;

export const query = (
  ref: CollectionReference,
  ...constraints: QueryConstraint[]
) =>
  ({
    ...ref,
    constraints,
  }) as QueryReference;

type IncrementValue = {
  __op: "increment";
  value: number;
};

export const increment = (value: number): IncrementValue => ({
  __op: "increment",
  value,
});

const isIncrementValue = (value: unknown): value is IncrementValue =>
  Boolean(value) &&
  typeof value === "object" &&
  (value as IncrementValue).__op === "increment";

const deckTypeFromRoot = (root: string) =>
  root === "random_decks_tarot" ? "tarot" : "iching";

const getCollectionInfo = (segments: string[]): TableInfo => {
  const [root, parentId, subcollection] = segments;

  if (root === "canvases" && subcollection === "cards") {
    return {
      table: "canvas_cards",
      constraints: { canvas_id: parentId },
      defaults: { canvas_id: parentId },
      onConflict: "canvas_id,id",
    };
  }

  if (
    (root === "random_decks" || root === "random_decks_tarot") &&
    subcollection === "cards"
  ) {
    const deckType = deckTypeFromRoot(root);
    return {
      table: "random_deck_cards",
      constraints: { deck_type: deckType, deck_id: parentId },
      defaults: { deck_type: deckType, deck_id: parentId },
      onConflict: "deck_type,deck_id,id",
    };
  }

  if (root === "random_decks" || root === "random_decks_tarot") {
    const deckType = deckTypeFromRoot(root);
    return {
      table: "random_decks",
      constraints: { deck_type: deckType },
      defaults: { deck_type: deckType },
      onConflict: "deck_type,id",
    };
  }

  return {
    table: root,
    constraints: {},
    defaults: {},
    onConflict: "id",
  };
};

const getDocumentInfo = (segments: string[]): TableInfo => {
  const id = segments[segments.length - 1];
  const collectionSegments = segments.slice(0, -1);
  const info = getCollectionInfo(collectionSegments);
  return {
    ...info,
    constraints: { ...info.constraints, id },
    defaults: { ...info.defaults, id },
  };
};

const snakeKey = (key: string) =>
  camelToSnakeKey[key] ||
  key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

const camelKey = (key: string) =>
  snakeToCamelKey[key] ||
  key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

const sanitizeForTable = (table: string, data: AnyRecord) => {
  const allowed = tableColumns[table];
  const next: AnyRecord = {};
  Object.entries(data).forEach(([key, value]) => {
    const normalizedKey = snakeKey(key);
    if (!allowed?.has(normalizedKey)) return;
    next[normalizedKey] = value;
  });
  return next;
};

const fromRow = (row: AnyRecord) => {
  const next: AnyRecord = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    next[camelKey(key)] = value;
  });
  return next;
};

const applyConstraints = (request: any, constraints: AnyRecord) => {
  let next = request;
  Object.entries(constraints).forEach(([key, value]) => {
    next = next.eq(key, value);
  });
  return next;
};

class QueryDocumentSnapshot {
  id: string;
  ref: DocumentReference;
  metadata = metadata;
  private row: AnyRecord;

  constructor(ref: DocumentReference, row: AnyRecord) {
    this.id = String(row.id);
    this.ref = ref;
    this.row = row;
  }

  data() {
    return fromRow(this.row);
  }
}

class QuerySnapshot {
  docs: QueryDocumentSnapshot[];
  metadata = metadata;

  constructor(docs: QueryDocumentSnapshot[]) {
    this.docs = docs;
  }

  get empty() {
    return this.docs.length === 0;
  }

  get size() {
    return this.docs.length;
  }

  forEach(callback: (doc: QueryDocumentSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

class DocumentSnapshot {
  id: string;
  ref: DocumentReference;
  metadata = metadata;
  private row: AnyRecord | null;

  constructor(ref: DocumentReference, row: AnyRecord | null) {
    this.id = ref.segments[ref.segments.length - 1];
    this.ref = ref;
    this.row = row;
  }

  exists() {
    return Boolean(this.row);
  }

  data() {
    return this.row ? fromRow(this.row) : undefined;
  }
}

const selectRows = async (ref: CollectionReference | QueryReference) => {
  const client = ensureClient();
  const info = getCollectionInfo(ref.segments);
  let request: any = client.from(info.table).select("*");
  request = applyConstraints(request, info.constraints);

  const constraints = "constraints" in ref ? ref.constraints : [];
  constraints.forEach((constraint) => {
    if (constraint.type === "where") {
      request = request.eq(snakeKey(constraint.field), constraint.value);
    }
  });
  constraints.forEach((constraint) => {
    if (constraint.type === "orderBy") {
      request = request.order(snakeKey(constraint.field), {
        ascending: constraint.direction !== "desc",
      });
    }
  });

  const { data, error } = await request;
  if (error) throw error;
  return (data || []) as AnyRecord[];
};

const selectDocument = async (ref: DocumentReference) => {
  const client = ensureClient();
  const info = getDocumentInfo(ref.segments);
  let request: any = client.from(info.table).select("*");
  request = applyConstraints(request, info.constraints);
  const { data, error } = await request.maybeSingle();
  if (error) throw error;
  return (data || null) as AnyRecord | null;
};

const documentRefForRow = (
  collectionRef: CollectionReference | QueryReference,
  row: AnyRecord,
) => doc(db, collectionRef.path, String(row.id));

export const getDocs = async (
  ref: CollectionReference | QueryReference | DocumentReference,
) => {
  if (ref.kind === "document") {
    const row = await selectDocument(ref);
    return new QuerySnapshot(row ? [new QueryDocumentSnapshot(ref, row)] : []);
  }

  const rows = await selectRows(ref);
  return new QuerySnapshot(
    rows.map(
      (row) => new QueryDocumentSnapshot(documentRefForRow(ref, row), row),
    ),
  );
};

const resolveIncrements = async (info: TableInfo, row: AnyRecord) => {
  const incrementKeys = Object.keys(row).filter((key) =>
    isIncrementValue(row[key]),
  );
  if (incrementKeys.length === 0) return row;

  const client = ensureClient();
  let request: any = client.from(info.table).select("*");
  request = applyConstraints(request, info.constraints);
  const { data, error } = await request.maybeSingle();
  if (error) throw error;

  const next = { ...row };
  incrementKeys.forEach((key) => {
    const currentValue = Number((data || {})[key] || 0);
    next[key] = currentValue + (row[key] as IncrementValue).value;
  });
  return next;
};

type SetOptions = {
  merge?: boolean;
};

export const setDoc = async (
  ref: DocumentReference,
  data: AnyRecord,
  options?: SetOptions,
) => {
  const client = ensureClient();
  const info = getDocumentInfo(ref.segments);
  const sanitizedRow = await resolveIncrements(info, {
    ...info.defaults,
    ...sanitizeForTable(info.table, data),
  });
  const row = options?.merge
    ? {
        ...((await selectDocument(ref)) || {}),
        ...sanitizedRow,
      }
    : sanitizedRow;
  const { error } = await client
    .from(info.table)
    .upsert(row, { onConflict: info.onConflict });
  if (error) throw error;
};

export const updateDoc = async (ref: DocumentReference, data: AnyRecord) => {
  const client = ensureClient();
  const info = getDocumentInfo(ref.segments);
  const row = await resolveIncrements(info, sanitizeForTable(info.table, data));
  if (Object.keys(row).length === 0) return;
  const { error } = await applyConstraints(
    client.from(info.table).update(row),
    info.constraints,
  );
  if (error) throw error;
};

const deleteDoc = async (ref: DocumentReference) => {
  const client = ensureClient();
  const info = getDocumentInfo(ref.segments);
  const { error } = await applyConstraints(
    client.from(info.table).delete(),
    info.constraints,
  );
  if (error) throw error;
};

type BatchOp =
  | {
      type: "set";
      ref: DocumentReference;
      data: AnyRecord;
      options?: SetOptions;
    }
  | { type: "update"; ref: DocumentReference; data: AnyRecord }
  | { type: "delete"; ref: DocumentReference };

export const writeBatch = (_db: unknown) => {
  const ops: BatchOp[] = [];
  return {
    set(ref: DocumentReference, data: AnyRecord, options?: SetOptions) {
      ops.push({ type: "set", ref, data, options });
    },
    update(ref: DocumentReference, data: AnyRecord) {
      ops.push({ type: "update", ref, data });
    },
    delete(ref: DocumentReference) {
      ops.push({ type: "delete", ref });
    },
    async commit() {
      for (const op of ops) {
        if (op.type === "set") await setDoc(op.ref, op.data, op.options);
        if (op.type === "update") await updateDoc(op.ref, op.data);
        if (op.type === "delete") await deleteDoc(op.ref);
      }
    },
  };
};

const subscribeToTable = (
  table: string,
  refresh: () => void,
  onError?: (error: unknown) => void,
) => {
  const client = ensureClient();
  const channelId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const channelName = `db-${table}-${channelId}`;
  const channel: RealtimeChannel = client
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: "public", table }, () =>
      refresh(),
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" && error) {
        onError?.(error);
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
};

export function onSnapshot(
  ref: DocumentReference,
  onNext: (snapshot: DocumentSnapshot) => void,
  onError?: (error: unknown) => void,
): () => void;
export function onSnapshot(
  ref: CollectionReference | QueryReference,
  onNext: (snapshot: QuerySnapshot) => void,
  onError?: (error: unknown) => void,
): () => void;
export function onSnapshot(
  ref: CollectionReference | QueryReference,
  options: unknown,
  onNext: (snapshot: QuerySnapshot) => void,
  onError?: (error: unknown) => void,
): () => void;
export function onSnapshot(
  ref: CollectionReference | QueryReference | DocumentReference,
  optionsOrNext: unknown,
  maybeNext?: unknown,
  maybeError?: (error: unknown) => void,
) {
  const onNext =
    typeof optionsOrNext === "function" ? optionsOrNext : maybeNext;
  const onError =
    typeof optionsOrNext === "function"
      ? (maybeNext as ((error: unknown) => void) | undefined)
      : maybeError;

  const refresh = () => {
    if (typeof onNext !== "function") return;
    if (ref.kind === "document") {
      void selectDocument(ref)
        .then((row) => onNext(new DocumentSnapshot(ref, row)))
        .catch((error) => onError?.(error));
      return;
    }

    void selectRows(ref)
      .then(
        (rows) =>
          new QuerySnapshot(
            rows.map(
              (row) =>
                new QueryDocumentSnapshot(documentRefForRow(ref, row), row),
            ),
          ),
      )
      .then((snapshot) => onNext(snapshot))
      .catch((error) => onError?.(error));
  };

  refresh();
  const info =
    ref.kind === "document"
      ? getDocumentInfo(ref.segments)
      : getCollectionInfo(ref.segments);

  return subscribeToTable(info.table, refresh, onError);
}
