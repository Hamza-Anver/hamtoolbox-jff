import * as React from "react"
import { Link, useLocation } from "react-router"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { SiGithub } from "react-icons/si"
import { toolsByCategory } from "@/lib/tools"

// "route" items are handled by the in-app router (React Router) and use
// client-side navigation. "external" items point at a page built outside
// this app (a different stack, e.g. Rust/WASM) and get a normal full-page
// link instead.
type NavItem = {
  title: string
  url: string
  kind?: "route" | "external"
}

const toolCategories: (NavItem & { items: NavItem[] })[] = toolsByCategory.map(
  ({ category, tools }) => ({
    title: category,
    url: "#",
    items: tools.map((tool) => ({
      title: tool.title,
      url: tool.url,
      kind: "route" as const,
    })),
  })
)

// Base UI's `render` prop clones whatever element it's given and merges
// computed classes/handlers/attrs onto it directly, so this must return a
// plain host element (<a> or <Link>) rather than a wrapping component.
function navLinkElement(item: NavItem) {
  return item.kind === "external" ? <a href={item.url} /> : <Link to={item.url} />
}

type AppSidebarProps = React.ComponentProps<typeof Sidebar>

export function AppSidebar(props: AppSidebarProps) {
  const location = useLocation()

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex aspect-square size-10 items-center justify-center text-sidebar-primary-foreground">
                <img src="/favicon.svg" alt="" className="size-8" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-xl">Hamza's Toolbox</span>
                <span className="text-muted-foreground">
                  v0.0.1
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className="mx-0" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={location.pathname === "/"}
                variant="outline"
                className="font-medium"
                render={<Link to="/" />}
              >
                Overview
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarMenu>
            {toolCategories.map((category) => (
              <SidebarMenuItem key={category.title}>
                <SidebarMenuButton
                  isActive={location.pathname === category.url}
                  className="font-medium"
                  render={navLinkElement(category)}
                >
                  {category.title}
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {category.items.map((tool) => (
                    <SidebarMenuSubItem key={tool.title}>
                      <SidebarMenuSubButton
                        isActive={location.pathname === tool.url}
                        render={navLinkElement(tool)}
                      >
                        {tool.title}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-row items-center justify-end gap-2">
        <Button
          variant="outline"
          render={<a href="https://github.com/Hamza-Anver/hamtoolbox-jff" target="_blank" rel="noreferrer" />}
        >
          <SiGithub className="h-[1.1rem] w-[1.1rem]" />
          <span className="sr-only">GitHub</span>
          GitHub
        </Button>
        <ModeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
