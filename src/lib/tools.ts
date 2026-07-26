import { FileStack, QrCode, Sigma, type LucideIcon } from "lucide-react"

// Single source of truth for the tool catalog. The sidebar nav and the
// About page both render from this list, so adding a tool here is enough
// to make it show up in both places.
export interface ToolMeta {
  title: string
  url: string
  description: string
  icon: LucideIcon
}

export const tools: ToolMeta[] = [
  {
    title: "LaTeX to Image",
    url: "/tools/latex-to-image",
    description: "Render a LaTeX snippet to a PNG",
    icon: Sigma,
  },
  {
    title: "QR Code Maker",
    url: "/tools/qr-code-maker",
    description: "Generate a styled QR code for a link, text, Wi-Fi login, or other data.",
    icon: QrCode,
  },
  {
    title: "PDF N-up Maker",
    url: "/tools/pdf-n-up-maker",
    description: "Lay multiple PDF pages out onto one sheet for printing.",
    icon: FileStack,
  },
]
