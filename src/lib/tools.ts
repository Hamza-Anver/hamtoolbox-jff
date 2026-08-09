import { AudioWaveform, FileStack, ImageIcon, QrCode, Sigma, type LucideIcon } from "lucide-react"

// Single source of truth for the tool catalog. The sidebar nav and the
// About page both render from this list, so adding a tool here is enough
// to make it show up in both places.
export type ToolCategory = "PDF" | "Misc"

export interface ToolMeta {
  title: string
  url: string
  description: string
  icon: LucideIcon
  category: ToolCategory
}

export const tools: ToolMeta[] = [
  {
    title: "LaTeX to Image",
    url: "/tools/latex-to-image",
    description: "Render a LaTeX snippet to a PNG",
    icon: Sigma,
    category: "Misc",
  },
  {
    title: "QR Code Maker",
    url: "/tools/qr-code-maker",
    description: "Generate a styled QR code for a link, text, Wi-Fi login, or other data.",
    icon: QrCode,
    category: "Misc",
  },
  {
    title: "PDF N-up Maker",
    url: "/tools/pdf-n-up-maker",
    description: "Lay multiple PDF pages out onto one sheet for printing.",
    icon: FileStack,
    category: "PDF",
  },
  {
    title: "Image to PDF",
    url: "/tools/image-to-pdf",
    description: "Place an image onto an A4 or A3 PDF page with margins.",
    icon: ImageIcon,
    category: "PDF",
  },
  {
    title: "Audio Visualizer",
    url: "/tools/audio-visualizer",
    description: "Play an audio file and see its waveform and spectrogram.",
    icon: AudioWaveform,
    category: "Misc",
  },
]

// Categories in display order, each with the tools that belong to it.
// Declared explicitly (rather than derived by first-appearance) so the
// order shown in the sidebar and overview page doesn't depend on how
// `tools` happens to be sorted.
const categoryOrder: ToolCategory[] = ["PDF", "Misc"]

export const toolsByCategory: { category: ToolCategory; tools: ToolMeta[] }[] =
  categoryOrder
    .map((category) => ({
      category,
      tools: tools.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.tools.length > 0)
