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
} from "@/components/ui/sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { Toolbox } from "lucide-react"
import { tools } from "@/lib/tools"

// "route" items are handled by the in-app router (React Router) and use
// client-side navigation. "external" items point at a page built outside
// this app (a different stack, e.g. Rust/WASM) and get a normal full-page
// link instead.
type NavItem = {
  title: string
  url: string
  kind?: "route" | "external"
}

const data: { navMain: (NavItem & { items?: NavItem[] })[] } = {
  navMain: [
    {
      title: "About This Project",
      url: "/",
      kind: "route",
    },
    {
      title: "Tools",
      url: "#",
      items: tools.map((tool) => ({
        title: tool.title,
        url: tool.url,
        kind: "route",
      })),
    },
  ],
}

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
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Toolbox className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">Hamza's Toolbox</span>
                <span className="">v0.0.1</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {data.navMain.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={location.pathname === item.url}
                  className="font-medium"
                  render={navLinkElement(item)}
                >
                  {item.title}
                </SidebarMenuButton>
                {item.items?.length ? (
                  <SidebarMenuSub>
                    {item.items.map((item) => (
                      <SidebarMenuSubItem key={item.title}>
                        <SidebarMenuSubButton
                          isActive={location.pathname === item.url}
                          render={navLinkElement(item)}
                        >
                          {item.title}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="items-end">
        <ModeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
