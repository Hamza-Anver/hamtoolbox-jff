import { Link } from "react-router"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { tools } from "@/lib/tools"

export default function AboutPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-2xl font-semibold">Hamza's Toolbox</h1>
        <p className="text-muted-foreground">
          This site is a collection of single-purpose tools I built for
          myself and cleaned up (just) enough to share. Each runs entirely in a browser as a static page. 
          I don't feel like maintaining a server for these tools, so they are all client-side only.
        </p>
        <p className="text-muted-foreground">

        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Tools</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <Link key={tool.url} to={tool.url}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <tool.icon className="mb-2 size-5 text-muted-foreground" />
                  <CardTitle>{tool.title}</CardTitle>
                  <CardDescription>{tool.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
