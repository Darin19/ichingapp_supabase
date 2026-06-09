import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const nodeMajorVersion = Number(process.versions.node.split(".")[0] || 0);
const hasEnvProxyFlag =
  process.execArgv.includes("--use-env-proxy") ||
  process.env.NODE_OPTIONS?.includes("--use-env-proxy");

if (
  proxyUrl &&
  nodeMajorVersion >= 24 &&
  !hasEnvProxyFlag &&
  process.env.ICHING_IMPORT_PROXY_REEXEC !== "1"
) {
  const rerun = spawnSync(
    process.execPath,
    [
      "--use-env-proxy",
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: { ...process.env, ICHING_IMPORT_PROXY_REEXEC: "1" },
    },
  );
  process.exit(rerun.status ?? 1);
}

const EXPECTED_COUNTS = {
  cards: 64,
  labelGroups: 15,
  labels: 1108,
};

const args = process.argv.slice(2);
const dirArgIndex = args.indexOf("--dir");
const sourceDir =
  dirArgIndex >= 0 ? args[dirArgIndex + 1] : process.env.LEGACY_JSONL_DIR;

if (!sourceDir) {
  throw new Error(
    'Missing source directory. Use --dir "C:\\Users\\Kim Duc\\Downloads\\Database Fuego" or LEGACY_JSONL_DIR.',
  );
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const findFile = (prefix) => {
  const entries = fs.readdirSync(sourceDir);
  const match = entries.find(
    (entry) => entry.startsWith(prefix) && entry.endsWith(".jsonl"),
  );
  if (!match) {
    throw new Error(`Unable to find JSONL file with prefix ${prefix}`);
  }
  return path.join(sourceDir, match);
};

const readJsonl = (prefix) => {
  const filePath = findFile(prefix);
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path.basename(filePath)}:${index + 1}: ${error}`);
      }
    });
};

const parseTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const docId = (record) => {
  if (typeof record.id === "string" && record.id) return record.id;
  const sourcePath = String(record.__path__ || "");
  return sourcePath.split("/").pop() || "";
};

const toInt = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const upsertRows = async (table, rows, onConflict = "id", chunkSize = 100) => {
  for (const rowsChunk of chunk(rows, chunkSize)) {
    const { error } = await supabase
      .from(table)
      .upsert(rowsChunk, { onConflict });
    if (error) throw new Error(`${table} import failed: ${error.message}`);
  }
};

const cards = readJsonl("iching-tarot-app-iching_cards_master").map(
  (record) => ({
    id: docId(record),
    deck_type: "iching",
    number: toInt(record.number),
    sort_order: toInt(record.sortOrder),
    vietnamese_name: record.vietnameseName || "",
    english_name: record.englishName || "",
    link1: record.link1 || "",
    link2: record.link2 || "",
    link3: record.link3 || "",
    content1: record.content1 || "",
    content2: record.content2 || "",
    content3: record.content3 || "",
    img_path: record.imgPath || "",
    image_url: record.imageUrl || null,
    keywords: record.keywords || null,
    uid: record.uid || null,
    created_at: parseTimestamp(record.createdAt || record.__createTime__),
    updated_at: parseTimestamp(record.updatedAt || record.__updateTime__),
  }),
);

const labelGroups = readJsonl("iching-tarot-app-label_groups").map(
  (record) => ({
    id: docId(record),
    name: record.name || "",
    uid: record.uid || null,
    sort_order: toInt(record.sortOrder),
    created_at: parseTimestamp(record.createdAt || record.__createTime__),
    updated_at: parseTimestamp(record.updatedAt || record.__updateTime__),
  }),
);

const labels = readJsonl("iching-tarot-app-labels").map((record) => ({
  id: docId(record),
  name: record.name || "",
  group_id: record.groupId || "",
  uid: record.uid || null,
  sort_order: toInt(record.sortOrder),
  created_at: parseTimestamp(record.createdAt || record.__createTime__),
  updated_at: parseTimestamp(record.updatedAt || record.__updateTime__),
}));

const appCache = readJsonl("iching-tarot-app-app_cache")
  .filter((record) => docId(record) === "master_data")
  .map((record) => ({
    id: docId(record),
    version: record.version || "",
    updated_at: parseTimestamp(record.updatedAt || record.__updateTime__),
  }));

if (cards.length !== EXPECTED_COUNTS.cards) {
  throw new Error(`Expected 64 cards, found ${cards.length}`);
}
if (labelGroups.length !== EXPECTED_COUNTS.labelGroups) {
  throw new Error(`Expected 15 label groups, found ${labelGroups.length}`);
}
if (labels.length !== EXPECTED_COUNTS.labels) {
  throw new Error(`Expected 1108 labels, found ${labels.length}`);
}
if (appCache.length !== 1) {
  throw new Error(`Expected app_cache/master_data, found ${appCache.length}`);
}

const labelGroupIds = new Set(labelGroups.map((group) => group.id));
const missingGroupIds = [
  ...new Set(
    labels
      .filter((label) => !labelGroupIds.has(label.group_id))
      .map((label) => label.group_id),
  ),
];

if (missingGroupIds.length > 0) {
  throw new Error(
    `Labels reference missing label groups: ${missingGroupIds.join(", ")}`,
  );
}

await upsertRows("iching_cards_master", cards, "id", 8);
await upsertRows("label_groups", labelGroups);
await upsertRows("labels", labels, "id", 250);
await upsertRows("app_cache", appCache);

const countTable = async (table) => {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`Count failed for ${table}: ${error.message}`);
  return count ?? 0;
};

const importedCounts = {
  cards: await countTable("iching_cards_master"),
  labelGroups: await countTable("label_groups"),
  labels: await countTable("labels"),
};

if (
  importedCounts.cards !== EXPECTED_COUNTS.cards ||
  importedCounts.labelGroups !== EXPECTED_COUNTS.labelGroups ||
  importedCounts.labels !== EXPECTED_COUNTS.labels
) {
  throw new Error(
    `Post-import counts do not match expected master data totals: ${JSON.stringify(importedCounts)}`,
  );
}

console.log(
  JSON.stringify(
    {
      imported: {
        cards: cards.length,
        labelGroups: labelGroups.length,
        labels: labels.length,
        appCache: appCache.length,
      },
      databaseCounts: importedCounts,
    },
    null,
    2,
  ),
);
