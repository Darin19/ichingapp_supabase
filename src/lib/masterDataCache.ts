import { doc, setDoc, type DocumentReference } from "./supabaseDb";

export const MASTER_DATA_MARKER_COLLECTION = "app_cache";
export const MASTER_DATA_MARKER_ID = "master_data";
export const MASTER_DATA_MARKER_PATH = `${MASTER_DATA_MARKER_COLLECTION}/${MASTER_DATA_MARKER_ID}`;

type MasterDataBatchMarkerTarget = {
  batch: {
    set: (
      ref: DocumentReference,
      data: Record<string, unknown>,
      options?: { merge?: boolean },
    ) => void;
  };
  db: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createMasterDataVersion = () => {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${new Date().toISOString()}-${randomId}`;
};

const getMasterDataMarkerData = (version: string, updatedAt = new Date()) => ({
  version,
  updatedAt: updatedAt.toISOString(),
});

export function writeMasterDataMarker(
  target: MasterDataBatchMarkerTarget,
  version: string,
): void;
export function writeMasterDataMarker(
  target: unknown,
  version: string,
): Promise<void>;
export function writeMasterDataMarker(
  target: unknown | MasterDataBatchMarkerTarget,
  version: string,
) {
  if (isRecord(target) && "batch" in target) {
    const batchTarget = target as MasterDataBatchMarkerTarget;
    batchTarget.batch.set(
      doc(batchTarget.db, MASTER_DATA_MARKER_COLLECTION, MASTER_DATA_MARKER_ID),
      getMasterDataMarkerData(version),
      { merge: true },
    );
    return;
  }

  return setDoc(
    doc(target, MASTER_DATA_MARKER_COLLECTION, MASTER_DATA_MARKER_ID),
    getMasterDataMarkerData(version),
    { merge: true },
  );
}
