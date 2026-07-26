import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, PageSizes, rgb, type RGB } from "pdf-lib";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Upload,
  FileText,
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";

// Shadcn UI Imports
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

type Unit = "mm" | "in" | "pt";
type PageOrder = "rows" | "rows-rtl" | "columns";
type PageSizeName = "A4" | "Letter" | "Legal";
type Orientation = "portrait" | "landscape";

const UNIT_TO_PT: Record<Unit, number> = { pt: 1, mm: 72 / 25.4, in: 72 };

const UNITS: { value: Unit; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "in", label: "in" },
  { value: "pt", label: "pt" },
];

const PAGE_ORDERS: { value: PageOrder; label: string }[] = [
  { value: "rows", label: "Left to right, top to bottom" },
  { value: "rows-rtl", label: "Right to left, top to bottom" },
  { value: "columns", label: "Top to bottom, left to right" },
];

const PAGE_SIZE_NAMES: PageSizeName[] = ["A4", "Letter", "Legal"];

// A thumbnail this wide gives a crisp enough preview without rendering every
// page at full resolution, which would be slow for long documents.
const THUMB_TARGET_PX = 500;
const PREVIEW_CANVAS_WIDTH_PX = 560;
const GUIDE_COLOR = "#3b82f6";

function toPt(value: number, unit: Unit): number {
  return value * UNIT_TO_PT[unit];
}

// Converts a numeric string typed in one unit into the equivalent value in
// another, so switching units doesn't silently change the physical margins.
function convertUnitValue(value: string, from: Unit, to: Unit): string {
  const num = Number(value);
  if (!Number.isFinite(num) || from === to) return value;
  const pt = toPt(num, from);
  return String(Math.round((pt / UNIT_TO_PT[to]) * 100) / 100);
}

function hexToRgbColor(hex: string): RGB {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r || 0, g || 0, b || 0);
}

interface SlotPosition {
  row: number;
  col: number;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Layout {
  sheetWidth: number;
  sheetHeight: number;
  rows: number;
  cols: number;
  marginPt: number;
  gutterPt: number;
  cropPt: number;
  cellWidth: number;
  cellHeight: number;
  perSheet: number;
  slotPositions: SlotPosition[];
}

// The order source pages fill grid slots in, for a single sheet.
function getSlotPositions(
  rows: number,
  cols: number,
  order: PageOrder,
): SlotPosition[] {
  const positions: SlotPosition[] = [];
  if (order === "columns") {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) positions.push({ row: r, col: c });
    }
    return positions;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({ row: r, col: order === "rows-rtl" ? cols - 1 - c : c });
    }
  }
  return positions;
}

function computeLayout(input: {
  rows: number;
  cols: number;
  marginPt: number;
  gutterPt: number;
  cropPt: number;
  pageSizeName: PageSizeName;
  orientation: Orientation;
  order: PageOrder;
}): Layout {
  const [baseWidth, baseHeight] = PageSizes[input.pageSizeName];
  const sheetWidth = input.orientation === "landscape" ? baseHeight : baseWidth;
  const sheetHeight = input.orientation === "landscape" ? baseWidth : baseHeight;
  const cellWidth = Math.max(
    (sheetWidth - 2 * input.marginPt - (input.cols - 1) * input.gutterPt) /
      input.cols,
    1,
  );
  const cellHeight = Math.max(
    (sheetHeight - 2 * input.marginPt - (input.rows - 1) * input.gutterPt) /
      input.rows,
    1,
  );
  return {
    sheetWidth,
    sheetHeight,
    rows: input.rows,
    cols: input.cols,
    marginPt: input.marginPt,
    gutterPt: input.gutterPt,
    cropPt: input.cropPt,
    cellWidth,
    cellHeight,
    perSheet: input.rows * input.cols,
    slotPositions: getSlotPositions(input.rows, input.cols, input.order),
  };
}

// Cell bounds, measured from the sheet's top-left corner — shared by both
// the on-screen preview (already top-down) and the final PDF (flipped to
// pdf-lib's bottom-up coordinates at the point of drawing).
function getCellRect(row: number, col: number, layout: Layout): Rect {
  return {
    left: layout.marginPt + col * (layout.cellWidth + layout.gutterPt),
    top: layout.marginPt + row * (layout.cellHeight + layout.gutterPt),
    width: layout.cellWidth,
    height: layout.cellHeight,
  };
}

// The crop can never exceed half of either page dimension, or the resulting
// box would be inverted (or vanish entirely).
function clampCrop(cropPt: number, pageWidth: number, pageHeight: number): number {
  return Math.max(0, Math.min(cropPt, pageWidth / 2 - 1, pageHeight / 2 - 1));
}

interface CoverCrop {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Applies the user's uniform crop inset, then trims further on whichever
// axis has excess so the remaining content's aspect ratio exactly matches
// the cell's. Drawing that remainder at the cell's own bounds then fills it
// edge-to-edge — no letterboxing gap, regardless of gutter or crop inset.
function coverCrop(
  cell: Rect,
  pageWidth: number,
  pageHeight: number,
  uniformCrop: number,
): CoverCrop {
  const crop = clampCrop(uniformCrop, pageWidth, pageHeight);
  let left = crop;
  let right = crop;
  let top = crop;
  let bottom = crop;
  const contentWidth = pageWidth - left - right;
  const contentHeight = pageHeight - top - bottom;
  const cellAspect = cell.width / cell.height;
  const contentAspect = contentWidth / contentHeight;

  if (contentAspect > cellAspect) {
    const keepWidth = contentHeight * cellAspect;
    const extra = (contentWidth - keepWidth) / 2;
    left += extra;
    right += extra;
  } else if (contentAspect < cellAspect) {
    const keepHeight = contentWidth / cellAspect;
    const extra = (contentHeight - keepHeight) / 2;
    top += extra;
    bottom += extra;
  }

  return { left, right, top, bottom };
}

interface PageThumb {
  canvas: HTMLCanvasElement;
  widthPt: number;
  heightPt: number;
}

// Draws a dashed cell outline and a numbered (or "empty") badge over a
// preview slot. Purely a screen aid — this never runs during export, since
// buildOutputPdf has no knowledge of it.
function drawSlotGuide(
  ctx: CanvasRenderingContext2D,
  cellPx: Rect,
  pageNumber: number,
  filled: boolean,
) {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cellPx.left + 1, cellPx.top + 1, cellPx.width - 2, cellPx.height - 2);
  ctx.restore();

  const label = filled ? String(pageNumber) : "—";
  const radius = 11;
  const cx = cellPx.left + radius + 5;
  const cy = cellPx.top + radius + 5;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = filled ? GUIDE_COLOR : "#9ca3af";
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 1);
}

async function renderPageThumbs(
  bytes: Uint8Array,
  srcDoc: PDFDocument,
): Promise<PageThumb[]> {
  const pdf = await getDocument({ data: bytes }).promise;
  const thumbs: PageThumb[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const srcPage = srcDoc.getPage(i - 1);
    const widthPt = srcPage.getWidth();
    const heightPt = srcPage.getHeight();
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = THUMB_TARGET_PX / Math.max(baseViewport.width, baseViewport.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    thumbs.push({ canvas, widthPt, heightPt });
  }
  return thumbs;
}

async function buildOutputPdf(
  srcDoc: PDFDocument,
  layout: Layout,
  divider: { show: boolean; color: RGB; width: number },
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create();
  const pageCount = srcDoc.getPageCount();
  const sheetCount = Math.max(1, Math.ceil(pageCount / layout.perSheet));

  for (let sheet = 0; sheet < sheetCount; sheet++) {
    const outPage = outDoc.addPage([layout.sheetWidth, layout.sheetHeight]);

    for (let slot = 0; slot < layout.perSheet; slot++) {
      const { row, col } = layout.slotPositions[slot];
      const cell = getCellRect(row, col, layout);

      if (divider.show) {
        outPage.drawRectangle({
          x: cell.left,
          y: layout.sheetHeight - cell.top - cell.height,
          width: cell.width,
          height: cell.height,
          borderColor: divider.color,
          borderWidth: divider.width,
        });
      }

      const srcIndex = sheet * layout.perSheet + slot;
      if (srcIndex >= pageCount) continue;

      const srcPage = srcDoc.getPage(srcIndex);
      const pageWidth = srcPage.getWidth();
      const pageHeight = srcPage.getHeight();
      const { left, right, top, bottom } = coverCrop(
        cell,
        pageWidth,
        pageHeight,
        layout.cropPt,
      );

      const embedded = await outDoc.embedPage(srcPage, {
        left,
        bottom,
        right: pageWidth - right,
        top: pageHeight - top,
      });

      outPage.drawPage(embedded, {
        x: cell.left,
        y: layout.sheetHeight - cell.top - cell.height,
        width: cell.width,
        height: cell.height,
      });
    }
  }

  return outDoc.save();
}

function ColorSwatchInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 border rounded-md px-2 h-9 bg-background ${disabled ? "opacity-50" : ""}`}
    >
      <input
        id={id}
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-5 h-5 rounded-md border cursor-pointer p-0 bg-transparent shrink-0 disabled:cursor-not-allowed"
      />
      <span className="text-[11px] font-mono uppercase tracking-tighter overflow-hidden text-ellipsis whitespace-nowrap">
        {value}
      </span>
    </div>
  );
}

const STORAGE_KEY = "pdf-n-up-maker:settings";

interface PersistedSettings {
  rows: string;
  cols: string;
  order: PageOrder;
  unit: Unit;
  pageSizeName: PageSizeName;
  orientation: Orientation;
  margin: string;
  gutter: string;
  cropInset: string;
  showDividers: boolean;
  dividerColor: string;
  dividerWidth: string;
  // Preview-only from here down — read by the canvas draw effect and never
  // passed to buildOutputPdf, so it can't affect the exported file.
  showGuides: boolean;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  rows: "2",
  cols: "2",
  order: "rows",
  unit: "mm",
  pageSizeName: "A4",
  orientation: "portrait",
  margin: "10",
  gutter: "5",
  cropInset: "0",
  showDividers: false,
  dividerColor: "#000000",
  dividerWidth: "1",
  showGuides: true,
};

function loadPersistedSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function PdfNUpMaker() {
  const initialSettings = useMemo(() => loadPersistedSettings(), []);

  const [rows, setRows] = useState<string>(initialSettings.rows);
  const [cols, setCols] = useState<string>(initialSettings.cols);
  const [order, setOrder] = useState<PageOrder>(initialSettings.order);
  const [unit, setUnit] = useState<Unit>(initialSettings.unit);
  const [pageSizeName, setPageSizeName] = useState<PageSizeName>(
    initialSettings.pageSizeName,
  );
  const [orientation, setOrientation] = useState<Orientation>(
    initialSettings.orientation,
  );
  const [margin, setMargin] = useState<string>(initialSettings.margin);
  const [gutter, setGutter] = useState<string>(initialSettings.gutter);
  const [cropInset, setCropInset] = useState<string>(initialSettings.cropInset);
  const [showDividers, setShowDividers] = useState<boolean>(
    initialSettings.showDividers,
  );
  const [dividerColor, setDividerColor] = useState<string>(
    initialSettings.dividerColor,
  );
  const [dividerWidth, setDividerWidth] = useState<string>(
    initialSettings.dividerWidth,
  );
  const [showGuides, setShowGuides] = useState<boolean>(
    initialSettings.showGuides,
  );

  const [fileName, setFileName] = useState<string | null>(null);
  const [pageThumbs, setPageThumbs] = useState<PageThumb[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const srcDocRef = useRef<PDFDocument | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const settings: PersistedSettings = {
      rows,
      cols,
      order,
      unit,
      pageSizeName,
      orientation,
      margin,
      gutter,
      cropInset,
      showDividers,
      dividerColor,
      dividerWidth,
      showGuides,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage may be unavailable (private browsing, quota) — safe to ignore
    }
  }, [
    rows,
    cols,
    order,
    unit,
    pageSizeName,
    orientation,
    margin,
    gutter,
    cropInset,
    showDividers,
    dividerColor,
    dividerWidth,
    showGuides,
  ]);

  const resetSettings = () => {
    setRows(DEFAULT_SETTINGS.rows);
    setCols(DEFAULT_SETTINGS.cols);
    setOrder(DEFAULT_SETTINGS.order);
    setUnit(DEFAULT_SETTINGS.unit);
    setPageSizeName(DEFAULT_SETTINGS.pageSizeName);
    setOrientation(DEFAULT_SETTINGS.orientation);
    setMargin(DEFAULT_SETTINGS.margin);
    setGutter(DEFAULT_SETTINGS.gutter);
    setCropInset(DEFAULT_SETTINGS.cropInset);
    setShowDividers(DEFAULT_SETTINGS.showDividers);
    setDividerColor(DEFAULT_SETTINGS.dividerColor);
    setDividerWidth(DEFAULT_SETTINGS.dividerWidth);
    setShowGuides(DEFAULT_SETTINGS.showGuides);
  };

  const handleUnitChange = (nextUnit: Unit) => {
    setMargin((v) => convertUnitValue(v, unit, nextUnit));
    setGutter((v) => convertUnitValue(v, unit, nextUnit));
    setCropInset((v) => convertUnitValue(v, unit, nextUnit));
    setUnit(nextUnit);
  };

  const layout = useMemo(
    () =>
      computeLayout({
        rows: Math.max(1, Math.round(Number(rows)) || 1),
        cols: Math.max(1, Math.round(Number(cols)) || 1),
        marginPt: toPt(Number(margin) || 0, unit),
        gutterPt: toPt(Number(gutter) || 0, unit),
        cropPt: toPt(Number(cropInset) || 0, unit),
        pageSizeName,
        orientation,
        order,
      }),
    [rows, cols, margin, gutter, cropInset, unit, pageSizeName, orientation, order],
  );

  const sheetCount =
    pageThumbs.length > 0
      ? Math.max(1, Math.ceil(pageThumbs.length / layout.perSheet))
      : 1;
  const clampedSheetIndex = Math.min(sheetIndex, sheetCount - 1);

  const layoutError =
    layout.cellWidth <= 1 || layout.cellHeight <= 1
      ? "Margins and gutter leave no room for content — reduce them."
      : null;

  const readFile = async (file: File) => {
    setError(null);
    setIsLoadingFile(true);
    try {
      const buffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(buffer);
      const thumbs = await renderPageThumbs(new Uint8Array(buffer.slice(0)), srcDoc);
      srcDocRef.current = srcDoc;
      setPageThumbs(thumbs);
      setFileName(file.name);
      setSheetIndex(0);
    } catch (err) {
      console.error("Failed to load PDF", err);
      setError(err instanceof Error ? err.message : "Could not read this PDF");
      srcDocRef.current = null;
      setPageThumbs([]);
      setFileName(null);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void readFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") void readFile(file);
  };

  const clearFile = () => {
    srcDocRef.current = null;
    setPageThumbs([]);
    setFileName(null);
    setError(null);
  };

  // Redraw the preview whenever the sheet's contents or the layout settings
  // change — cheap, since it only draws already-rendered page thumbnails.
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    canvas.width = PREVIEW_CANVAS_WIDTH_PX;
    canvas.height = Math.round(
      PREVIEW_CANVAS_WIDTH_PX * (layout.sheetHeight / layout.sheetWidth),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const previewScale = canvas.width / layout.sheetWidth;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = dividerColor;
    ctx.lineWidth = Math.max(1, (Number(dividerWidth) || 1) * previewScale);

    for (let slot = 0; slot < layout.perSheet; slot++) {
      const { row, col } = layout.slotPositions[slot];
      const cell = getCellRect(row, col, layout);
      const cellPx = {
        left: cell.left * previewScale,
        top: cell.top * previewScale,
        width: cell.width * previewScale,
        height: cell.height * previewScale,
      };

      if (showDividers) {
        ctx.strokeRect(cellPx.left, cellPx.top, cellPx.width, cellPx.height);
      }

      const srcIndex = clampedSheetIndex * layout.perSheet + slot;
      const thumb = pageThumbs[srcIndex];

      if (thumb) {
        const { left, right, top, bottom } = coverCrop(
          cell,
          thumb.widthPt,
          thumb.heightPt,
          layout.cropPt,
        );
        const pxPerPt = thumb.canvas.width / thumb.widthPt;
        const sx = left * pxPerPt;
        const sy = top * pxPerPt;
        const sw = thumb.canvas.width - (left + right) * pxPerPt;
        const sh = thumb.canvas.height - (top + bottom) * pxPerPt;

        ctx.drawImage(
          thumb.canvas,
          sx,
          sy,
          sw,
          sh,
          cellPx.left,
          cellPx.top,
          cellPx.width,
          cellPx.height,
        );
      }

      if (showGuides) drawSlotGuide(ctx, cellPx, srcIndex + 1, !!thumb);
    }
  }, [
    layout,
    pageThumbs,
    clampedSheetIndex,
    showDividers,
    dividerColor,
    dividerWidth,
    showGuides,
  ]);

  const timestampedFilename = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    return `n-up-${timestamp}`;
  };

  const handleDownload = async () => {
    const srcDoc = srcDocRef.current;
    if (!srcDoc) return;
    setIsGenerating(true);
    setError(null);
    try {
      const bytes = await buildOutputPdf(srcDoc, layout, {
        show: showDividers,
        color: hexToRgbColor(dividerColor),
        width: Number(dividerWidth) || 1,
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${timestampedFilename()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate PDF", err);
      setError(err instanceof Error ? err.message : "Could not generate the PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1 md:h-[calc(100svh-6rem)]">
      {/* LEFT COLUMN: Upload & Configuration */}
      <Card className="flex flex-col overflow-hidden h-full gap-0 py-0">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Configure
          </CardTitle>
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={resetSettings}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Default Options
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="p-4 flex flex-col gap-4 bg-muted/5 min-h-0 overflow-y-auto">
          {/* Upload */}
          <div className="space-y-2">
            <Label>PDF File</Label>
            {fileName ? (
              <div className="flex items-center gap-2 border rounded-md px-3 h-9 bg-background">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs truncate">{fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {pageThumbs.length} page{pageThumbs.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center gap-1.5 border border-dashed rounded-md px-3 py-6 text-center cursor-pointer bg-background hover:bg-muted/50 transition-colors"
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs">
                  {isLoadingFile ? "Loading…" : "Click or drop a PDF here"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Stays in your browser — nothing is uploaded
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <Separator />

          {/* Grid */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="rows">Rows</Label>
                <Input
                  id="rows"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={rows}
                  onChange={(e) => setRows(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cols">Columns</Label>
                <Input
                  id="cols"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={cols}
                  onChange={(e) => setCols(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Label>Page Order</Label>
              <Select value={order} onValueChange={(v) => setOrder(v as PageOrder)}>
                <SelectTrigger className="bg-background w-full">
                  <SelectValue placeholder="Order">
                    {(value: PageOrder) =>
                      PAGE_ORDERS.find((o) => o.value === value)?.label ?? value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAGE_ORDERS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Output sheet */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Page Size</Label>
              <Select
                value={pageSizeName}
                onValueChange={(v) => setPageSizeName(v as PageSizeName)}
              >
                <SelectTrigger className="bg-background w-full">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Orientation</Label>
              <Select
                value={orientation}
                onValueChange={(v) => setOrientation(v as Orientation)}
              >
                <SelectTrigger className="bg-background w-full">
                  <SelectValue placeholder="Orientation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Spacing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Spacing</Label>
              <Select value={unit} onValueChange={(v) => handleUnitChange(v as Unit)}>
                <SelectTrigger className="bg-background w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="margin" className="text-[11px]">
                  Page margin
                </Label>
                <Input
                  id="margin"
                  type="number"
                  min={0}
                  step={unit === "pt" ? 1 : 0.5}
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gutter" className="text-[11px]">
                  Gutter
                </Label>
                <Input
                  id="gutter"
                  type="number"
                  min={0}
                  step={unit === "pt" ? 1 : 0.5}
                  value={gutter}
                  onChange={(e) => setGutter(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crop" className="text-[11px]">
                  Crop inset
                </Label>
                <Input
                  id="crop"
                  type="number"
                  min={0}
                  step={unit === "pt" ? 1 : 0.5}
                  value={cropInset}
                  onChange={(e) => setCropInset(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Each page fills its cell completely, trimming as needed to
              match its shape. Crop inset adds an extra trim on top of that —
              use it to cut away a page's own existing margin so the combined
              sheet doesn't end up with doubled-up whitespace.
            </p>
          </div>

          <Separator />

          {/* Dividers */}
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-end">
            <div className="flex items-center gap-2 h-9 pr-1">
              <input
                id="show-dividers"
                type="checkbox"
                checked={showDividers}
                onChange={(e) => setShowDividers(e.target.checked)}
                className="h-4 w-4 rounded border cursor-pointer accent-foreground"
              />
              <Label
                htmlFor="show-dividers"
                className="cursor-pointer font-normal whitespace-nowrap"
              >
                Divider lines
              </Label>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="divider-color"
                className={!showDividers ? "text-muted-foreground" : undefined}
              >
                Color
              </Label>
              <ColorSwatchInput
                id="divider-color"
                value={dividerColor}
                disabled={!showDividers}
                onChange={setDividerColor}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="divider-width"
                className={!showDividers ? "text-muted-foreground" : undefined}
              >
                Width (pt)
              </Label>
              <Input
                id="divider-width"
                type="number"
                min={0.5}
                max={8}
                step={0.5}
                value={dividerWidth}
                disabled={!showDividers}
                onChange={(e) => setDividerWidth(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RIGHT COLUMN: Preview & Export */}
      <Card className="flex flex-col overflow-hidden h-full gap-0 py-0">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Preview
          </CardTitle>
          {pageThumbs.length > 0 && sheetCount > 1 && (
            <CardAction className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={clampedSheetIndex === 0}
                onClick={() => setSheetIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                Sheet {clampedSheetIndex + 1} / {sheetCount}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={clampedSheetIndex >= sheetCount - 1}
                onClick={() =>
                  setSheetIndex((i) => Math.min(sheetCount - 1, i + 1))
                }
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </CardAction>
          )}
        </CardHeader>

        {pageThumbs.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
            <input
              id="show-guides"
              type="checkbox"
              checked={showGuides}
              onChange={(e) => setShowGuides(e.target.checked)}
              className="h-4 w-4 rounded border cursor-pointer accent-foreground"
            />
            <Label
              htmlFor="show-guides"
              className="cursor-pointer font-normal text-xs whitespace-nowrap"
            >
              Guide overlay
            </Label>
            <span className="text-[11px] text-muted-foreground">
              — cell outlines &amp; page numbers, preview only, never exported
            </span>
          </div>
        )}

        <div className="flex-1 min-h-[240px] p-6 flex items-center justify-center overflow-auto bg-muted/30">
          {pageThumbs.length > 0 ? (
            <canvas
              ref={previewCanvasRef}
              className="max-w-full max-h-full shadow-sm border border-border/50"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="h-6 w-6" />
              <span className="text-xs">Upload a PDF to preview the layout</span>
            </div>
          )}
        </div>

        {(error || layoutError) && (
          <div className="px-4 py-2.5 flex items-start gap-2 text-xs text-destructive bg-destructive/10 border-t border-destructive/20 max-h-24 overflow-y-auto">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error ?? layoutError}</span>
          </div>
        )}

        <Separator />

        <CardContent className="p-4 space-y-3 bg-muted/5">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>
              {layout.cols}×{layout.rows} per sheet
            </span>
            <span>
              {Math.round(layout.sheetWidth)}×{Math.round(layout.sheetHeight)}pt
            </span>
          </div>

          <Button
            size="sm"
            className="w-full h-8 gap-1.5 text-xs"
            disabled={!fileName || !!layoutError || isGenerating}
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            {isGenerating ? "Generating…" : "Download PDF"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
