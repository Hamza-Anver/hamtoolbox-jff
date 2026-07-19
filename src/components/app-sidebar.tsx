import * as React from "react"

import {
  Sidebar,
  SidebarContent,
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
import { Toolbox } from "lucide-react"

// This is sample data.
const data = {
  navMain: [
    {
      title: "About This Project",
      url: "/"
    },
    {
      title: "Tools",
      url: "#",
      items: [
        {
          title: "LaTeX Prettifier",
          url: "/tools/latex-prettifier/",
        },
        {
          title: "Data Fetching",
          url: "#",
        }
      ],
    },
  ],
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeUrl?: string
}

export function AppSidebar({ activeUrl, ...props }: AppSidebarProps) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<a href="#" />}>
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
                  isActive={activeUrl === item.url}
                  render={<a href={item.url} className="font-medium" />}
                >
                  {item.title}
                </SidebarMenuButton>
                {item.items?.length ? (
                  <SidebarMenuSub>
                    {item.items.map((item) => (
                      <SidebarMenuSubItem key={item.title}>
                        <SidebarMenuSubButton
                          isActive={activeUrl === item.url}
                          render={<a href={item.url} />}
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
      <SidebarRail />
    </Sidebar>
  )
}
