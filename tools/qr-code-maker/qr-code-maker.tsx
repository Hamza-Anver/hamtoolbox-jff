import { useEffect, useMemo, useRef, useState } from "react";
import QRCodeStyling, {
  type Options,
  type DotType,
  type ErrorCorrectionLevel,
} from "qr-code-styling";
import qrcodeGenerator from "qrcode-generator";
import { toPng, toSvg } from "html-to-image";
import {
  Check,
  Copy,
  Image as ImageIcon,
  FileCode,
  ClipboardCopy,
  AlertTriangle,
  RotateCcw,
  ImagePlus,
  X,
} from "lucide-react";

// Shadcn UI Imports
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

// cornersSquareOptions.type and cornersDotOptions.type accept the same
// underlying union in qr-code-styling — one selector drives both so square
// and dot corners always stay visually matched.
type CornerStyle =
  | "square"
  | "dot"
  | "extra-rounded"
  | "rounded"
  | "dots"
  | "classy"
  | "classy-rounded";

type LogoMode = "none" | "upload" | "url" | "emoji" | "text";

type CaptionPosition = "none" | "top" | "bottom";

// The three generic font families Tailwind ships out of the box — font-sans
// resolves to this project's Inter theme, font-serif/font-mono fall back to
// the platform's own serif/monospace stacks. No new font assets needed.
type CaptionFont = "sans" | "serif" | "mono";

const DOT_STYLES: DotType[] = [
  "square",
  "rounded",
  "dots",
  "classy",
  "classy-rounded",
  "extra-rounded",
];

const CORNER_STYLES: CornerStyle[] = [
  "square",
  "dot",
  "extra-rounded",
  "rounded",
  "dots",
  "classy",
  "classy-rounded",
];

const ERROR_LEVELS: { value: ErrorCorrectionLevel; label: string }[] = [
  { value: "L", label: "Low (7%)" },
  { value: "M", label: "Medium (15%)" },
  { value: "Q", label: "Quartile (25%)" },
  { value: "H", label: "High (30%)" },
];

const LOGO_MODES: { value: LogoMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "upload", label: "Uploaded Image" },
  { value: "url", label: "Image URL" },
  { value: "emoji", label: "Emoji" },
  { value: "text", label: "Text / Letter" },
];

const CAPTION_POSITIONS: { value: CaptionPosition; label: string }[] = [
  { value: "none", label: "None" },
  { value: "top", label: "Above" },
  { value: "bottom", label: "Below" },
];

const CAPTION_FONTS: { value: CaptionFont; label: string; className: string }[] = [
  { value: "sans", label: "Sans", className: "font-sans" },
  { value: "serif", label: "Serif", className: "font-serif" },
  { value: "mono", label: "Mono", className: "font-mono" },
];

function formatStyleLabel(value: string) {
  return value
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

// Renders a short piece of text or a single emoji onto a transparent square
// canvas, so it can be fed into qr-code-styling's `image` option the same
// way an uploaded logo file would be.
function renderGlyphToDataUrl(glyph: string, color: string): string {
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size * 0.7}px "Inter Variable", system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(glyph, size / 2, size / 2 + size * 0.04);
  return canvas.toDataURL("image/png");
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

const EXAMPLE_INPUT = "https://example.com";

// Both the QR content and its styling persist across visits.
const STORAGE_KEY = "qr-code-maker:settings";

interface PersistedSettings {
  input: string;
  fgColor: string;
  bgColor: string;
  transparentBg: boolean;
  dotsType: DotType;
  cornerType: CornerStyle;
  errorCorrectionLevel: ErrorCorrectionLevel;
  size: string;
  margin: string;
  logoMode: LogoMode;
  logoImageDataUrl: string | null;
  logoImageUrl: string;
  logoEmoji: string;
  logoText: string;
  logoColor: string;
  logoSizePercent: string;
  captionPosition: CaptionPosition;
  captionText: string;
  captionFontSize: string;
  captionColor: string;
  captionFont: CaptionFont;
  captionGap: string;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  input: EXAMPLE_INPUT,
  fgColor: "#000000",
  bgColor: "#ffffff",
  transparentBg: false,
  dotsType: "square",
  cornerType: "square",
  errorCorrectionLevel: "H",
  size: "1000",
  margin: "80",
  logoMode: "none",
  logoImageDataUrl: null,
  logoImageUrl: "",
  logoEmoji: "",
  logoText: "",
  logoColor: "#000000",
  logoSizePercent: "40",
  captionPosition: "none",
  captionText: EXAMPLE_INPUT,
  captionFontSize: "16",
  captionColor: "#000000",
  captionFont: "sans",
  captionGap: "24",
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

export default function QrCodeMaker() {
  // Customization States — initialized once from localStorage (or defaults)
  const initialSettings = useMemo(() => loadPersistedSettings(), []);
  const [input, setInput] = useState<string>(initialSettings.input);
  const [copiedImg, setCopiedImg] = useState<boolean>(false);

  const [fgColor, setFgColor] = useState<string>(initialSettings.fgColor);
  const [bgColor, setBgColor] = useState<string>(initialSettings.bgColor);
  const [transparentBg, setTransparentBg] = useState<boolean>(
    initialSettings.transparentBg,
  );
  const [dotsType, setDotsType] = useState<DotType>(initialSettings.dotsType);
  const [cornerType, setCornerType] = useState<CornerStyle>(
    initialSettings.cornerType,
  );
  const [errorCorrectionLevel, setErrorCorrectionLevel] =
    useState<ErrorCorrectionLevel>(initialSettings.errorCorrectionLevel);
  const [size, setSize] = useState<string>(initialSettings.size); // Output resolution, in px (square)
  const [margin, setMargin] = useState<string>(initialSettings.margin); // Quiet zone around the code, in px

  const [logoMode, setLogoMode] = useState<LogoMode>(initialSettings.logoMode);
  const [logoImageDataUrl, setLogoImageDataUrl] = useState<string | null>(
    initialSettings.logoImageDataUrl,
  );
  const [logoImageUrl, setLogoImageUrl] = useState<string>(
    initialSettings.logoImageUrl,
  );
  const [logoEmoji, setLogoEmoji] = useState<string>(initialSettings.logoEmoji);
  const [logoText, setLogoText] = useState<string>(initialSettings.logoText);
  const [logoColor, setLogoColor] = useState<string>(initialSettings.logoColor);
  const [logoSizePercent, setLogoSizePercent] = useState<string>(
    initialSettings.logoSizePercent,
  );

  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>(
    initialSettings.captionPosition,
  );
  const [captionText, setCaptionText] = useState<string>(initialSettings.captionText);
  const [captionFontSize, setCaptionFontSize] = useState<string>(
    initialSettings.captionFontSize,
  );
  const [captionColor, setCaptionColor] = useState<string>(
    initialSettings.captionColor,
  );
  const [captionFont, setCaptionFont] = useState<CaptionFont>(
    initialSettings.captionFont,
  );
  const [captionGap, setCaptionGap] = useState<string>(initialSettings.captionGap);

  // Persist the content and its styling whenever either changes
  useEffect(() => {
    const settings: PersistedSettings = {
      input,
      fgColor,
      bgColor,
      transparentBg,
      dotsType,
      cornerType,
      errorCorrectionLevel,
      size,
      margin,
      logoMode,
      logoImageDataUrl,
      logoImageUrl,
      logoEmoji,
      logoText,
      logoColor,
      logoSizePercent,
      captionPosition,
      captionText,
      captionFontSize,
      captionColor,
      captionFont,
      captionGap,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage may be unavailable (private browsing, quota) — safe to ignore
    }
  }, [
    input,
    fgColor,
    bgColor,
    transparentBg,
    dotsType,
    cornerType,
    errorCorrectionLevel,
    size,
    margin,
    logoMode,
    logoImageDataUrl,
    logoImageUrl,
    logoEmoji,
    logoText,
    logoColor,
    logoSizePercent,
    captionPosition,
    captionText,
    captionFontSize,
    captionColor,
    captionFont,
    captionGap,
  ]);

  const resetSettings = () => {
    setFgColor(DEFAULT_SETTINGS.fgColor);
    setBgColor(DEFAULT_SETTINGS.bgColor);
    setTransparentBg(DEFAULT_SETTINGS.transparentBg);
    setDotsType(DEFAULT_SETTINGS.dotsType);
    setCornerType(DEFAULT_SETTINGS.cornerType);
    setErrorCorrectionLevel(DEFAULT_SETTINGS.errorCorrectionLevel);
    setSize(DEFAULT_SETTINGS.size);
    setMargin(DEFAULT_SETTINGS.margin);
    setLogoMode(DEFAULT_SETTINGS.logoMode);
    setLogoImageDataUrl(DEFAULT_SETTINGS.logoImageDataUrl);
    setLogoImageUrl(DEFAULT_SETTINGS.logoImageUrl);
    setLogoEmoji(DEFAULT_SETTINGS.logoEmoji);
    setLogoText(DEFAULT_SETTINGS.logoText);
    setLogoColor(DEFAULT_SETTINGS.logoColor);
    setLogoSizePercent(DEFAULT_SETTINGS.logoSizePercent);
    setCaptionPosition(DEFAULT_SETTINGS.captionPosition);
    setCaptionText(DEFAULT_SETTINGS.captionText);
    setCaptionFontSize(DEFAULT_SETTINGS.captionFontSize);
    setCaptionColor(DEFAULT_SETTINGS.captionColor);
    setCaptionFont(DEFAULT_SETTINGS.captionFont);
    setCaptionGap(DEFAULT_SETTINGS.captionGap);
  };

  // Resolve whichever center-content mode is active into an image source
  // qr-code-styling can embed, same shape whether it's a file, a URL, or
  // text/emoji rendered onto a canvas.
  const logoImage = useMemo(() => {
    switch (logoMode) {
      case "upload":
        return logoImageDataUrl ?? undefined;
      case "url":
        return logoImageUrl.trim() || undefined;
      case "emoji":
        return logoEmoji.trim()
          ? renderGlyphToDataUrl(logoEmoji.trim(), fgColor)
          : undefined;
      case "text":
        return logoText.trim()
          ? renderGlyphToDataUrl(logoText.trim(), logoColor)
          : undefined;
      default:
        return undefined;
    }
  }, [logoMode, logoImageDataUrl, logoImageUrl, logoEmoji, logoText, logoColor, fgColor]);

  // Build the qr-code-styling options from current state
  const options: Partial<Options> = useMemo(() => {
    const px = Number(size) || 300;
    return {
      width: px,
      height: px,
      type: "canvas",
      data: input.trim() ? input : EXAMPLE_INPUT,
      margin: Number(margin) || 0,
      image: logoImage,
      qrOptions: { errorCorrectionLevel },
      dotsOptions: { type: dotsType, color: fgColor },
      cornersSquareOptions: { type: cornerType, color: fgColor },
      cornersDotOptions: { type: cornerType, color: fgColor },
      backgroundOptions: { color: transparentBg ? "transparent" : bgColor },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 8,
        imageSize: (Number(logoSizePercent) || 40) / 100,
        hideBackgroundDots: true,
      },
    };
  }, [
    input,
    size,
    margin,
    logoImage,
    logoSizePercent,
    errorCorrectionLevel,
    dotsType,
    cornerType,
    fgColor,
    bgColor,
    transparentBg,
  ]);

  // Derive a human-readable capacity error, purely from input — no DOM involved.
  // Mirrors what qr-code-styling's own encoder would throw, using the same
  // underlying qrcode-generator lib it depends on.
  const renderError = useMemo(() => {
    try {
      const qr = qrcodeGenerator(0, errorCorrectionLevel);
      qr.addData(input.trim() ? input : EXAMPLE_INPUT);
      qr.make();
      return null;
    } catch (err) {
      if (typeof err === "string") return err;
      return err instanceof Error ? err.message : "Could not generate QR code";
    }
  }, [input, errorCorrectionLevel]);

  const previewRef = useRef<HTMLDivElement>(null);
  const compositeRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  // Create the renderer and mount it into the DOM once
  useEffect(() => {
    const qrCode = new QRCodeStyling(options);
    qrCodeRef.current = qrCode;
    if (previewRef.current) qrCode.append(previewRef.current);
    // Constructed once with whatever options are current at mount time —
    // the effect below keeps it in sync on every subsequent change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render whenever content or styling changes
  useEffect(() => {
    if (renderError) return;
    try {
      qrCodeRef.current?.update(options);
    } catch (err) {
      console.error("QR code render failed", err);
    }
  }, [options, renderError]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const timestampedFilename = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    return `qr-code-${timestamp}`;
  };

  const triggerDownload = (dataUrl: string, extension: string) => {
    const link = document.createElement("a");
    link.download = `${timestampedFilename()}.${extension}`;
    link.href = dataUrl;
    link.click();
  };

  // When a caption is on, the QR alone isn't the whole picture anymore, so
  // exports switch from qr-code-styling's own (vector-accurate) download to
  // compositing the QR + caption wrapper with html-to-image instead. Scale
  // against the QR box itself (not the composite, which can grow wider/taller
  // than the QR once the caption is pushed past the quiet zone).
  const captionPixelRatio = () => {
    const width = previewRef.current?.offsetWidth;
    const target = Number(size) || 300;
    return width ? target / width : 1;
  };

  // Gap is measured inward from the outer edge of the QR image. 0 means the
  // caption sits flush against that edge; positive values pull it inward,
  // into the quiet zone; negative values push it outward, past the quiet
  // zone, growing the composite instead of overlapping the QR.
  const captionOffset = -(Number(captionGap) || 0);

  const downloadPng = async () => {
    try {
      if (captionPosition === "none") {
        await qrCodeRef.current?.download({
          name: timestampedFilename(),
          extension: "png",
        });
        return;
      }
      if (!compositeRef.current) return;
      const dataUrl = await toPng(compositeRef.current, {
        pixelRatio: captionPixelRatio(),
      });
      triggerDownload(dataUrl, "png");
    } catch (error) {
      console.error("PNG download failed", error);
    }
  };

  const downloadSvg = async () => {
    try {
      if (captionPosition === "none") {
        await qrCodeRef.current?.download({
          name: timestampedFilename(),
          extension: "svg",
        });
        return;
      }
      if (!compositeRef.current) return;
      const dataUrl = await toSvg(compositeRef.current, {
        pixelRatio: captionPixelRatio(),
      });
      triggerDownload(dataUrl, "svg");
    } catch (error) {
      console.error("SVG download failed", error);
    }
  };

  const copyImageToClipboard = async () => {
    try {
      let blob: Blob | null = null;
      if (captionPosition === "none") {
        const raw = await qrCodeRef.current?.getRawData("png");
        blob = raw instanceof Blob ? raw : null;
      } else if (compositeRef.current) {
        const dataUrl = await toPng(compositeRef.current, {
          pixelRatio: captionPixelRatio(),
        });
        const res = await fetch(dataUrl);
        blob = await res.blob();
      }
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 2000);
    } catch (error) {
      console.error("Failed to copy image to clipboard", error);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1 md:h-[calc(100svh-6rem)]">
      {/* LEFT COLUMN: Unified Workspace & Configuration */}
      <Card className="flex flex-col overflow-hidden h-full gap-0 py-0">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            QR Content
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

        {/* Content */}
        <div className="p-4 bg-background">
          <Label htmlFor="qr-content" className="mb-2 block">
            Content
          </Label>
          <Input
            id="qr-content"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="URL, text, wifi details, vCard..."
            className="font-mono text-xs h-9"
          />
        </div>

        <Separator />

        {/* Configurations Lower Section */}
        <CardContent className="p-4 flex-1 flex flex-col gap-4 bg-muted/5 min-h-0 overflow-y-auto">
          {/* Colors */}
          <div className="space-y-2">
            <div className="flex items-center justify-end gap-2 h-9">
              <input
                id="transparent-bg"
                type="checkbox"
                checked={transparentBg}
                onChange={(e) => setTransparentBg(e.target.checked)}
                className="h-4 w-4 rounded border cursor-pointer accent-foreground"
              />
              <Label
                htmlFor="transparent-bg"
                className="cursor-pointer font-normal whitespace-nowrap"
              >
                Transparent BG
              </Label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="fg-color">Foreground</Label>
                <ColorSwatchInput id="fg-color" value={fgColor} onChange={setFgColor} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bg-color">Background</Label>
                <ColorSwatchInput
                  id="bg-color"
                  value={bgColor}
                  disabled={transparentBg}
                  onChange={setBgColor}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Style */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Dot Style</Label>
              <Select value={dotsType} onValueChange={(v) => setDotsType(v as DotType)}>
                <SelectTrigger className="bg-background w-full">
                  <SelectValue placeholder="Dot style">
                    {(value: DotType) => formatStyleLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DOT_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {formatStyleLabel(style)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Corner Style</Label>
              <Select
                value={cornerType}
                onValueChange={(v) => setCornerType(v as CornerStyle)}
              >
                <SelectTrigger className="bg-background w-full">
                  <SelectValue placeholder="Corner style">
                    {(value: CornerStyle) => formatStyleLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CORNER_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {formatStyleLabel(style)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Size, Spacing & Error Correction */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="size">Size (px)</Label>
              <Input
                id="size"
                type="number"
                min={128}
                max={2000}
                step={50}
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="margin">Quiet Zone (px)</Label>
              <Input
                id="margin"
                type="number"
                min={0}
                max={200}
                step={4}
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label>Error Correction</Label>
              <Select
                value={errorCorrectionLevel}
                onValueChange={(v) => setErrorCorrectionLevel(v as ErrorCorrectionLevel)}
              >
                <SelectTrigger className="bg-background w-full">
                  <SelectValue placeholder="Level">
                    {(value: ErrorCorrectionLevel) =>
                      ERROR_LEVELS.find((level) => level.value === value)?.label ?? value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ERROR_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Center Content */}
          <div className="space-y-2">
            <Label>Center Content</Label>
            <Select value={logoMode} onValueChange={(v) => setLogoMode(v as LogoMode)}>
              <SelectTrigger className="bg-background w-full">
                <SelectValue placeholder="Center content">
                  {(value: LogoMode) =>
                    LOGO_MODES.find((mode) => mode.value === value)?.label ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOGO_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {logoMode === "upload" &&
              (logoImageDataUrl ? (
                <div className="flex items-center gap-2 border rounded-md px-2 h-9 bg-background">
                  <img
                    src={logoImageDataUrl}
                    alt="Logo preview"
                    className="h-5 w-5 object-contain shrink-0"
                  />
                  <span className="text-xs text-muted-foreground">Image attached</span>
                  <button
                    type="button"
                    onClick={() => setLogoImageDataUrl(null)}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-1.5 border rounded-md px-3 h-9 text-xs cursor-pointer bg-background hover:bg-muted/50 transition-colors w-fit">
                  <ImagePlus className="h-3.5 w-3.5" />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
              ))}

            {logoMode === "url" && (
              <Input
                value={logoImageUrl}
                onChange={(e) => setLogoImageUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="h-9 text-xs"
              />
            )}

            {logoMode === "emoji" && (
              <Input
                value={logoEmoji}
                onChange={(e) => setLogoEmoji(e.target.value)}
                placeholder="🚀"
                className="h-9 text-xs"
              />
            )}

            {logoMode === "text" && (
              <div className="flex gap-2">
                <Input
                  value={logoText}
                  onChange={(e) => setLogoText(e.target.value)}
                  placeholder="AB"
                  maxLength={3}
                  className="h-9 text-xs flex-1"
                />
                <ColorSwatchInput id="logo-color" value={logoColor} onChange={setLogoColor} />
              </div>
            )}

            {logoMode !== "none" && (
              <div className="space-y-2 pt-1">
                <Label htmlFor="logo-size">Logo Size (%)</Label>
                <Input
                  id="logo-size"
                  type="number"
                  min={10}
                  max={50}
                  step={5}
                  value={logoSizePercent}
                  onChange={(e) => setLogoSizePercent(e.target.value)}
                  className="h-9"
                />
              </div>
            )}

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Use Quartile or High error correction so the code still scans.
            </p>
          </div>

          <Separator />

          {/* Caption */}
          <div className="space-y-2">
            <Label>Link Caption</Label>
            <Select
              value={captionPosition}
              onValueChange={(v) => setCaptionPosition(v as CaptionPosition)}
            >
              <SelectTrigger className="bg-background w-full">
                <SelectValue placeholder="Position">
                  {(value: CaptionPosition) =>
                    CAPTION_POSITIONS.find((position) => position.value === value)?.label ??
                    value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CAPTION_POSITIONS.map((position) => (
                  <SelectItem key={position.value} value={position.value}>
                    {position.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="caption-text"
                  className={captionPosition === "none" ? "text-muted-foreground" : undefined}
                >
                  Caption Text
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                  disabled={captionPosition === "none"}
                  onClick={() => setCaptionText(input)}
                >
                  <Copy className="h-3 w-3" />
                  Use Content
                </Button>
              </div>
              <Input
                id="caption-text"
                value={captionText}
                disabled={captionPosition === "none"}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="Scan to visit..."
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-2">
                <Label
                  htmlFor="caption-size"
                  className={captionPosition === "none" ? "text-muted-foreground" : undefined}
                >
                  Caption Size (px)
                </Label>
                <Input
                  id="caption-size"
                  type="number"
                  min={8}
                  max={64}
                  step={2}
                  value={captionFontSize}
                  disabled={captionPosition === "none"}
                  onChange={(e) => setCaptionFontSize(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="caption-gap"
                  className={captionPosition === "none" ? "text-muted-foreground" : undefined}
                >
                  Gap (px)
                </Label>
                <Input
                  id="caption-gap"
                  type="number"
                  min={-500}
                  max={500}
                  step={4}
                  value={captionGap}
                  disabled={captionPosition === "none"}
                  onChange={(e) => setCaptionGap(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-2">
                <Label
                  className={captionPosition === "none" ? "text-muted-foreground" : undefined}
                >
                  Caption Font
                </Label>
                <Select
                  value={captionFont}
                  onValueChange={(v) => setCaptionFont(v as CaptionFont)}
                  disabled={captionPosition === "none"}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Font">
                      {(value: CaptionFont) =>
                        CAPTION_FONTS.find((font) => font.value === value)?.label ?? value
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CAPTION_FONTS.map((font) => (
                      <SelectItem key={font.value} value={font.value}>
                        {font.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="caption-color"
                  className={captionPosition === "none" ? "text-muted-foreground" : undefined}
                >
                  Caption Color
                </Label>
                <ColorSwatchInput
                  id="caption-color"
                  value={captionColor}
                  disabled={captionPosition === "none"}
                  onChange={setCaptionColor}
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Gap: inward from the QR edge. Negative pushes the caption outside.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* RIGHT COLUMN: Unified Preview & Toolkit Output */}
      <Card className="flex flex-col overflow-hidden h-full gap-0 py-0">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Preview
          </CardTitle>
        </CardHeader>

        {/* Checkerboard is always visible underneath so it's clear what's actually transparent */}
        <div
          className="flex-1 min-h-[240px] p-6 flex items-center justify-center overflow-auto select-none"
          style={{
            backgroundImage:
              "conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 25%, transparent 0 50%, color-mix(in oklch, var(--foreground) 8%, transparent) 0 75%, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        >
          <div
            ref={compositeRef}
            className={cn(
              "flex flex-col items-center",
              captionPosition === "top" && "flex-col-reverse",
            )}
            style={{ width: "min(100%, 360px)" }}
          >
            <div
              ref={previewRef}
              className="w-full shadow-sm shrink-0 [&>canvas]:w-full [&>canvas]:h-full [&>svg]:w-full [&>svg]:h-full"
              style={{ aspectRatio: "1 / 1" }}
            />
            {captionPosition !== "none" && (
              <span
                className={cn(
                  "text-center break-all leading-tight max-w-full",
                  CAPTION_FONTS.find((font) => font.value === captionFont)?.className,
                )}
                style={{
                  color: captionColor,
                  fontSize: `${captionFontSize}px`,
                  marginTop: captionPosition === "bottom" ? captionOffset : undefined,
                  marginBottom: captionPosition === "top" ? captionOffset : undefined,
                }}
              >
                {captionText.trim() || EXAMPLE_INPUT}
              </span>
            )}
          </div>
        </div>

        {renderError && (
          <div className="px-4 py-2.5 flex items-start gap-2 text-xs text-destructive bg-destructive/10 border-t border-destructive/20 max-h-24 overflow-y-auto">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{renderError}</span>
          </div>
        )}

        <Separator />

        {/* Integrated Export Controls Container */}
        <CardContent className="p-4 space-y-3 bg-muted/5">
          <div className="flex items-center justify-end">
            <span className="text-xs text-muted-foreground font-mono">
              {size} × {size}px
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 gap-1.5 text-xs bg-background"
              onClick={downloadPng}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Download PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 gap-1.5 text-xs bg-background"
              onClick={downloadSvg}
            >
              <FileCode className="h-3.5 w-3.5" />
              Download SVG
            </Button>
          </div>

          <Button
            size="sm"
            className="w-full h-8 gap-1.5 text-xs"
            onClick={copyImageToClipboard}
          >
            {copiedImg ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5" />
            )}
            Copy Image
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
