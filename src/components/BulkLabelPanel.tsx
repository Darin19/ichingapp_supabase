import {
  useEffect,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Check,
  ChevronDown,
  FolderPlus,
  Plus,
  Search,
  Tags,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label, LabelGroup } from "../types";

interface BulkLabelPanelProps {
  selectedCardCount: number;
  labels: Label[];
  labelGroups: LabelGroup[];
  selectedLabelIds: string[];
  isSaving: boolean;
  position: { x: number; y: number };
  onPositionChange: (position: { x: number; y: number }) => void;
  onToggleLabel: (labelId: string) => void;
  onClose: () => void;
  onClearLabels: () => void;
  onSave: () => void;
  onCreateGroup: (name: string) => Promise<string | null>;
  onCreateLabelAndApply: (name: string, groupId: string) => Promise<void>;
}

const normalizeText = (value: string) => value.trim().toLocaleLowerCase();

export default function BulkLabelPanel({
  selectedCardCount,
  labels,
  labelGroups,
  selectedLabelIds,
  isSaving,
  position,
  onPositionChange,
  onToggleLabel,
  onClose,
  onClearLabels,
  onSave,
  onCreateGroup,
  onCreateLabelAndApply,
}: BulkLabelPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const dragPositionRef = useRef(position);
  const [search, setSearch] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [targetGroupId, setTargetGroupId] = useState(labelGroups[0]?.id || "");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [isContentReady, setIsContentReady] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useLayoutEffect(() => {
    dragPositionRef.current = position;
    if (panelRef.current) {
      panelRef.current.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
    }
  }, [position]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsContentReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (event.ctrlKey || event.metaKey) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[data-bulk-label-trigger="true"]')) return;
      onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  useEffect(() => {
    if (
      !targetGroupId ||
      !labelGroups.some((group) => group.id === targetGroupId)
    ) {
      setTargetGroupId(labelGroups[0]?.id || "");
    }
  }, [labelGroups, targetGroupId]);

  const groupById = useMemo(
    () => new Map(labelGroups.map((group) => [group.id, group])),
    [labelGroups],
  );
  const labelById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels],
  );
  const selectedLabelIdSet = useMemo(
    () => new Set(selectedLabelIds),
    [selectedLabelIds],
  );

  const selectedLabels = useMemo(
    () =>
      selectedLabelIds
        .map((id) => labelById.get(id))
        .filter(Boolean) as Label[],
    [labelById, selectedLabelIds],
  );

  const filteredLabels = useMemo(() => {
    if (!isContentReady) return [];

    const query = normalizeText(deferredSearch);
    const source = query
      ? labels.filter((label) => normalizeText(label.name).includes(query))
      : labels;

    return [...source].sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      });
      if (nameCompare !== 0) return nameCompare;
      return (groupById.get(a.groupId)?.name || "").localeCompare(
        groupById.get(b.groupId)?.name || "",
        undefined,
        { sensitivity: "base" },
      );
    });
  }, [deferredSearch, groupById, isContentReady, labels]);

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name || isCreatingGroup) return;

    setIsCreatingGroup(true);
    try {
      const groupId = await onCreateGroup(name);
      if (groupId) {
        setTargetGroupId(groupId);
        setNewGroupName("");
      }
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleCreateLabelAndApply = async () => {
    const name = newLabelName.trim();
    if (!name || !targetGroupId || isCreatingLabel) return;

    setIsCreatingLabel(true);
    try {
      await onCreateLabelAndApply(name, targetGroupId);
      setNewLabelName("");
    } finally {
      setIsCreatingLabel(false);
    }
  };

  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const panel = panelRef.current;
    const parent = panel?.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = { ...position };
    dragPositionRef.current = startPosition;

    event.preventDefault();

    const schedulePanelPosition = (nextPosition: { x: number; y: number }) => {
      dragPositionRef.current = nextPosition;
      if (dragFrameRef.current !== null) return;

      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const latestPosition = dragPositionRef.current;
        if (panelRef.current) {
          panelRef.current.style.transform = `translate3d(${latestPosition.x}px, ${latestPosition.y}px, 0)`;
        }
      });
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const maxX =
        parentRect && panelRect
          ? Math.max(12, parentRect.width - panelRect.width - 12)
          : Number.POSITIVE_INFINITY;
      const maxY =
        parentRect && panelRect
          ? Math.max(12, parentRect.height - panelRect.height - 12)
          : Number.POSITIVE_INFINITY;

      schedulePanelPosition({
        x: Math.min(
          Math.max(12, startPosition.x + moveEvent.clientX - startX),
          maxX,
        ),
        y: Math.min(
          Math.max(12, startPosition.y + moveEvent.clientY - startY),
          maxY,
        ),
      });
    };

    const stopDragging = () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      const latestPosition = dragPositionRef.current;
      if (panelRef.current) {
        panelRef.current.style.transform = `translate3d(${latestPosition.x}px, ${latestPosition.y}px, 0)`;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      onPositionChange(latestPosition);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging, { once: true });
    window.addEventListener("pointercancel", stopDragging, { once: true });
  };

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-0 z-50 flex max-h-[calc(100%-24px)] w-[360px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl shadow-black/25 backdrop-blur-md will-change-transform"
    >
      <div
        className="flex cursor-grab items-center justify-between border-b border-[#e2e8f0] px-4 py-3 active:cursor-grabbing"
        onPointerDown={startDragging}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#166db0] text-white">
            <Tags className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#64748b]">
              Bulk Labels
            </div>
            <div className="text-sm font-extrabold text-[#0f172a]">
              {selectedCardCount} cards selected
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
          aria-label="Close bulk labels"
          title="Close bulk labels"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isContentReady ? (
        <>
          <div className="space-y-3 border-b border-[#e2e8f0] p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search labels..."
                className="h-10 rounded-xl border-[#e2e8f0] bg-[#f8fafc] pl-10 text-sm"
              />
            </div>

            <ScrollArea className="h-[190px] rounded-xl border border-[#e2e8f0] bg-white">
              <div className="p-1.5">
                {filteredLabels.map((label) => {
                  const isSelected = selectedLabelIdSet.has(label.id);
                  const groupName =
                    groupById.get(label.groupId)?.name || "No group";

                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => onToggleLabel(label.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#f1f5f9] ${
                        isSelected
                          ? "bg-[#e8f3fb] text-[#0f172a]"
                          : "text-[#334155]"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          isSelected
                            ? "border-[#166db0] bg-[#166db0] text-white"
                            : "border-[#cbd5e1] bg-white"
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold">
                        {label.name}
                      </span>
                      <span className="max-w-[110px] truncate text-[11px] font-bold uppercase tracking-wide text-[#64748b]">
                        {groupName}
                      </span>
                    </button>
                  );
                })}

                {filteredLabels.length === 0 && (
                  <div className="px-3 py-8 text-center text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
                    No matching labels
                  </div>
                )}
              </div>
            </ScrollArea>

            {selectedLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedLabels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => onToggleLabel(label.id)}
                    className="flex max-w-full items-center gap-1 rounded-full bg-[#f1f5f9] px-2 py-1 text-[11px] font-bold text-[#334155] hover:bg-[#e2e8f0]"
                  >
                    <span className="truncate">{label.name}</span>
                    <X className="h-3 w-3 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={onSave}
                disabled={
                  selectedCardCount === 0 ||
                  selectedLabelIds.length === 0 ||
                  isSaving
                }
                className="h-10 flex-1 rounded-xl bg-[#166db0] text-xs font-black uppercase tracking-wider text-white hover:bg-[#0e4a77]"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClearLabels}
                disabled={selectedLabelIds.length === 0}
                className="h-10 rounded-xl border-[#e2e8f0] px-3 text-xs font-black uppercase tracking-wider"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex gap-2">
              <Input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                onKeyDown={(event) =>
                  event.key === "Enter" && handleCreateGroup()
                }
                placeholder="New group..."
                className="h-9 rounded-xl border-[#e2e8f0] bg-[#f8fafc] text-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || isCreatingGroup}
                className="h-9 rounded-xl border-[#e2e8f0] px-3"
                aria-label="Create group"
                title="Create group"
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-[1fr_128px] gap-2">
              <Input
                value={newLabelName}
                onChange={(event) => setNewLabelName(event.target.value)}
                onKeyDown={(event) =>
                  event.key === "Enter" && handleCreateLabelAndApply()
                }
                placeholder="New label..."
                className="h-9 rounded-xl border-[#e2e8f0] bg-[#f8fafc] text-sm"
              />
              <div className="relative">
                <select
                  aria-label="Select label group"
                  title="Select label group"
                  value={targetGroupId}
                  onChange={(event) => setTargetGroupId(event.target.value)}
                  className="h-9 w-full appearance-none rounded-xl border border-[#e2e8f0] bg-white px-2 pr-8 text-[13px] font-extrabold text-[#334155] outline-none focus:border-[#166db0]"
                >
                  {labelGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
              </div>
            </div>

            <Button
              type="button"
              onClick={handleCreateLabelAndApply}
              disabled={
                !newLabelName.trim() || !targetGroupId || isCreatingLabel
              }
              className="h-10 w-full rounded-xl bg-[#0f172a] text-xs font-black uppercase tracking-wider text-white hover:bg-[#1e293b]"
            >
              <Plus className="mr-1 h-4 w-4" />
              Create Label
            </Button>
          </div>
        </>
      ) : (
        <div className="h-[434px]" aria-hidden="true" />
      )}
    </div>
  );
}
