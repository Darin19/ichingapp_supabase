import { useId, useRef, useState, type ChangeEvent } from "react";
import { Download, FileDown, FileJson, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { DeckCard, Label, LabelGroup } from "../types";
import {
  CANVAS_FILE_MAX_BYTES,
  CanvasFileValidationError,
  createImportPlan,
  formatCanvasFileError,
  parseCanvasFileText,
  type ImportPlan,
} from "../features/canvas-file";

type CanvasFileMenuProps = {
  cards: DeckCard[];
  labels: Label[];
  labelGroups: LabelGroup[];
  onReplaceCanvas: (plan: ImportPlan) => Promise<void>;
  onExport: () => void;
  onDownloadSample: () => void;
};

type ImportPreview = {
  fileName: string;
  fileSize: number;
  plan: ImportPlan;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
};

export default function CanvasFileMenu({
  cards,
  labels,
  labelGroups,
  onReplaceCanvas,
  onExport,
  onDownloadSample,
}: CanvasFileMenuProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportError(null);
    setPreview(null);

    try {
      if (file.size > CANVAS_FILE_MAX_BYTES) {
        throw new CanvasFileValidationError([
          `File vượt quá giới hạn 5 MiB (${formatBytes(file.size)}).`,
        ]);
      }

      const parsed = parseCanvasFileText(await file.text());
      const plan = createImportPlan(parsed, { cards, labels, labelGroups });
      setPreview({ fileName: file.name, fileSize: file.size, plan });
    } catch (error) {
      const message = formatCanvasFileError(error);
      setImportError(message);
      toast.error("Canvas file is not valid");
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (isReplacing) return;
    if (!open) {
      setPreview(null);
      setImportError(null);
    }
  };

  const handleReplaceCanvas = async () => {
    if (!preview || isReplacing) return;

    setIsReplacing(true);
    setImportError(null);
    try {
      await onReplaceCanvas(preview.plan);
      setPreview(null);
    } catch (error) {
      setImportError(formatCanvasFileError(error));
    } finally {
      setIsReplacing(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="bg-white/90 backdrop-blur-md border-[#e2e8f0] rounded-xl shadow-lg shadow-black/5 font-bold text-xs uppercase tracking-wider gap-2 h-10 px-4 hover:bg-[#166db0] hover:text-white hover:border-[#166db0] transition-all"
            />
          }
        >
          <FileJson className="w-4 h-4" />
          Canvas File
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[190px] rounded-xl border border-[#e2e8f0] bg-white p-1.5 text-[#0f172a] shadow-2xl"
        >
          <DropdownMenuItem
            onClick={handleImportClick}
            className="gap-2 rounded-lg px-2.5 py-2 text-xs font-bold"
          >
            <Upload className="h-4 w-4 text-[#166db0]" />
            Import JSON
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onExport}
            className="gap-2 rounded-lg px-2.5 py-2 text-xs font-bold"
          >
            <Download className="h-4 w-4 text-[#166db0]" />
            Export JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDownloadSample}
            className="gap-2 rounded-lg px-2.5 py-2 text-xs font-bold"
          >
            <FileDown className="h-4 w-4 text-[#166db0]" />
            Download Sample
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <label htmlFor={fileInputId} className="sr-only">
        Import canvas JSON file
      </label>
      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        aria-label="Import canvas JSON file"
        title="Import canvas JSON file"
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog
        open={Boolean(preview || importError)}
        onOpenChange={handleDialogOpenChange}
      >
        <DialogContent className="w-[min(640px,calc(100vw-2rem))] max-w-none">
          <DialogHeader>
            <DialogTitle>Import Canvas File</DialogTitle>
            <DialogDescription>
              Import sẽ replace toàn bộ Canvas hiện tại sau khi lưu atomic vào
              Supabase. Deck state hiện tại được giữ nguyên.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <div className="text-sm font-extrabold text-[#0f172a]">
                  {preview.plan.metadata.name}
                </div>
                <div className="mt-1 text-xs font-semibold text-[#64748b]">
                  {preview.fileName} · {formatBytes(preview.fileSize)}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#64748b]">
                      Cards
                    </div>
                    <div className="text-lg font-black text-[#166db0]">
                      {preview.plan.counts.cards}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#64748b]">
                      Master labels
                    </div>
                    <div className="text-lg font-black text-[#166db0]">
                      {preview.plan.counts.masterLabels}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#64748b]">
                      Custom labels
                    </div>
                    <div className="text-lg font-black text-[#166db0]">
                      {preview.plan.counts.customLabels}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#64748b]">
                      Relations
                    </div>
                    <div className="text-lg font-black text-[#166db0]">
                      {preview.plan.counts.relations}
                    </div>
                  </div>
                </div>
              </div>

              {preview.plan.warnings.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-800">
                    Warnings
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-amber-900">
                    {preview.plan.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {importError && (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              {importError}
            </pre>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={isReplacing}
            >
              Cancel
            </Button>
            {preview && (
              <Button
                type="button"
                onClick={handleReplaceCanvas}
                disabled={isReplacing}
                className="bg-[#166db0] text-white hover:bg-[#0e4a77]"
              >
                {isReplacing && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                Replace Canvas
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
