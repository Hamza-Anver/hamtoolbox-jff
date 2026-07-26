import { Fragment, useEffect } from "react";
import { Outlet, useMatches } from "react-router";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface RouteHandle {
  breadcrumb?: string | string[];
  title?: string;
}

// The single prepend/postpend knob for every tab title — swap the order
// here (or the separator) to change it site-wide.
const SITE_NAME = "Hamza's Toolbox";
function formatTitle(page?: string): string {
  return page ? `${page} · ${SITE_NAME}` : SITE_NAME;
}

import { ThemeProvider } from "@/components/theme-provider";

export function RootLayout() {
  const matches = useMatches();
  const activeMatch = [...matches]
    .reverse()
    .find(
      (match) =>
        (match.handle as RouteHandle | undefined)?.breadcrumb ||
        (match.handle as RouteHandle | undefined)?.title,
    );
  const handle = activeMatch?.handle as RouteHandle | undefined;
  const crumbs = handle?.breadcrumb
    ? ([] as string[]).concat(handle.breadcrumb)
    : [];
  const pageTitle = handle?.title ?? crumbs[crumbs.length - 1];

  useEffect(() => {
    document.title = formatTitle(pageTitle);
  }, [pageTitle]);

  return (
    <ThemeProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b">
            <div className="flex items-center gap-2 px-3">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  {crumbs.map((crumb, index) => (
                    <Fragment key={crumb}>
                      {index > 0 && (
                        <BreadcrumbSeparator className="hidden md:block" />
                      )}
                      <BreadcrumbItem
                        className={
                          index < crumbs.length - 1
                            ? "hidden md:block"
                            : undefined
                        }
                      >
                        {index === crumbs.length - 1 ? (
                          <BreadcrumbPage>{crumb}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink href="#">{crumb}</BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  );
}
