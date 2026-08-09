import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, PageSizes } from "pdf-lib";
import { Upload, ImageIcon, X, Download, AlertTriangle } from "lucide-react";

// Shadcn UI Imports
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Unit = "mm" | "in" | "pt";
type PageSizeName = "A4" | "A3";
type Orientation = "portrait" | "landscape";

const UNIT_TO_PT: Record<Unit, number> = { pt: 1, mm: 72 / 25.4, in: 72 };

const UNITS: { value: Unit; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "in", label: "in" },
  { value: "pt", label: "pt" },
];

const PAGE_SIZE_NAMES: PageSizeName[] = ["A4", "A3"];

const PREVIEW_CANVAS_WIDTH_PX = 560;

function toPt(value: number, unit: Unit): number {
  return value * UNIT_TO_PT[unit];
}

// Converts a numeric string typed in one unit into the equivalent value in
// another, so switching units doesn't silently change the physical margin.
function convertUnitValue(value: string, from: Unit, to: Unit): string {
  const num = Number(value);
  if (!Number.isFinite(num) || from === to) return value;
  const pt = toPt(num, from);
  return String(Math.round((pt / UNIT_TO_PT[to]) * 100) / 100);
}

interface LoadedImage {
  bitmap: ImageBitmap;
  name: string;
}

// Re-encodes any loaded image as PNG bytes via canvas, so embedding into the
// PDF doesn't depend on matching pdf-lib's narrow embedPng/embedJpg formats
// to the original file type (which may be webp, gif, a screenshot, etc.).
async function bitmapToPngBytes(bitmap: ImageBitmap): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode image");
  return new Uint8Array(await blob.arrayBuffer());
}

interface Layout {
  sheetWidth: number;
  sheetHeight: number;
  marginPt: number;
}

function computeLayout(
  pageSizeName: PageSizeName,
  orientation: Orientation,
  marginPt: number,
): Layout {
  const [baseWidth, baseHeight] = PageSizes[pageSizeName];
  const sheetWidth = orientation === "landscape" ? baseHeight : baseWidth;
  const sheetHeight = orientation === "landscape" ? baseWidth : baseHeight;
  return { sheetWidth, sheetHeight, marginPt };
}

// Largest box that fits the image's aspect ratio inside the page's margin
// box, centered on the page.
function fitImageRect(layout: Layout, imageWidth: number, imageHeight: number) {
  const boxWidth = Math.max(layout.sheetWidth - 2 * layout.marginPt, 1);
  const boxHeight = Math.max(layout.sheetHeight - 2 * layout.marginPt, 1);
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (layout.sheetWidth - width) / 2,
    y: (layout.sheetHeight - height) / 2,
    width,
    height,
  };
}

const STORAGE_KEY = "image-to-pdf:settings";

interface PersistedSettings {
  unit: Unit;
  pageSizeName: PageSizeName;
  orientation: Orientation;
  margin: string;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  unit: "mm",
  pageSizeName: "A4",
  orientation: "portrait",
  margin: "10",
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

export default function ImageToPdf() {
  const initialSettings = useMemo(() => loadPersistedSettings(), []);

  const [unit, setUnit] = useState<Unit>(initialSettings.unit);
  const [pageSizeName, setPageSizeName] = useState<PageSizeName>(
    initialSettings.pageSizeName,
  );
  const [orientation, setOrientation] = useState<Orientation>(
    initialSettings.orientation,
  );
  const [margin, setMargin] = useState<string>(initialSettings.margin);

  const [image, setImage] = useState<LoadedImage | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const settings: PersistedSettings = { unit, pageSizeName, orientation, margin };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage may be unavailable (private browsing, quota) — safe to ignore
    }
  }, [unit, pageSizeName, orientation, margin]);

  const handleUnitChange = (nextUnit: Unit) => {
    setMargin((v) => convertUnitValue(v, unit, nextUnit));
    setUnit(nextUnit);
  };

  const layout = useMemo(
    () => computeLayout(pageSizeName, orientation, toPt(Number(margin) || 0, unit)),
    [pageSizeName, orientation, margin, unit],
  );

  const layoutError =
    layout.sheetWidth - 2 * layout.marginPt <= 1 ||
    layout.sheetHeight - 2 * layout.marginPt <= 1
      ? "Margin leaves no room for the image — reduce it."
      : null;

  const loadImage = async (file: File | Blob, name: string) => {
    setError(null);
    setIsLoadingImage(true);
    try {
      const bitmap = await createImageBitmap(file);
      setImage({ bitmap, name });
    } catch (err) {
      console.error("Failed to load image", err);
      setError(err instanceof Error ? err.message : "Could not read this image");
      setImage(null);
    } finally {
      setIsLoadingImage(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void loadImage(file, file.name);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) void loadImage(file, file.name);
  };

  const clearImage = () => {
    setImage(null);
    setError(null);
  };

  // Lets the user paste an image straight from the clipboard anywhere on
  // the page, without needing to focus a specific input first.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file) void loadImage(file, "Pasted image");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Redraw the preview whenever the image or layout settings change.
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

    if (image) {
      const rect = fitImageRect(layout, image.bitmap.width, image.bitmap.height);
      ctx.drawImage(
        image.bitmap,
        rect.x * previewScale,
        rect.y * previewScale,
        rect.width * previewScale,
        rect.height * previewScale,
      );
    }
  }, [layout, image]);

  const timestampedFilename = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    return `image-to-pdf-${timestamp}`;
  };

  const handleDownload = async () => {
    if (!image) return;
    setIsGenerating(true);
    setError(null);
    try {
      const bytes = await bitmapToPngBytes(image.bitmap);
      const outDoc = await PDFDocument.create();
      const embedded = await outDoc.embedPng(bytes);

      const page = outDoc.addPage([layout.sheetWidth, layout.sheetHeight]);
      const rect = fitImageRect(layout, image.bitmap.width, image.bitmap.height);
      page.drawImage(embedded, rect);

      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as BlobPart], { type: "application/pdf" });
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
        </CardHeader>

        <CardContent className="p-4 flex flex-col gap-4 bg-muted/5 min-h-0 overflow-y-auto">
          {/* Upload */}
          <div className="space-y-2">
            <Label>Image</Label>
            {image ? (
              <div className="flex items-center gap-2 border rounded-md px-3 h-9 bg-background">
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs truncate">{image.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {image.bitmap.width}×{image.bitmap.height}
                </span>
                <button
                  type="button"
                  onClick={clearImage}
                  className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Remove image"
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
                  {isLoadingImage
                    ? "Loading…"
                    : "Click or drop an image here, or paste (Ctrl/Cmd+V)"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Stays in your browser — nothing is uploaded
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            )}
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

          {/* Margin */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="margin">Margin</Label>
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
        </CardContent>
      </Card>

      {/* RIGHT COLUMN: Preview & Export */}
      <Card className="flex flex-col overflow-hidden h-full gap-0 py-0">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Preview
          </CardTitle>
        </CardHeader>

        <div className="flex-1 min-h-[240px] p-6 flex items-center justify-center overflow-auto bg-muted/30">
          {image ? (
            <canvas
              ref={previewCanvasRef}
              className="max-w-full max-h-full shadow-sm border border-border/50"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">Add an image to preview the layout</span>
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
              {pageSizeName} {orientation}
            </span>
            <span>
              {Math.round(layout.sheetWidth)}×{Math.round(layout.sheetHeight)}pt
            </span>
          </div>

          <Button
            size="sm"
            className="w-full h-8 gap-1.5 text-xs"
            disabled={!image || !!layoutError || isGenerating}
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
