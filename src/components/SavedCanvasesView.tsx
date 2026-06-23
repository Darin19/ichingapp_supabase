import { useMemo, useState } from "react";
import { SavedCanvas, DeckCard, Label, SpreadCard } from "../types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Trash2,
  Edit2,
  ExternalLink,
  Search,
  Eye,
  Copy,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  db,
  doc,
  setDoc,
  collection,
  query,
  getDocs,
  writeBatch,
} from "../lib/supabaseDb";
import { handleSupabaseError, OperationType } from "../lib/supabaseErrors";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface SavedCanvasesViewProps {
  savedCanvases: SavedCanvas[];
  setSavedCanvases: (
    canvases: SavedCanvas[] | ((prev: SavedCanvas[]) => SavedCanvas[]),
  ) => void;
  cards: DeckCard[];
  labels: Label[];
  onOpenCanvas: (canvas: SavedCanvas) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getCanvasLocalLabels = (canvas: SavedCanvas | null): Label[] => {
  const metadata = canvas?.canvasFileMetadata;
  const customLabels =
    isRecord(metadata) && Array.isArray(metadata.customLabels)
      ? metadata.customLabels
      : [];

  return customLabels.flatMap((label, index) => {
    if (!isRecord(label) || label.source !== "custom") return [];
    const group = label.group;
    if (
      typeof label.id !== "string" ||
      typeof label.name !== "string" ||
      !isRecord(group) ||
      typeof group.id !== "string"
    ) {
      return [];
    }

    return [
      {
        id: label.id,
        name: label.name,
        groupId: group.id,
        sortOrder: index,
      },
    ];
  });
};

export default function SavedCanvasesView({
  savedCanvases,
  setSavedCanvases,
  cards,
  labels,
  onOpenCanvas,
}: SavedCanvasesViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingCanvas, setEditingCanvas] = useState<SavedCanvas | null>(null);
  const [newName, setNewName] = useState("");
  const [canvasToDelete, setCanvasToDelete] = useState<SavedCanvas | null>(
    null,
  );
  const [viewingCanvas, setViewingCanvas] = useState<SavedCanvas | null>(null);
  const [viewingCards, setViewingCards] = useState<SpreadCard[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const effectiveLabels = useMemo(() => {
    const labelMap = new Map(labels.map((label) => [label.id, label]));
    getCanvasLocalLabels(viewingCanvas).forEach((label) => {
      if (!labelMap.has(label.id)) labelMap.set(label.id, label);
    });
    return [...labelMap.values()];
  }, [labels, viewingCanvas]);

  const loadCanvasCards = async (canvas: SavedCanvas) => {
    if (db) {
      try {
        const q = query(collection(db, `canvases/${canvas.id}/cards`));
        const snap = await getDocs(q);
        const fetchedCards = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as SpreadCard,
        );
        return fetchedCards.sort(
          (a, b) => (a.drawSequence || 0) - (b.drawSequence || 0),
        );
      } catch (error) {
        handleSupabaseError(
          error,
          OperationType.GET,
          `canvases/${canvas.id}/cards`,
        );
      }
    }

    return [...(canvas.spreadCards || [])].sort(
      (a, b) => (a.drawSequence || 0) - (b.drawSequence || 0),
    );
  };

  const handleOpenFullCanvas = async (canvas: SavedCanvas) => {
    try {
      const loadedCards = await loadCanvasCards(canvas);
      onOpenCanvas({ ...canvas, spreadCards: loadedCards });
    } catch (error) {
      console.error("Error opening saved canvas:", error);
      toast.error("Failed to open saved canvas");
    }
  };

  const handleOpenDetailPopup = async (canvas: SavedCanvas) => {
    setViewingCanvas(canvas);
    setIsLoadingCards(true);

    try {
      const loadedCards = await loadCanvasCards(canvas);
      setViewingCards(loadedCards);
    } catch (error) {
      console.error("Error fetching canvas cards:", error);
      toast.error("Failed to load canvas cards");
      setViewingCards([]);
    } finally {
      setIsLoadingCards(false);
    }
  };

  const filteredCanvases = savedCanvases.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const commitDeleteRefs = async (refs: any[]) => {
    for (let index = 0; index < refs.length; index += 450) {
      const batch = writeBatch(db);
      refs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  };

  const getDeleteErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return /quota|resource[-_ ]exhausted/i.test(message)
      ? "Supabase quota exceeded. Canvas was not deleted from DB."
      : "Canvas delete failed";
  };

  const handleDelete = async () => {
    if (!canvasToDelete) return;
    const id = canvasToDelete.id;
    const previousCanvases = savedCanvases;
    setCanvasToDelete(null);
    setSavedCanvases((prev) => prev.filter((c) => c.id !== id));
    if (viewingCanvas?.id === id) {
      setViewingCanvas(null);
      setViewingCards([]);
    }

    if (!db) {
      setSavedCanvases(previousCanvases);
      toast.error("Supabase connection is required to delete a saved canvas");
      return;
    }

    try {
      const cardsSnap = await getDocs(collection(db, `canvases/${id}/cards`));
      const refsToDelete = [
        ...cardsSnap.docs.map((cardDoc) => cardDoc.ref),
        doc(db, "canvases", id),
      ];

      await commitDeleteRefs(refsToDelete);
      toast.success("Canvas deleted from Supabase");
    } catch (error) {
      setSavedCanvases(previousCanvases);
      console.error("Delete saved canvas failed:", error);
      toast.error(getDeleteErrorMessage(error));
    }
  };

  const handleRename = async () => {
    if (!editingCanvas || !newName.trim()) return;
    const trimmedName = newName.trim();
    const updated = {
      ...editingCanvas,
      name: trimmedName,
      canvasFileMetadata: isRecord(editingCanvas.canvasFileMetadata)
        ? { ...editingCanvas.canvasFileMetadata, name: trimmedName }
        : editingCanvas.canvasFileMetadata,
    };
    setEditingCanvas(null);

    if (!db) {
      toast.error("Supabase connection is required to rename a saved canvas");
      return;
    }

    try {
      await setDoc(doc(db, "canvases", updated.id), {
        ...updated,
        updatedAt: new Date().toISOString(),
      });
      toast.success("Canvas renamed in Supabase");
    } catch (error) {
      handleSupabaseError(error, OperationType.WRITE, `canvases/${updated.id}`);
    }
  };

  const getCanvasInfo = (cardsList: SpreadCard[]) => {
    return cardsList.map((sc) => {
      const card = cards.find((c) => c.id === sc.cardId);
      const cardLabels = sc.labels
        .map((lId) => effectiveLabels.find((l) => l.id === lId)?.name)
        .filter(Boolean);
      const cardType = card?.deckType || sc.deckType || "iching";
      return {
        number: card?.number,
        vnName: card?.vietnameseName,
        enName: card?.englishName,
        cardType,
        labels: cardLabels.join(", "),
      };
    });
  };

  const copyInfo = (cardsList: SpreadCard[]) => {
    const info = getCanvasInfo(cardsList);
    const text = info
      .map(
        (item, index) =>
          `${index + 1}. ${item.cardType === "iching" ? "Hexagram" : "Tarot"} ${item.number}: ${item.vnName} (${item.enName})${item.labels ? ` - Energy Field: ${item.labels}` : ""}`,
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Info copied to clipboard");
  };

  return (
    <div className="h-full flex flex-col bg-[#f8f9fa]">
      <header className="h-16 border-b border-[#e2e8f0] bg-white flex items-center justify-between px-8 shrink-0 shadow-sm">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <Input
              placeholder="Search saved canvases..."
              className="pl-10 h-10 bg-[#f1f5f9] border-none rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-[#166db0]/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1 p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {filteredCanvases.map((canvas) => (
            <Card
              key={canvas.id}
              className="group h-[190px] border-[#e2e8f0] hover:border-[#166db0] hover:shadow-xl hover:shadow-[#166db0]/5 transition-all duration-300 rounded-2xl overflow-hidden cursor-pointer"
              onDoubleClick={() => handleOpenDetailPopup(canvas)}
            >
              <CardContent className="h-full p-0">
                <div className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-xl bg-[#166db0]/10 text-[#166db0] hover:bg-[#166db0]/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleOpenFullCanvas(canvas);
                        }}
                      >
                        <ExternalLink className="h-5 w-5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-xl bg-[#166db0]/10 text-[#166db0] hover:bg-[#166db0]/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleOpenDetailPopup(canvas);
                        }}
                      >
                        <Eye className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-[#f1f5f9] text-[#495360]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCanvas(canvas);
                          setNewName(canvas.name);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-red-50 text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCanvasToDelete(canvas);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-auto pt-4">
                    <h3 className="min-h-[3.2rem] text-base font-bold leading-6 text-[#0f172a] overflow-hidden line-clamp-2">
                      {canvas.name}
                    </h3>
                    <p className="mt-2 text-[12px] text-[#7d8591] font-bold uppercase tracking-widest">
                      {(canvas as any).cardCount ||
                        canvas.spreadCards?.length ||
                        0}{" "}
                      Cards • {new Date(canvas.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Rename Dialog */}
      <Dialog
        open={!!editingCanvas}
        onOpenChange={(open) => !open && setEditingCanvas(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Canvas</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              placeholder="Enter new name..."
              className="rounded-xl"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!canvasToDelete}
        onOpenChange={(open) => !open && setCanvasToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Canvas</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{canvasToDelete?.name}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCanvasToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail View Dialog */}
      <Dialog
        open={!!viewingCanvas}
        onOpenChange={(open) => {
          if (!open) {
            setViewingCanvas(null);
            setViewingCards([]);
          }
        }}
      >
        <DialogContent
          className="max-w-2xl w-[min(92vw,42rem)] h-[80vh] max-h-[80vh] overflow-hidden p-0 flex flex-col"
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 border-b border-[#e2e8f0] px-6 pt-[22px] pb-[13px]">
            <div className="min-w-0">
              <DialogTitle className="break-words text-xl font-extrabold leading-tight text-[#0f172a]">
                {viewingCanvas?.name}
              </DialogTitle>

              <div className="mt-[5.8px] flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <DialogDescription className="text-[13px] font-bold uppercase tracking-widest text-[#808d9f]">
                  {isLoadingCards
                    ? "Loading cards..."
                    : `${viewingCards.length} Cards`}
                </DialogDescription>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-8 w-[92px] rounded-xl px-0 text-xs font-bold uppercase tracking-wider"
                    onClick={() => viewingCanvas && copyInfo(viewingCards)}
                    disabled={isLoadingCards}
                  >
                    <Copy className="mr-1.5 h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    className="h-8 w-[92px] rounded-xl bg-[#166db0] px-0 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#0e4a77]"
                    onClick={async () => {
                      if (!viewingCanvas) return;
                      const canvasWithCards = {
                        ...viewingCanvas,
                        spreadCards: viewingCards,
                      };
                      onOpenCanvas(canvasWithCards);
                    }}
                    disabled={isLoadingCards}
                  >
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1 bg-white px-6 pt-[8px] pb-4">
            {isLoadingCards ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <RefreshCw className="w-8 h-8 text-[#166db0] animate-spin" />
                <p className="text-xs font-bold text-[#495360] uppercase tracking-widest">
                  Loading cards...
                </p>
              </div>
            ) : (
              <div className="relative -top-px space-y-4 pb-2 pr-[3px]">
                {viewingCanvas?.noteMarkdown?.trim() && (
                  <div className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                    <h4 className="mb-2 text-[12px] font-extrabold uppercase tracking-widest text-[#166db0]">
                      Canvas Note
                    </h4>
                    <div className="space-y-2 text-sm leading-6 text-[#334155] [&_h1]:text-lg [&_h1]:font-extrabold [&_h2]:font-extrabold [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-extrabold">
                      <ReactMarkdown>
                        {viewingCanvas.noteMarkdown}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
                {viewingCanvas &&
                  getCanvasInfo(viewingCards).map((item, index) => (
                    <div
                      key={index}
                      className="relative rounded-2xl border border-[#e2e8f0] bg-[#f8f9fa] px-4 py-3.5 pr-14 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                    >
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-[#166db0] text-[12.5px] font-extrabold text-white shadow-sm ring-2 ring-white">
                        {index + 1}
                      </span>

                      <div className="min-w-0 pt-px">
                        <h4 className="max-w-full break-words pr-1 text-[14.5px] font-bold leading-[1.35] text-[#0f172a] text-pretty">
                          {item.vnName} ({item.number})
                        </h4>
                        <p className="mt-[3px] max-w-full break-words pr-1 text-[12.5px] font-medium leading-[1.45] text-[#495360] text-pretty">
                          {item.enName}
                        </p>
                      </div>

                      {item.labels && (
                        <div className="mt-[11px] flex flex-wrap gap-[7px]">
                          {item.labels.split(", ").map((l, i) => (
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
                  ))}
                {!isLoadingCards && viewingCards.length === 0 && (
                  <div className="py-12 text-center text-[#94a3b8]">
                    <p className="text-sm font-bold uppercase tracking-widest">
                      No cards in this canvas
                    </p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
