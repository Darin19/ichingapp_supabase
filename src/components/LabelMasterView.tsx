import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { LabelGroup, Label as LabelType } from "../types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Layers,
  GripVertical,
  ArrowDownAZ,
  RefreshCw,
} from "lucide-react";
import { db, doc, writeBatch } from "../lib/supabaseDb";
import { handleSupabaseError, OperationType } from "../lib/supabaseErrors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createMasterDataVersion,
  writeMasterDataMarker,
} from "../lib/masterDataCache";

interface LabelMasterViewProps {
  groups: LabelGroup[];
  setGroups: (
    groups: LabelGroup[] | ((prev: LabelGroup[]) => LabelGroup[]),
  ) => void;
  labels: LabelType[];
  setLabels: (
    labels: LabelType[] | ((prev: LabelType[]) => LabelType[]),
  ) => void;
  onSyncMasterData: () => void | Promise<void>;
  isSyncingMasterData: boolean;
  onMasterDataWritten: (version: string) => void;
}

const sortBySortOrder = <T extends { sortOrder?: number }>(items: T[]) =>
  [...items].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  );

const hasOrderChanged = <T extends { id: string }>(before: T[], after: T[]) =>
  before.length !== after.length ||
  before.some((item, index) => item.id !== after[index]?.id);

type DragKind = "group" | "label";
type DropPosition = "before" | "after";

type DropIndicator = {
  kind: DragKind;
  targetId: string;
  position: DropPosition;
};

type DragState = {
  kind: DragKind;
  id: string;
  name: string;
  offsetX: number;
  offsetY: number;
  currentX: number;
  currentY: number;
  width: number;
  height: number;
};

const getDropIndicator = <T extends { id: string }>(
  kind: DragKind,
  items: T[],
  refs: Map<string, HTMLDivElement>,
  activeId: string,
  x: number,
  y: number,
) => {
  let closest: { id: string; rect: DOMRect } | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const item of items) {
    if (item.id === activeId) continue;

    const node = refs.get(item.id);
    if (!node) continue;

    const rect = node.getBoundingClientRect();
    const isInside =
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (isInside) {
      closest = { id: item.id, rect };
      closestDistance = 0;
      continue;
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(x - centerX, y - centerY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = { id: item.id, rect };
    }
  }

  if (!closest) return null;

  const rect = closest.rect;
  const position: DropPosition =
    kind === "group"
      ? y < rect.top + rect.height / 2
        ? "before"
        : "after"
      : x < rect.left + rect.width / 2
        ? "before"
        : "after";

  return {
    kind,
    targetId: closest.id,
    position,
  };
};

const reorderByIndicator = <T extends { id: string }>(
  items: T[],
  activeId: string,
  indicator: DropIndicator | null,
) => {
  if (!indicator || indicator.targetId === activeId) return items;

  const activeItem = items.find((item) => item.id === activeId);
  if (!activeItem) return items;

  const withoutActive = items.filter((item) => item.id !== activeId);
  const targetIndex = withoutActive.findIndex(
    (item) => item.id === indicator.targetId,
  );
  if (targetIndex < 0) return items;

  const insertIndex =
    indicator.position === "before" ? targetIndex : targetIndex + 1;
  const next = [...withoutActive];
  next.splice(insertIndex, 0, activeItem);
  return next;
};

export default function LabelMasterView({
  groups,
  setGroups,
  labels,
  setLabels,
  onSyncMasterData,
  isSyncingMasterData,
  onMasterDataWritten,
}: LabelMasterViewProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    groups[0]?.id || null,
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelName, setEditingLabelName] = useState("");
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null,
  );
  const groupItemRefs = useRef(new Map<string, HTMLDivElement>());
  const labelItemRefs = useRef(new Map<string, HTMLDivElement>());
  const orderedGroupsRef = useRef<LabelGroup[]>([]);
  const orderedGroupLabelsRef = useRef<LabelType[]>([]);
  const dragStateRef = useRef<DragState | null>(null);
  const dropIndicatorRef = useRef<DropIndicator | null>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);

  const orderedGroups = sortBySortOrder(groups);
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const groupLabels = sortBySortOrder(
    labels.filter((l) => l.groupId === selectedGroupId),
  );
  const orderedGroupLabels = groupLabels;
  const activeDraggingGroupId =
    dragState?.kind === "group" ? dragState.id : null;
  const activeDraggingLabelId =
    dragState?.kind === "label" ? dragState.id : null;

  useEffect(() => {
    orderedGroupsRef.current = orderedGroups;
  }, [orderedGroups]);

  useEffect(() => {
    orderedGroupLabelsRef.current = orderedGroupLabels;
  }, [orderedGroupLabels]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [Boolean(dragState)]);

  useEffect(() => {
    dropIndicatorRef.current = dropIndicator;
  }, [dropIndicator]);

  useLayoutEffect(() => {
    const dragGhost = dragGhostRef.current;
    if (!dragGhost || !dragState) return;

    dragGhost.style.left = `${dragState.currentX - dragState.offsetX}px`;
    dragGhost.style.top = `${dragState.currentY - dragState.offsetY}px`;
    dragGhost.style.width = `${dragState.width}px`;
    dragGhost.style.height = `${dragState.height}px`;
  }, [
    dragState?.currentX,
    dragState?.currentY,
    dragState?.height,
    dragState?.offsetX,
    dragState?.offsetY,
    dragState?.width,
  ]);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedGroupId(null);
      return;
    }

    if (
      !selectedGroupId ||
      !groups.some((group) => group.id === selectedGroupId)
    ) {
      setSelectedGroupId(sortBySortOrder(groups)[0].id);
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    setDropIndicator(null);
  }, [selectedGroupId]);

  const persistGroupOrder = async (ordered: LabelGroup[]) => {
    if (!hasOrderChanged(sortBySortOrder(groups), ordered)) return;

    const previousGroups = groups;
    const updatedAt = new Date().toISOString();
    const nextGroups = ordered.map((group, index) => ({
      ...group,
      sortOrder: index,
      updatedAt,
    }));

    setGroups(nextGroups);

    if (!db) return;

    try {
      const version = createMasterDataVersion();
      const batch = writeBatch(db);
      nextGroups.forEach((group) => {
        batch.set(doc(db, "label_groups", group.id), group, { merge: true });
      });
      writeMasterDataMarker({ batch, db }, version);
      await batch.commit();
      onMasterDataWritten(version);
    } catch (error) {
      setGroups(previousGroups);
      handleSupabaseError(error, OperationType.WRITE, "label_groups/reorder");
    }
  };

  const persistLabelOrder = async (ordered: LabelType[]) => {
    if (!selectedGroupId || !hasOrderChanged(groupLabels, ordered)) return;

    const previousLabels = labels;
    const updatedAt = new Date().toISOString();
    const nextLabelsForGroup = ordered.map((label, index) => ({
      ...label,
      sortOrder: index,
      updatedAt,
    }));
    const labelsById = new Map(
      nextLabelsForGroup.map((label) => [label.id, label]),
    );

    setLabels((prev) => prev.map((label) => labelsById.get(label.id) || label));

    if (!db) return;

    try {
      const version = createMasterDataVersion();
      const batch = writeBatch(db);
      nextLabelsForGroup.forEach((label) => {
        batch.set(doc(db, "labels", label.id), label, { merge: true });
      });
      writeMasterDataMarker({ batch, db }, version);
      await batch.commit();
      onMasterDataWritten(version);
    } catch (error) {
      setLabels(previousLabels);
      handleSupabaseError(error, OperationType.WRITE, "labels/reorder");
    }
  };

  const autoSortLabels = () => {
    if (!selectedGroupId || groupLabels.length < 2) return;

    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      numeric: true,
    });
    const sortedLabels = [...groupLabels].sort(
      (a, b) =>
        collator.compare(a.name.trim(), b.name.trim()) ||
        a.id.localeCompare(b.id),
    );

    void persistLabelOrder(sortedLabels);
  };

  const startPointerDrag = (
    event: PointerEvent<HTMLElement>,
    kind: DragKind,
    item: LabelGroup | LabelType,
  ) => {
    if (event.button !== 0) return;

    const refs =
      kind === "group" ? groupItemRefs.current : labelItemRefs.current;
    const node = refs.get(item.id);
    if (!node) return;

    const rect = node.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();

    setDragState({
      kind,
      id: item.id,
      name: item.name,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      currentX: event.clientX,
      currentY: event.clientY,
      width: rect.width,
      height: rect.height,
    });
    setDropIndicator(null);
  };

  useEffect(() => {
    if (!dragState) return;

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentX: event.clientX,
              currentY: event.clientY,
            }
          : prev,
      );

      if (activeDrag.kind === "group") {
        setDropIndicator(
          getDropIndicator(
            "group",
            orderedGroupsRef.current,
            groupItemRefs.current,
            activeDrag.id,
            event.clientX,
            event.clientY,
          ),
        );
        return;
      }

      setDropIndicator(
        getDropIndicator(
          "label",
          orderedGroupLabelsRef.current,
          labelItemRefs.current,
          activeDrag.id,
          event.clientX,
          event.clientY,
        ),
      );
    };

    const finishPointerDrag = () => {
      const activeDrag = dragStateRef.current;
      if (activeDrag?.kind === "group") {
        void persistGroupOrder(
          reorderByIndicator(
            orderedGroupsRef.current,
            activeDrag.id,
            dropIndicatorRef.current,
          ),
        );
      }

      if (activeDrag?.kind === "label") {
        void persistLabelOrder(
          reorderByIndicator(
            orderedGroupLabelsRef.current,
            activeDrag.id,
            dropIndicatorRef.current,
          ),
        );
      }

      setDropIndicator(null);
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointerDrag, { once: true });
    window.addEventListener("pointercancel", finishPointerDrag, { once: true });

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
    };
  }, [dragState]);

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    const id = crypto.randomUUID();
    const previousGroups = groups;
    const previousSelectedGroupId = selectedGroupId;
    const newGroup: LabelGroup = {
      id,
      name: newGroupName.trim(),
      sortOrder: groups.length,
    };

    setGroups((prev) => [...prev, newGroup]);
    setNewGroupName("");
    setSelectedGroupId(id);

    if (db) {
      try {
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
      } catch (error) {
        setGroups(previousGroups);
        setSelectedGroupId(previousSelectedGroupId);
        handleSupabaseError(error, OperationType.WRITE, `label_groups/${id}`);
      }
    }
  };

  const confirmDeleteGroup = (id: string) => {
    setGroupToDelete(id);
  };

  const executeDeleteGroup = async () => {
    if (!groupToDelete) return;
    const id = groupToDelete;
    setGroupToDelete(null);
    const previousGroups = groups;
    const previousLabels = labels;
    const previousSelectedGroupId = selectedGroupId;
    const nextGroups = groups.filter((g) => g.id !== id);
    const nextLabels = labels.filter((l) => l.groupId !== id);

    setGroups(nextGroups);
    setLabels(nextLabels);
    if (selectedGroupId === id) {
      setSelectedGroupId(sortBySortOrder(nextGroups)[0]?.id || null);
    }

    if (db) {
      try {
        const version = createMasterDataVersion();
        const batch = writeBatch(db);
        batch.delete(doc(db, "label_groups", id));
        labels
          .filter((l) => l.groupId === id)
          .forEach((l) => {
            batch.delete(doc(db, "labels", l.id));
          });
        writeMasterDataMarker({ batch, db }, version);
        await batch.commit();
        onMasterDataWritten(version);
      } catch (error) {
        setGroups(previousGroups);
        setLabels(previousLabels);
        setSelectedGroupId(previousSelectedGroupId);
        handleSupabaseError(error, OperationType.DELETE, `label_groups/${id}`);
      }
    }
  };

  const addLabel = async () => {
    if (!selectedGroupId || !newLabelName.trim()) return;
    const id = crypto.randomUUID();
    const previousLabels = labels;
    const newLabel: LabelType = {
      id,
      name: newLabelName.trim(),
      groupId: selectedGroupId,
      sortOrder: groupLabels.length,
    };

    setLabels((prev) => [...prev, newLabel]);
    setNewLabelName("");

    if (db) {
      try {
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
      } catch (error) {
        setLabels(previousLabels);
        handleSupabaseError(error, OperationType.WRITE, `labels/${id}`);
      }
    }
  };

  const deleteLabel = async (id: string) => {
    const previousLabels = labels;
    const nextLabels = labels.filter((l) => l.id !== id);
    setLabels(nextLabels);

    if (db) {
      try {
        const version = createMasterDataVersion();
        const batch = writeBatch(db);
        batch.delete(doc(db, "labels", id));
        writeMasterDataMarker({ batch, db }, version);
        await batch.commit();
        onMasterDataWritten(version);
      } catch (error) {
        setLabels(previousLabels);
        handleSupabaseError(error, OperationType.DELETE, `labels/${id}`);
      }
    }
  };

  const startEditGroup = (group: LabelGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const saveEditGroup = async () => {
    const groupId = editingGroupId;
    const nextName = editingGroupName.trim();
    if (!groupId || !nextName) return;

    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    const updatedGroup = {
      ...group,
      name: nextName,
      updatedAt: new Date().toISOString(),
    };

    setGroups((prev) => prev.map((g) => (g.id === groupId ? updatedGroup : g)));
    setEditingGroupId(null);
    setEditingGroupName("");

    if (db) {
      try {
        const version = createMasterDataVersion();
        const batch = writeBatch(db);
        batch.set(doc(db, "label_groups", groupId), updatedGroup, {
          merge: true,
        });
        writeMasterDataMarker({ batch, db }, version);
        await batch.commit();
        onMasterDataWritten(version);
      } catch (error) {
        setGroups((prev) => prev.map((g) => (g.id === groupId ? group : g)));
        setEditingGroupId(groupId);
        setEditingGroupName(group.name);
        handleSupabaseError(
          error,
          OperationType.WRITE,
          `label_groups/${groupId}`,
        );
      }
    }
  };

  const startEditLabel = (label: LabelType) => {
    setEditingLabelId(label.id);
    setEditingLabelName(label.name);
  };

  const saveEditLabel = async () => {
    const labelId = editingLabelId;
    const nextName = editingLabelName.trim();
    if (!labelId || !nextName) return;

    const label = labels.find((l) => l.id === labelId);
    if (!label) return;

    const updatedLabel = {
      ...label,
      name: nextName,
      updatedAt: new Date().toISOString(),
    };

    setLabels((prev) => prev.map((l) => (l.id === labelId ? updatedLabel : l)));
    setEditingLabelId(null);
    setEditingLabelName("");

    if (db) {
      try {
        const version = createMasterDataVersion();
        const batch = writeBatch(db);
        batch.set(doc(db, "labels", labelId), updatedLabel, {
          merge: true,
        });
        writeMasterDataMarker({ batch, db }, version);
        await batch.commit();
        onMasterDataWritten(version);
      } catch (error) {
        setLabels((prev) => prev.map((l) => (l.id === labelId ? label : l)));
        setEditingLabelId(labelId);
        setEditingLabelName(label.name);
        handleSupabaseError(error, OperationType.WRITE, `labels/${labelId}`);
      }
    }
  };

  return (
    <div className="flex h-full bg-[#f8f9fa] overflow-hidden">
      {/* Left Column - Groups */}
      <aside className="w-80 border-r border-[#e2e8f0] flex flex-col bg-white shadow-xl z-10 h-full min-h-0 overflow-hidden">
        <div className="p-6 border-b border-[#e2e8f0] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[0.75rem] font-bold text-[#495360] uppercase tracking-[0.15em]">
              Label Groups
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onSyncMasterData()}
              disabled={isSyncingMasterData}
              className="h-9 gap-2 rounded-xl border-[#e2e8f0] bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-[#495360] hover:border-[#166db0] hover:text-[#166db0]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isSyncingMasterData ? "animate-spin" : ""}`}
              />
              Sync
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New group..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGroup()}
              className="bg-[#f8f9fa] border-[#e2e8f0] h-10 text-sm focus:border-[#166db0] rounded-xl"
            />
            <Button
              size="icon"
              aria-label="Add label group"
              title="Add label group"
              className="h-10 w-10 shrink-0 bg-[#166db0] hover:bg-[#0e4a77] text-white rounded-xl shadow-lg shadow-[#166db0]/20"
              onClick={addGroup}
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1 min-h-0 h-full">
          <div className="p-4 space-y-2">
            {orderedGroups.map((group) => (
              <div
                ref={(node) => {
                  if (node) groupItemRefs.current.set(group.id, node);
                  else groupItemRefs.current.delete(group.id);
                }}
                key={group.id}
                className={`group relative flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer border transition-colors ${
                  selectedGroupId === group.id
                    ? "bg-[#166db0]/5 border-[#166db0] text-[#166db0]"
                    : "hover:bg-[#f8f9fa] text-[#495360] border-transparent"
                } ${activeDraggingGroupId === group.id ? "border-[#166db0] bg-[#166db0]/10 ring-2 ring-[#166db0]/25 shadow-[0_8px_22px_rgba(22,109,176,0.16)]" : ""}`}
                onClick={() => setSelectedGroupId(group.id)}
              >
                {dropIndicator?.kind === "group" &&
                  dropIndicator.targetId === group.id && (
                    <div
                      className={`absolute left-3 right-3 h-[3px] rounded-full bg-[#166db0] shadow-[0_0_0_3px_rgba(22,109,176,0.16)] ${
                        dropIndicator.position === "before"
                          ? "-top-[7px]"
                          : "-bottom-[7px]"
                      }`}
                    />
                  )}
                {editingGroupId === group.id ? (
                  <div
                    className="flex items-center gap-1 flex-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          void saveEditGroup();
                        }
                      }}
                      className="h-8 text-xs bg-white border-[#166db0] rounded-lg"
                      autoFocus
                    />
                    <button
                      onClick={saveEditGroup}
                      aria-label="Save label group name"
                      title="Save label group name"
                      className="text-green-500 hover:text-green-600 p-1"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingGroupId(null)}
                      aria-label="Cancel editing label group"
                      title="Cancel editing label group"
                      className="text-red-500 hover:text-red-600 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        role="button"
                        aria-label="Drag label group"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(event) =>
                          startPointerDrag(event, "group", group)
                        }
                        className="shrink-0 cursor-grab touch-none rounded-lg p-1 text-[#94a3b8] transition-colors hover:bg-white hover:text-[#166db0] active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span
                        className={`truncate text-[15px] font-extrabold ${selectedGroupId === group.id ? "text-[#0f172a]" : ""}`}
                      >
                        {group.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditGroup(group);
                        }}
                        aria-label={`Edit label group ${group.name}`}
                        title={`Edit label group ${group.name}`}
                        className="p-1.5 hover:bg-white rounded-lg hover:text-[#166db0] transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDeleteGroup(group.id);
                        }}
                        aria-label={`Delete label group ${group.name}`}
                        title={`Delete label group ${group.name}`}
                        className="p-1.5 hover:bg-white rounded-lg hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Right Column - Labels */}
      <main className="flex-1 flex flex-col bg-[#f8f9fa] h-full min-h-0">
        {selectedGroup ? (
          <>
            <header className="h-16 border-b border-[#e2e8f0] flex items-center justify-between px-8 bg-white shadow-sm z-10">
              <h2 className="text-[0.75rem] font-bold text-[#495360] uppercase tracking-[0.15em]">
                Labels in{" "}
                <span className="text-[#166db0]">{selectedGroup.name}</span>
              </h2>
              <div className="flex items-center gap-3">
                <Input
                  placeholder="New label name..."
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addLabel()}
                  className="bg-[#f8f9fa] border-[#e2e8f0] h-10 w-64 text-sm focus:border-[#166db0] rounded-xl"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 gap-2 rounded-xl border-[#e2e8f0] bg-white px-4 text-xs font-bold uppercase tracking-wider text-[#495360] hover:border-[#166db0] hover:text-[#166db0]"
                  onClick={autoSortLabels}
                  disabled={groupLabels.length < 2}
                >
                  <ArrowDownAZ className="h-4 w-4" />
                  <span className="relative top-[1px]">Auto Sort</span>
                </Button>
                <Button
                  size="sm"
                  className="h-10 gap-2 bg-[#166db0] hover:bg-[#0e4a77] text-white px-6 rounded-xl shadow-lg shadow-[#166db0]/20 font-bold uppercase tracking-wider text-xs"
                  onClick={addLabel}
                >
                  <Plus className="w-[24px] h-[24px] relative -left-[1px]" />
                  <span className="relative top-[1px]">Add Label</span>
                </Button>
              </div>
            </header>

            <ScrollArea className="flex-1 min-h-0 h-full">
              <div className="p-10 flex flex-wrap gap-6">
                {orderedGroupLabels.map((label) => (
                  <div
                    ref={(node) => {
                      if (node) labelItemRefs.current.set(label.id, node);
                      else labelItemRefs.current.delete(label.id);
                    }}
                    key={label.id}
                    className={`relative h-[52px] w-[245px] bg-white border border-[#e2e8f0] px-4 rounded-2xl flex items-center justify-between group hover:border-[#166db0] hover:shadow-lg hover:shadow-[#166db0]/5 transition-colors ${
                      activeDraggingLabelId === label.id
                        ? "border-[#166db0] bg-[#166db0]/10 ring-2 ring-[#166db0]/25 shadow-[0_8px_22px_rgba(22,109,176,0.16)]"
                        : ""
                    }`}
                  >
                    {dropIndicator?.kind === "label" &&
                      dropIndicator.targetId === label.id && (
                        <div
                          className={`absolute bottom-2 top-2 w-[3px] rounded-full bg-[#166db0] shadow-[0_0_0_3px_rgba(22,109,176,0.16)] ${
                            dropIndicator.position === "before"
                              ? "-left-[13px]"
                              : "-right-[13px]"
                          }`}
                        />
                      )}
                    {editingLabelId === label.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <Input
                          value={editingLabelName}
                          onChange={(e) => setEditingLabelName(e.target.value)}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" &&
                              !event.nativeEvent.isComposing
                            ) {
                              event.preventDefault();
                              void saveEditLabel();
                            }
                          }}
                          className="h-9 text-xs bg-white border-[#166db0] rounded-lg"
                          autoFocus
                        />
                        <button
                          onClick={saveEditLabel}
                          aria-label="Save label name"
                          title="Save label name"
                          className="text-green-500 hover:text-green-600 p-1"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingLabelId(null)}
                          aria-label="Cancel editing label"
                          title="Cancel editing label"
                          className="text-red-500 hover:text-red-600 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            role="button"
                            aria-label="Drag label"
                            onPointerDown={(event) =>
                              startPointerDrag(event, "label", label)
                            }
                            className="shrink-0 cursor-grab touch-none rounded-lg p-1 text-[#94a3b8] transition-colors hover:bg-[#f8f9fa] hover:text-[#166db0] active:cursor-grabbing"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <span className="truncate text-[15.5px] font-extrabold text-[#0f172a]">
                            {label.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEditLabel(label)}
                            aria-label={`Edit label ${label.name}`}
                            title={`Edit label ${label.name}`}
                            className="p-2 hover:bg-[#f8f9fa] rounded-lg hover:text-[#166db0] text-[#94a3b8] transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteLabel(label.id)}
                            aria-label={`Delete label ${label.name}`}
                            title={`Delete label ${label.name}`}
                            className="p-2 hover:bg-[#f8f9fa] rounded-lg hover:text-red-500 text-[#94a3b8] transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {groupLabels.length === 0 && (
                  <div className="col-span-full py-32 text-center flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md border border-[#e2e8f0]">
                      <Plus className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="text-sm font-bold uppercase tracking-widest opacity-60">
                      No labels in this group
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#94a3b8] gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md border border-[#e2e8f0]">
              <Layers className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm font-bold uppercase tracking-widest opacity-60">
              Select a group to manage labels
            </p>
          </div>
        )}
      </main>

      {dragState && (
        <div
          ref={dragGhostRef}
          className="pointer-events-none fixed z-[1000] flex items-center gap-2 rounded-2xl border-2 border-[#166db0] bg-white px-4 text-[#0f172a] shadow-[0_18px_38px_rgba(22,109,176,0.28)] ring-4 ring-[#166db0]/15"
        >
          <GripVertical className="h-4 w-4 shrink-0 text-[#166db0]" />
          <span className="min-w-0 truncate text-[15px] font-extrabold">
            {dragState.name}
          </span>
        </div>
      )}

      <Dialog
        open={!!groupToDelete}
        onOpenChange={(open) => !open && setGroupToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Label Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this group and all its labels?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={executeDeleteGroup}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
