import { useState, useEffect, useMemo, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  Copy,
  Check,
  Image as ImageIcon,
  FileCode,
  ClipboardCopy,
  AlertTriangle,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import { toPng, toSvg } from "html-to-image";

// CodeMirror Extensions
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { latex } from "codemirror-lang-latex";

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

// Scoped for editing a single equation snippet, not a full .tex document —
// document/reference/citation checks don't apply here.
const latexExtension = latex({
  fileName: "equation.tex",
  linter: {
    checkMissingDocumentEnv: false,
    checkUnmatchedEnvironments: true,
    checkMissingReferences: false,
    checkUnclosedBraces: true,
    checkDuplicateLabels: false,
    checkCitesWithoutBibliography: false,
  },
});

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-content": { caretColor: "var(--foreground)" },
  ".cm-focused": { outline: "none" },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    border: "none",
    borderRight: "1px solid var(--border)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px" },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklch, var(--primary) 16%, var(--muted))",
    color: "var(--primary)",
    fontWeight: 600,
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklch, var(--primary) 9%, transparent)",
    boxShadow: "inset 2px 0 0 var(--primary)",
  },
  ".cm-line:nth-of-type(even):not(.cm-activeLine)": {
    backgroundColor: "color-mix(in oklch, var(--foreground) 3%, transparent)",
  },
});

// Theme Definitions
const THEMES = {
  light: { name: "Light", bg: "#ffffff", fg: "#000000" },
  dark: { name: "Dark", bg: "#000000", fg: "#ffffff" },
  sepia: { name: "Sepia", bg: "#f4ecd8", fg: "#433422" },
  slate: { name: "Slate", bg: "#1e293b", fg: "#f1f5f9" },
  custom: { name: "Custom", bg: "#ffffff", fg: "#000000" },
};

type ThemeKey = keyof typeof THEMES;

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

const EXAMPLE_INPUT =
  "\\begin{aligned}\nax^2 + bx + c &= 0 \\\\\nx &= \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n\\end{aligned}";

// Both the equation text and its styling persist across visits.
const STORAGE_KEY = "latex-prettifier:settings";

interface PersistedSettings {
  input: string;
  currentTheme: ThemeKey;
  bgColor: string;
  fgColor: string;
  transparentBg: boolean;
  exportScale: string;
  fontSize: string;
  cornerRadius: string;
  showBorder: boolean;
  borderColor: string;
  borderWidth: string;
  padding: string;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  input: EXAMPLE_INPUT,
  currentTheme: "light",
  bgColor: "#ffffff",
  fgColor: "#000000",
  transparentBg: false,
  exportScale: "300",
  fontSize: "24",
  cornerRadius: "0",
  showBorder: false,
  borderColor: "#d4d4d8",
  borderWidth: "1",
  padding: "32",
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

export default function LatexPrettifier() {
  // Customization States — initialized once from localStorage (or defaults)
  const initialSettings = useMemo(() => loadPersistedSettings(), []);
  const [input, setInput] = useState<string>(initialSettings.input);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [copiedImg, setCopiedImg] = useState<boolean>(false);

  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(
    initialSettings.currentTheme,
  );
  const [bgColor, setBgColor] = useState<string>(initialSettings.bgColor);
  const [fgColor, setFgColor] = useState<string>(initialSettings.fgColor);
  const [transparentBg, setTransparentBg] = useState<boolean>(
    initialSettings.transparentBg,
  );
  const [exportScale, setExportScale] = useState<string>(
    initialSettings.exportScale,
  ); // Export scale, as a percentage
  const [fontSize, setFontSize] = useState<string>(initialSettings.fontSize); // Equation font size, in px
  const [cornerRadius, setCornerRadius] = useState<string>(
    initialSettings.cornerRadius,
  ); // Corner radius, in px
  const [showBorder, setShowBorder] = useState<boolean>(
    initialSettings.showBorder,
  );
  const [borderColor, setBorderColor] = useState<string>(
    initialSettings.borderColor,
  );
  const [borderWidth, setBorderWidth] = useState<string>(
    initialSettings.borderWidth,
  ); // Border width, in px
  const [padding, setPadding] = useState<string>(initialSettings.padding); // Padding around the equation, in px
  const [previewSize, setPreviewSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  // Persist the equation and its styling whenever either changes
  useEffect(() => {
    const settings: PersistedSettings = {
      input,
      currentTheme,
      bgColor,
      fgColor,
      transparentBg,
      exportScale,
      fontSize,
      cornerRadius,
      showBorder,
      borderColor,
      borderWidth,
      padding,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage may be unavailable (private browsing, quota) — safe to ignore
    }
  }, [
    input,
    currentTheme,
    bgColor,
    fgColor,
    transparentBg,
    exportScale,
    fontSize,
    cornerRadius,
    showBorder,
    borderColor,
    borderWidth,
    padding,
  ]);

  const loadExample = () => setInput(EXAMPLE_INPUT);

  const resetSettings = () => {
    setCurrentTheme(DEFAULT_SETTINGS.currentTheme);
    setBgColor(DEFAULT_SETTINGS.bgColor);
    setFgColor(DEFAULT_SETTINGS.fgColor);
    setTransparentBg(DEFAULT_SETTINGS.transparentBg);
    setExportScale(DEFAULT_SETTINGS.exportScale);
    setFontSize(DEFAULT_SETTINGS.fontSize);
    setCornerRadius(DEFAULT_SETTINGS.cornerRadius);
    setShowBorder(DEFAULT_SETTINGS.showBorder);
    setBorderColor(DEFAULT_SETTINGS.borderColor);
    setBorderWidth(DEFAULT_SETTINGS.borderWidth);
    setPadding(DEFAULT_SETTINGS.padding);
  };

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const katexRenderRef = useRef<HTMLDivElement>(null);

  // Track the preview's natural size so we can show the resulting export resolution.
  // Uses offsetWidth/offsetHeight (border-box) rather than ResizeObserver's contentRect,
  // since that's what toPng actually captures — contentRect excludes padding/border and
  // would under-report the real export size.
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setPreviewSize({ width: el.offsetWidth, height: el.offsetHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scaleFactor = (Number(exportScale) || 0) / 100;
  const outputWidth = Math.round(previewSize.width * scaleFactor);
  const outputHeight = Math.round(previewSize.height * scaleFactor);

  // Derive a human-readable parse error, purely from input — no DOM involved.
  const renderError = useMemo(() => {
    try {
      katex.renderToString(input || "\\text{Type something...}", {
        displayMode: true,
        throwOnError: true,
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid LaTeX";
    }
  }, [input]);

  // Render into the DOM with throwOnError: false so KaTeX's own inline error markup
  // still shows roughly where things broke, even when renderError is set above.
  useEffect(() => {
    if (!katexRenderRef.current) return;
    katex.render(input || "\\text{Type something...}", katexRenderRef.current, {
      displayMode: true,
      throwOnError: false,
    });
  }, [input]);

  // Handle Preset Changes
  const handleThemeChange = (themeKey: ThemeKey) => {
    setCurrentTheme(themeKey);
    if (themeKey !== "custom") {
      setBgColor(THEMES[themeKey].bg);
      setFgColor(THEMES[themeKey].fg);
    }
  };

  // Export functions using html-to-image
  const renderPng = () => {
    if (!previewContainerRef.current) return null;
    return toPng(previewContainerRef.current, { pixelRatio: scaleFactor });
  };

  const renderSvg = () => {
    if (!previewContainerRef.current) return null;
    return toSvg(previewContainerRef.current, { pixelRatio: scaleFactor });
  };

  const triggerDownload = (dataUrl: string, extension: string) => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const link = document.createElement("a");
    link.download = `equation-${timestamp}.${extension}`;
    link.href = dataUrl;
    link.click();
  };

  const downloadImage = async () => {
    try {
      const dataUrl = await renderPng();
      if (!dataUrl) return;
      triggerDownload(dataUrl, "png");
    } catch (error) {
      console.error("Image generation failed", error);
    }
  };

  const downloadSvg = async () => {
    try {
      const dataUrl = await renderSvg();
      if (!dataUrl) return;
      triggerDownload(dataUrl, "svg");
    } catch (error) {
      console.error("SVG generation failed", error);
    }
  };

  const copyImageToClipboard = async () => {
    try {
      const dataUrl = await renderPng();
      if (!dataUrl) return;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 2000);
    } catch (error) {
      console.error("Failed to copy image to clipboard", error);
    }
  };

  const copyRawTex = async () => {
    await navigator.clipboard.writeText(input);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1 md:h-[calc(100svh-6rem)]">
      {/* LEFT COLUMN: Unified Workspace & Configuration */}
      <Card className="flex flex-col overflow-hidden h-full gap-0 py-0">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            LaTeX Input
          </CardTitle>
        </CardHeader>

        {/* Editor Content Area */}
        <div className="relative flex-1 min-h-[240px] overflow-hidden bg-background">
          <CodeMirror
            value={input}
            height="100%"
            theme="none"
            basicSetup={{
              autocompletion: false,
              completionKeymap: false,
              foldGutter: false,
              closeBrackets: false,
              bracketMatching: false,
            }}
            extensions={[latexExtension, editorTheme]}
            onChange={(value) => setInput(value)}
            className="h-full focus-within:ring-0"
          />
          <Button
            variant="outline"
            size="sm"
            className="absolute bottom-2.5 right-2.5 h-7 gap-1.5 text-xs bg-background/90 backdrop-blur-sm shadow-sm"
            onClick={copyRawTex}
          >
            {copiedText ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedText ? "Copied!" : "Copy"}
          </Button>
        </div>

        <Separator />

        {/* Configurations Lower Section */}
        <CardContent className="p-4 flex flex-col gap-4 bg-muted/5 min-h-0 overflow-y-auto">
          {/* Colors */}
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0 space-y-2">
                <Label>Color Palette</Label>
                <Select
                  value={currentTheme}
                  onValueChange={(v) => handleThemeChange(v as ThemeKey)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Select a palette" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(THEMES).map(([key, t]) => (
                      <SelectItem key={key} value={key}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 h-9 shrink-0">
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
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-2">
                <Label htmlFor="bg-color">Canvas BG</Label>
                <ColorSwatchInput
                  id="bg-color"
                  value={bgColor}
                  disabled={transparentBg}
                  onChange={(v) => {
                    setBgColor(v);
                    setCurrentTheme("custom");
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fg-color">Math Text</Label>
                <ColorSwatchInput
                  id="fg-color"
                  value={fgColor}
                  onChange={(v) => {
                    setFgColor(v);
                    setCurrentTheme("custom");
                  }}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Border */}
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-end">
            <div className="flex items-center gap-2 h-9 pr-1">
              <input
                id="show-border"
                type="checkbox"
                checked={showBorder}
                onChange={(e) => setShowBorder(e.target.checked)}
                className="h-4 w-4 rounded border cursor-pointer accent-foreground"
              />
              <Label
                htmlFor="show-border"
                className="cursor-pointer font-normal whitespace-nowrap"
              >
                Show border
              </Label>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="border-color"
                className={!showBorder ? "text-muted-foreground" : undefined}
              >
                Color
              </Label>
              <ColorSwatchInput
                id="border-color"
                value={borderColor}
                disabled={!showBorder}
                onChange={setBorderColor}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="border-width"
                className={!showBorder ? "text-muted-foreground" : undefined}
              >
                Width (px)
              </Label>
              <Input
                id="border-width"
                type="number"
                min={1}
                max={16}
                step={1}
                value={borderWidth}
                disabled={!showBorder}
                onChange={(e) => setBorderWidth(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <Separator />

          {/* Shape & Spacing */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="font-size">Font (px)</Label>
              <Input
                id="font-size"
                type="number"
                min={12}
                max={96}
                step={2}
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="corner-radius">Radius (px)</Label>
              <Input
                id="corner-radius"
                type="number"
                min={0}
                max={64}
                step={2}
                value={cornerRadius}
                onChange={(e) => setCornerRadius(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="padding">Padding (px)</Label>
              <Input
                id="padding"
                type="number"
                min={0}
                max={128}
                step={4}
                value={padding}
                onChange={(e) => setPadding(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={loadExample}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Load Example LaTeX
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={resetSettings}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Default Options
            </Button>
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

        {/* Display Canvas Only — checkerboard is always visible underneath so it's clear what's actually transparent */}
        <div
          className="flex-1 min-h-[240px] p-6 flex items-center justify-center overflow-auto select-none"
          style={{
            backgroundImage:
              "conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 25%, transparent 0 50%, color-mix(in oklch, var(--foreground) 8%, transparent) 0 75%, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        >
          <div
            ref={previewContainerRef}
            style={{
              backgroundColor: transparentBg ? "transparent" : bgColor,
              color: fgColor,
              padding: `${padding}px`,
              borderWidth: showBorder ? `${borderWidth}px` : 0,
              borderColor,
              borderStyle: "solid",
              borderRadius: `${cornerRadius}px`,
            }}
            className="shadow-sm transition-colors duration-150 overflow-x-auto max-w-full text-center"
          >
            <div
              ref={katexRenderRef}
              style={{ fontSize: `${fontSize}px` }}
              className="whitespace-nowrap px-4"
            />
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
          <div className="flex items-center gap-2">
            <Label htmlFor="export-scale" className="shrink-0">
              Export Scale
            </Label>
            <Input
              id="export-scale"
              type="number"
              min={50}
              max={1000}
              step={50}
              value={exportScale}
              onChange={(e) => setExportScale(e.target.value)}
              className="w-24 h-9 text-sm"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <span className="ml-auto text-xs text-muted-foreground font-mono">
              {outputWidth} × {outputHeight}px
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 gap-1.5 text-xs bg-background"
              onClick={downloadImage}
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
