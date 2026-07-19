import { createBrowserRouter, RouterProvider } from "react-router"

import { RootLayout } from "@/components/root-layout"

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        handle: { breadcrumb: "About This Project" },
        lazy: () =>
          import("@/pages/about").then((m) => ({ Component: m.default })),
      },
      {
        path: "tools/latex-to-image",
        handle: { breadcrumb: ["Tools", "LaTeX to Image"] },
        lazy: () =>
          import("../tools/latex-to-image/latex-to-image").then((m) => ({
            Component: m.default,
          })),
      },
      {
        path: "tools/qr-code-maker",
        handle: { breadcrumb: ["Tools", "QR Code Maker"] },
        lazy: () =>
          import("../tools/qr-code-maker/qr-code-maker").then((m) => ({
            Component: m.default,
          })),
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
