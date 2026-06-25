import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schemaText from "../../../docs/canvas-file-v1/canvas-file-v1.schema.json?raw";
import type { DeckCard, Label, LabelGroup, SpreadCard } from "../../types";
import type {
  CanvasFileCustomLabel,
  CanvasFileLabel,
  CanvasFileMasterData,
  CanvasFileMetadata,
  CanvasFileNode,
  CanvasFileV1,
  CreateCanvasFileInput,
  ImportPlan,
} from "./types";

export const CANVAS_FILE_MAX_BYTES = 5 * 1024 * 1024;

const ajv = new Ajv2020({ allErrors: true, strict: false, useDefaults: true });
addFormats(ajv);
const validateSchema = ajv.compile<CanvasFileV1>(JSON.parse(schemaText));

export class CanvasFileValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join("\n"));
    this.name = "CanvasFileValidationError";
    this.issues = issues;
  }
}

const hasTextValue = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const formatCanvasFileError = (error: unknown): string => {
  if (error instanceof CanvasFileValidationError) {
    return error.issues.join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts: string[] = [];
    if (hasTextValue(record.code)) parts.push(record.code);
    if (hasTextValue(record.message)) parts.push(record.message);
    if (hasTextValue(record.details)) parts.push(record.details);
    if (hasTextValue(record.hint)) parts.push(`Hint: ${record.hint}`);
    if (parts.length) return parts.join("\n");
  }

  if (hasTextValue(error)) return error;
  return "Import failed";
};

const clone = <T>(value: T): T => structuredClone(value);

const normalizeText = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("vi");

const formatAjvError = (error: ErrorObject): string => {
  const path = error.instancePath || "/";
  if (error.keyword === "additionalProperties") {
    return `${path}: không chấp nhận trường ${(error.params as { additionalProperty: string }).additionalProperty}`;
  }
  return `${path}: ${error.message ?? "không hợp lệ"}`;
};

const duplicateValues = (
  values: Array<string | number>,
): Array<string | number> => {
  const seen = new Set<string | number>();
  const duplicates = new Set<string | number>();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
};

const validateSemantics = (file: CanvasFileV1): string[] => {
  const issues: string[] = [];
  const duplicateLabelIds = duplicateValues(
    file.labels.map((label) => label.id),
  );
  const duplicateNodeIds = duplicateValues(file.nodes.map((node) => node.id));
  const duplicateOrders = duplicateValues(file.nodes.map((node) => node.order));
  const duplicateRelationIds = duplicateValues(
    file.relations.map((relation) => relation.id),
  );

  if (duplicateLabelIds.length) {
    issues.push(`labels: ID bị trùng (${duplicateLabelIds.join(", ")})`);
  }
  if (duplicateNodeIds.length) {
    issues.push(`nodes: ID bị trùng (${duplicateNodeIds.join(", ")})`);
  }
  if (duplicateOrders.length) {
    issues.push(`nodes: order bị trùng (${duplicateOrders.join(", ")})`);
  }
  if (duplicateRelationIds.length) {
    issues.push(`relations: ID bị trùng (${duplicateRelationIds.join(", ")})`);
  }

  const labelIds = new Set(file.labels.map((label) => label.id));
  file.nodes.forEach((node) => {
    node.labelIds.forEach((labelId) => {
      if (!labelIds.has(labelId)) {
        issues.push(`node ${node.id}: label ${labelId} không tồn tại`);
      }
    });
  });

  const nodeIds = new Set(file.nodes.map((node) => node.id));
  file.relations.forEach((relation) => {
    if (!nodeIds.has(relation.from)) {
      issues.push(
        `relation ${relation.id}: node nguồn ${relation.from} không tồn tại`,
      );
    }
    if (!nodeIds.has(relation.to)) {
      issues.push(
        `relation ${relation.id}: node đích ${relation.to} không tồn tại`,
      );
    }
    if (relation.from === relation.to) {
      issues.push(`relation ${relation.id}: from và to phải khác nhau`);
    }
  });

  if (
    Date.parse(file.metadata.updatedAt) < Date.parse(file.metadata.createdAt)
  ) {
    issues.push("metadata.updatedAt không được sớm hơn metadata.createdAt");
  }

  return issues;
};

export const parseCanvasFileText = (text: string): CanvasFileV1 => {
  if (new TextEncoder().encode(text).byteLength > CANVAS_FILE_MAX_BYTES) {
    throw new CanvasFileValidationError(["File vượt quá giới hạn 5 MiB."]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CanvasFileValidationError(["File không phải JSON hợp lệ."]);
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "schemaVersion" in parsed &&
    (parsed as { schemaVersion?: unknown }).schemaVersion !== "1.0.0"
  ) {
    throw new CanvasFileValidationError([
      `Schema version ${String((parsed as { schemaVersion?: unknown }).schemaVersion)} không được hỗ trợ. Importer hiện chỉ hỗ trợ 1.0.0.`,
    ]);
  }

  if (!validateSchema(parsed)) {
    throw new CanvasFileValidationError(
      (validateSchema.errors ?? []).map(formatAjvError),
    );
  }

  const file = parsed as CanvasFileV1;
  const semanticIssues = validateSemantics(file);
  if (semanticIssues.length)
    throw new CanvasFileValidationError(semanticIssues);

  return clone(file);
};

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const slugify = (value: string): string => {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "label";
};

const findGroup = (
  groups: LabelGroup[],
  predicate: (group: LabelGroup) => boolean,
): LabelGroup | undefined => groups.find(predicate);

const resolveMasterLabel = (
  fileLabel: Extract<CanvasFileLabel, { source: "master" }>,
  labels: Label[],
  labelGroups: LabelGroup[],
): {
  label?: Label;
  resolution?: "id" | "group-id-name" | "group-name-name";
} => {
  const byId = labels.find((label) => label.id === fileLabel.id);
  if (byId) return { label: byId, resolution: "id" };

  const normalizedName = normalizeText(fileLabel.name);
  if (fileLabel.group.id) {
    const byGroupIdAndName = labels.find(
      (label) =>
        label.groupId === fileLabel.group.id &&
        normalizeText(label.name) === normalizedName,
    );
    if (byGroupIdAndName) {
      return { label: byGroupIdAndName, resolution: "group-id-name" };
    }
  }

  const group = findGroup(
    labelGroups,
    (candidate) =>
      normalizeText(candidate.name) === normalizeText(fileLabel.group.name),
  );
  if (!group) return {};

  const byGroupNameAndLabelName = labels.find(
    (label) =>
      label.groupId === group.id &&
      normalizeText(label.name) === normalizedName,
  );
  return byGroupNameAndLabelName
    ? { label: byGroupNameAndLabelName, resolution: "group-name-name" }
    : {};
};

const createFallbackCustomLabel = (
  label: Extract<CanvasFileLabel, { source: "master" }>,
): CanvasFileCustomLabel => ({
  id: `custom:imported:${slugify(label.name)}-${hashText(`${label.id}|${label.group.id ?? ""}|${label.name}`)}`,
  source: "custom",
  name: label.name,
  group: {
    id: `custom-group:imported:${slugify(label.group.name)}-${hashText(`${label.group.id ?? ""}|${label.group.name}`)}`,
    name: label.group.name,
  },
  description: label.description ?? "",
});

const cardNames = (card: DeckCard): string[] =>
  [card.vietnameseName, card.englishName].map(normalizeText).filter(Boolean);

const resolveCard = (
  node: CanvasFileNode,
  cards: DeckCard[],
): { card: DeckCard; fallback?: "number" | "name" } => {
  const byId = cards.find((card) => card.id === node.cardId);
  if (byId) {
    if (byId.deckType !== node.type) {
      throw new CanvasFileValidationError([
        `Node ${node.id}: card ${node.cardId} có type ${byId.deckType}, không khớp ${node.type}.`,
      ]);
    }
    return { card: byId };
  }

  const byNumber = cards.filter(
    (card) => card.deckType === node.type && card.number === node.cardNumber,
  );
  if (byNumber.length === 1) return { card: byNumber[0], fallback: "number" };

  const normalizedDisplayName = normalizeText(node.displayName);
  const byName = cards.filter(
    (card) =>
      card.deckType === node.type &&
      cardNames(card).includes(normalizedDisplayName),
  );
  if (byName.length === 1) return { card: byName[0], fallback: "name" };

  throw new CanvasFileValidationError([
    `Node ${node.id}: không resolve được card ${node.cardId} (${node.type} #${node.cardNumber}, ${node.displayName}).`,
  ]);
};

export const createImportPlan = (
  file: CanvasFileV1,
  masterData: CanvasFileMasterData,
): ImportPlan => {
  const warnings: string[] = [];
  const customLabels: CanvasFileCustomLabel[] = [];
  const labelIdMap = new Map<string, string>();
  let resolvedMasterLabelCount = 0;

  file.labels.forEach((fileLabel) => {
    if (fileLabel.source === "custom") {
      const custom = clone(fileLabel);
      customLabels.push(custom);
      labelIdMap.set(fileLabel.id, custom.id);
      return;
    }

    const resolved = resolveMasterLabel(
      fileLabel,
      masterData.labels,
      masterData.labelGroups,
    );
    if (resolved.label) {
      labelIdMap.set(fileLabel.id, resolved.label.id);
      resolvedMasterLabelCount += 1;
      if (resolved.resolution === "group-name-name") {
        warnings.push(
          `Label “${fileLabel.name}” được resolve bằng group + name (${resolved.resolution}).`,
        );
      }
      return;
    }

    const fallback = createFallbackCustomLabel(fileLabel);
    customLabels.push(fallback);
    labelIdMap.set(fileLabel.id, fallback.id);
    warnings.push(
      `Master label “${fileLabel.name}” không resolve được; đã chuyển thành custom canvas-local.`,
    );
  });

  const spreadCards: SpreadCard[] = [...file.nodes]
    .sort((left, right) => left.order - right.order)
    .map((node) => {
      const { card, fallback } = resolveCard(node, masterData.cards);
      if (fallback) {
        warnings.push(
          `Card “${node.displayName}” được resolve bằng ${fallback === "number" ? "type + cardNumber" : "type + displayName"}.`,
        );
      }
      if (
        card.number !== node.cardNumber ||
        !cardNames(card).includes(normalizeText(node.displayName))
      ) {
        warnings.push(
          `Metadata của node “${node.displayName}” khác master card “${card.vietnameseName || card.englishName}”; app dùng master data hiện tại.`,
        );
      }

      return {
        id: node.id,
        cardId: card.id,
        deckType: card.deckType,
        x: node.position.x,
        y: node.position.y,
        labels: node.labelIds.map((labelId) => labelIdMap.get(labelId)!),
        isReversed: node.type === "tarot" && node.state === "reversed",
        polarity:
          node.type === "iching" && node.state !== "neutral"
            ? node.state
            : null,
        drawSequence: node.order,
        placedSequence: node.order,
      } satisfies SpreadCard;
    });

  return {
    spreadCards,
    metadata: clone(file.metadata),
    customLabels,
    relations: clone(file.relations),
    extensions: clone(file.extensions),
    warnings,
    counts: {
      cards: spreadCards.length,
      masterLabels: resolvedMasterLabelCount,
      customLabels: customLabels.length,
      relations: file.relations.length,
    },
  };
};

const createFileLabelMap = (
  spreadCards: SpreadCard[],
  labels: Label[],
  labelGroups: LabelGroup[],
  customLabels: CanvasFileCustomLabel[],
): Map<string, CanvasFileLabel> => {
  const result = new Map<string, CanvasFileLabel>();
  const masterLabels = new Map(labels.map((label) => [label.id, label]));
  const groups = new Map(labelGroups.map((group) => [group.id, group]));
  const custom = new Map(customLabels.map((label) => [label.id, label]));

  const referencedIds = new Set(spreadCards.flatMap((card) => card.labels));
  customLabels.forEach((label) => referencedIds.add(label.id));

  referencedIds.forEach((labelId) => {
    const customLabel = custom.get(labelId);
    if (customLabel) {
      result.set(labelId, clone(customLabel));
      return;
    }

    const masterLabel = masterLabels.get(labelId);
    const group = masterLabel ? groups.get(masterLabel.groupId) : undefined;
    if (!masterLabel || !group) {
      throw new CanvasFileValidationError([
        `Không thể export label ${labelId} vì label hoặc group không còn tồn tại.`,
      ]);
    }
    result.set(labelId, {
      id: masterLabel.id,
      source: "master",
      name: masterLabel.name,
      group: { id: group.id, name: group.name },
      description: "",
    });
  });

  return result;
};

const cardDisplayName = (card: DeckCard): string =>
  card.vietnameseName || card.englishName;

export const createCanvasFile = (
  input: CreateCanvasFileInput,
): CanvasFileV1 => {
  const cardsById = new Map(input.cards.map((card) => [card.id, card]));
  const customLabels = input.customLabels ?? [];
  const fileLabelMap = createFileLabelMap(
    input.spreadCards,
    input.labels,
    input.labelGroups,
    customLabels,
  );

  const indexedCards = input.spreadCards.map((spreadCard, index) => ({
    spreadCard,
    index,
    sequence:
      spreadCard.placedSequence ??
      spreadCard.drawSequence ??
      Number.MAX_SAFE_INTEGER,
  }));
  indexedCards.sort(
    (left, right) => left.sequence - right.sequence || left.index - right.index,
  );

  const nodes: CanvasFileNode[] = indexedCards.map(({ spreadCard }, index) => {
    const card = cardsById.get(spreadCard.cardId);
    if (!card) {
      throw new CanvasFileValidationError([
        `Không thể export card ${spreadCard.cardId} vì card không còn trong master data.`,
      ]);
    }

    const common = {
      id: spreadCard.id,
      cardId: card.id,
      cardNumber: card.number,
      displayName: cardDisplayName(card),
      position: { x: spreadCard.x, y: spreadCard.y },
      order: index + 1,
      labelIds: [...spreadCard.labels],
    };

    if (card.deckType === "tarot") {
      return {
        ...common,
        type: "tarot",
        state: spreadCard.isReversed ? "reversed" : "upright",
      };
    }
    return {
      ...common,
      type: "iching",
      state: spreadCard.polarity ?? "neutral",
    };
  });

  const file: CanvasFileV1 = {
    format: "iching-canvas",
    schemaVersion: "1.0.0",
    metadata: clone(input.metadata),
    labels: [...fileLabelMap.values()],
    nodes,
    relations: clone(input.relations ?? []),
    extensions: clone(input.extensions ?? {}),
  };

  return parseCanvasFileText(JSON.stringify(file));
};

export const serializeCanvasFile = (file: CanvasFileV1): string =>
  `${JSON.stringify(parseCanvasFileText(JSON.stringify(file)), null, 2)}\n`;

const padDatePart = (value: number): string => String(value).padStart(2, "0");

export const createCanvasExportFilename = (date = new Date()): string =>
  `canvas-export-${date.getFullYear()}${padDatePart(date.getMonth() + 1)}${padDatePart(date.getDate())}-${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}${padDatePart(date.getSeconds())}.json`;

export const createStoredMetadata = (
  plan: ImportPlan,
): import("./types").CanvasFileStoredMetadata => ({
  schemaVersion: "1.0.0",
  name: plan.metadata.name,
  description: plan.metadata.description ?? "",
  sourceScript: plan.metadata.sourceScript ?? "",
  createdAt: plan.metadata.createdAt,
  customLabels: clone(plan.customLabels),
  relations: clone(plan.relations),
  extensions: clone(plan.extensions),
});

export const createFileMetadataFromStored = (
  stored: import("./types").CanvasFileStoredMetadata | undefined,
  fallback: { name: string; noteMarkdown: string; updatedAt?: string },
): CanvasFileMetadata => {
  const now = fallback.updatedAt ?? new Date().toISOString();
  return {
    name: stored?.name || fallback.name,
    description: stored?.description ?? "",
    sourceScript: stored?.sourceScript ?? "",
    noteMarkdown: fallback.noteMarkdown,
    createdAt: stored?.createdAt ?? now,
    updatedAt: now,
  };
};
