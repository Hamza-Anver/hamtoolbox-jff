import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import SpectrogramPlugin from "wavesurfer.js/plugins/spectrogram";
import { toPng } from "html-to-image";
import exampleAudioUrl from "./file_example_MP3_700KB.mp3";
import {
  AudioWaveform,
  Pause,
  Play,
  Volume2,
  X,
  AlertTriangle,
  ImageIcon,
  Check,
  ClipboardCopy,
} from "lucide-react";

// Shadcn UI Imports
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// Decode at full quality: wavesurfer's own default (8kHz) would cap the
// spectrogram at a 4kHz Nyquist limit, well below audible content.
const DECODE_SAMPLE_RATE = 44100;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Pulls a theme color straight from the CSS custom properties in App.css, so
// the visualization follows the app's light/dark theme instead of hardcoding.
function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function AudioVisualizer() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [copiedImg, setCopiedImg] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [customWidth, setCustomWidth] = useState(1280);
  const [customHeight, setCustomHeight] = useState(400);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isLoadingExample, setIsLoadingExample] = useState(false);

  const waveformRef = useRef<HTMLDivElement>(null);
  const spectrogramRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  // Creates one WaveSurfer instance (with the Spectrogram plugin) per loaded
  // file, and tears it down on file change/unmount.
  useEffect(() => {
    if (!file || !waveformRef.current || !spectrogramRef.current) return;

    setError(null);
    setIsLoading(true);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const spectrogramPlugin = SpectrogramPlugin.create({
      container: spectrogramRef.current,
      height: 220,
      labels: true,
      scale: "mel",
      colorMap: "roseus",
    });

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      height: 110,
      waveColor: themeColor("--muted-foreground"),
      progressColor: themeColor("--primary"),
      cursorColor: themeColor("--foreground"),
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      dragToSeek: true,
      sampleRate: DECODE_SAMPLE_RATE,
      plugins: [spectrogramPlugin],
    });
    wavesurferRef.current = wavesurfer;
    wavesurfer.setVolume(volume);

    // The spectrogram's height is only known once its own render pass
    // finishes, which lags behind the main "ready" event. Seeds the export
    // size fields with the as-rendered dimensions.
    spectrogramPlugin.on("ready", () => {
      const rect = spectrogramRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCustomWidth(Math.round(rect.width));
      setCustomHeight(Math.round(rect.height));
    });

    wavesurfer.on("ready", () => {
      setIsLoading(false);
      setDuration(wavesurfer.getDuration());
    });
    wavesurfer.on("timeupdate", (time) => setCurrentTime(time));
    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));
    wavesurfer.on("finish", () => setIsPlaying(false));
    wavesurfer.on("error", (err) => {
      console.error("Failed to load audio", err);
      setError(err instanceof Error ? err.message : "Could not read this audio file");
      setIsLoading(false);
    });

    void wavesurfer.loadBlob(file);

    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volume is applied via setVolume, not re-created per change
  }, [file]);

  // The Spectrogram plugin's frequency-label canvas is always created (labels: true
  // above); toggling visibility here avoids recreating the whole plugin/instance.
  useEffect(() => {
    const labelsCanvas = spectrogramRef.current?.querySelector<HTMLElement>(
      'canvas[part="spec-labels"]',
    );
    if (labelsCanvas) labelsCanvas.style.display = showLabels ? "" : "none";
  }, [file, showLabels]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (selected) setFile(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.type.startsWith("audio/")) setFile(dropped);
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
  };

  const loadExample = async () => {
    setIsLoadingExample(true);
    setError(null);
    try {
      const res = await fetch(exampleAudioUrl);
      const blob = await res.blob();
      setFile(new File([blob], "file_example_MP3_700KB.mp3", { type: blob.type || "audio/mpeg" }));
    } catch (err) {
      console.error("Failed to load example audio", err);
      setError(err instanceof Error ? err.message : "Could not load the example audio");
    } finally {
      setIsLoadingExample(false);
    }
  };

  const togglePlayPause = () => void wavesurferRef.current?.playPause();

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setVolume(next);
    wavesurferRef.current?.setVolume(next);
  };

  const seekFromPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    const wavesurfer = wavesurferRef.current;
    if (!wavesurfer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    wavesurfer.seekTo(ratio);
  };

  // Re-renders the spectrogram from scratch at the requested export
  // resolution, rather than rasterizing the on-screen canvas and stretching
  // it: the Spectrogram plugin sizes its canvases to its wavesurfer
  // instance's wrapper width, so a full, isolated, off-screen WaveSurfer +
  // plugin pair is created at exactly customWidth/customHeight, decodes the
  // same file again, and is torn down once captured.
  const renderSpectrogramPng = async (): Promise<string | null> => {
    if (!file || customWidth < 1 || customHeight < 1) return null;

    const hiddenRoot = document.createElement("div");
    hiddenRoot.style.position = "fixed";
    hiddenRoot.style.top = "0";
    hiddenRoot.style.left = "-99999px";
    hiddenRoot.style.pointerEvents = "none";
    document.body.appendChild(hiddenRoot);

    const waveformContainer = document.createElement("div");
    waveformContainer.style.width = `${customWidth}px`;
    // Sized explicitly (not left to shrink/grow with the page) so the
    // capture below isn't clipped if customWidth exceeds the viewport.
    const spectrogramContainer = document.createElement("div");
    spectrogramContainer.style.width = `${customWidth}px`;
    spectrogramContainer.style.height = `${customHeight}px`;
    hiddenRoot.append(waveformContainer, spectrogramContainer);

    let exportWavesurfer: WaveSurfer | null = null;
    try {
      // Always built with labels on (the plugin option, not the CSS toggle
      // below) -- this mirrors the live preview, which never recreates the
      // plugin to hide labels either, and keeps this off the untested
      // labels:false construction path.
      const spectrogramPlugin = SpectrogramPlugin.create({
        container: spectrogramContainer,
        height: customHeight,
        labels: true,
        scale: "mel",
        colorMap: "roseus",
      });

      exportWavesurfer = WaveSurfer.create({
        container: waveformContainer,
        width: customWidth,
        height: 1,
        interact: false,
        sampleRate: DECODE_SAMPLE_RATE,
        plugins: [spectrogramPlugin],
      });

      const ready = new Promise<void>((resolve, reject) => {
        spectrogramPlugin.on("ready", () => resolve());
        spectrogramPlugin.on("error", (err) => reject(err));
      });
      await exportWavesurfer.loadBlob(file);
      await ready;

      if (!showLabels) {
        const labelsCanvas = spectrogramContainer.querySelector<HTMLElement>(
          'canvas[part="spec-labels"]',
        );
        if (labelsCanvas) labelsCanvas.style.display = "none";
      }

      return await toPng(spectrogramContainer, {
        canvasWidth: customWidth,
        canvasHeight: customHeight,
        pixelRatio: 1,
      });
    } finally {
      exportWavesurfer?.destroy();
      hiddenRoot.remove();
    }
  };

  const triggerDownload = (dataUrl: string, extension: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const link = document.createElement("a");
    link.download = `spectrogram-${timestamp}.${extension}`;
    link.href = dataUrl;
    link.click();
  };

  const downloadSpectrogramPng = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const dataUrl = await renderSpectrogramPng();
      if (!dataUrl) return;
      triggerDownload(dataUrl, "png");
    } catch (err) {
      console.error("Spectrogram image generation failed", err);
      setExportError(
        err instanceof Error ? err.message : "Could not render the spectrogram image",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const copySpectrogramImage = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const dataUrl = await renderSpectrogramPng();
      if (!dataUrl) return;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 2000);
    } catch (err) {
      console.error("Failed to copy spectrogram image to clipboard", err);
      setExportError(err instanceof Error ? err.message : "Could not copy the spectrogram image");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-1">
      <Card className="gap-0 py-0">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Audio
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 bg-muted/5">
          {file ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 border rounded-md px-3 h-9 bg-background">
                <AudioWaveform className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Remove audio"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={isLoading}
                  onClick={togglePlayPause}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <span className="text-xs font-mono text-muted-foreground w-20 shrink-0">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <Separator orientation="vertical" className="h-5" />
                <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-28 accent-primary"
                  aria-label="Volume"
                />
              </div>
            </div>
          ) : (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex flex-col items-center justify-center gap-1.5 border border-dashed rounded-md px-3 py-8 text-center cursor-pointer bg-background hover:bg-muted/50 transition-colors"
            >
              <AudioWaveform className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Click or drop an audio file here</span>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
          )}

          {!file && (
            <button
              type="button"
              onClick={loadExample}
              disabled={isLoadingExample}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {isLoadingExample ? "Loading example…" : "Load an example"}
            </button>
          )}

          {error && (
            <div className="mt-3 px-3 py-2.5 flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0" style={{ display: file ? undefined : "none" }}>
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Waveform
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 bg-muted/5">
          <div ref={waveformRef} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0" style={{ display: file ? undefined : "none" }}>
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Spectrogram
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 bg-muted/5">
          <div className="relative cursor-pointer" onMouseDown={seekFromPointer}>
            <div ref={spectrogramRef} />
            {duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-foreground z-20 pointer-events-none"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            )}
          </div>
        </CardContent>

        {file && (
          <>
            <Separator />
            <CardContent className="p-4 space-y-3 bg-muted/5">
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none h-7">
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                    className="accent-primary"
                  />
                  Scale
                </label>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    Exported image size (px)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor="export-width"
                        className="text-[11px] text-muted-foreground font-normal"
                      >
                        Width
                      </Label>
                      <Input
                        id="export-width"
                        type="number"
                        min={1}
                        value={customWidth}
                        onChange={(e) => setCustomWidth(Number(e.target.value))}
                        className="h-7 w-24 text-xs px-2"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">×</span>
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor="export-height"
                        className="text-[11px] text-muted-foreground font-normal"
                      >
                        Height
                      </Label>
                      <Input
                        id="export-height"
                        type="number"
                        min={1}
                        value={customHeight}
                        onChange={(e) => setCustomHeight(Number(e.target.value))}
                        className="h-7 w-24 text-xs px-2"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 gap-1.5 text-xs bg-background"
                  disabled={isExporting}
                  onClick={copySpectrogramImage}
                >
                  {copiedImg ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  )}
                  {copiedImg ? "Copied!" : isExporting ? "Rendering…" : "Copy Image"}
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-8 gap-1.5 text-xs"
                  disabled={isExporting}
                  onClick={downloadSpectrogramPng}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {isExporting ? "Rendering…" : "Download PNG"}
                </Button>
              </div>

              {exportError && (
                <div className="px-3 py-2.5 flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{exportError}</span>
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
