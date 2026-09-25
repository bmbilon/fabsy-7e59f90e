import { useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  FileChartColumnIncreasing,
  FolderOpen,
  HandCoins,
  Home,
  Inbox,
  Landmark,
  LogOut,
  MailCheck,
  Menu,
  MessageSquare,
  Newspaper,
  Search,
  Shield,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useDashboardAuth } from "@/hooks/useAdminDashboard";
import { useAdminWorkspaceLive } from "@/hooks/useAdminWorkspaceLive";
import { supabase } from "@/integrations/supabase/client";
import {
  itemHref,
  type DashboardQueue,
  type QueueItem,
} from "@/lib/admin/dashboard";

const navigation = [
  { label: "Portal queue", href: "/admin/portal", icon: Inbox, group: "Workspace" },
  { label: "Consent and payments", href: "/admin/checkout-links", icon: HandCoins, group: "Workspace" },
  {
    label: "Overview",
    href: "/admin/dashboard",
    icon: Home,
    group: "Workspace",
  },
  {
    label: "Case management",
    href: "/admin/cases",
    icon: FolderOpen,
    group: "Workspace",
  },
  {
    label: "Ontario LTB files",
    href: "/admin/ltb",
    icon: Landmark,
    group: "Workspace",
    ltb: true,
  },
  {
    label: "Work queue",
    href: "/admin/dashboard#submission-queue",
    icon: Inbox,
    group: "Workspace",
  },
  {
    label: "Performance",
    href: "/admin/dashboard#performance",
    icon: BarChart3,
    group: "Insights",
  },
  {
    label: "Live traffic",
    href: "/admin/live",
    icon: Activity,
    group: "Insights",
    admin: true,
  },
  {
    label: "Traffic & acquisition",
    href: "/admin/acquisition",
    icon: BarChart3,
    group: "Insights",
  },
  {
    label: "SMS inquiries",
    href: "/admin/sms",
    icon: MessageSquare,
    group: "Operations",
  },
  {
    label: "Consent invitations",
    href: "/admin/consent-links",
    icon: MailCheck,
    group: "Operations",
  },
  {
    label: "Insurance reports",
    href: "/admin/idr",
    icon: FileChartColumnIncreasing,
    group: "Operations",
  },
  {
    label: "Referrals",
    href: "/admin/referrals",
    icon: HandCoins,
    group: "Operations",
  },
  {
    label: "Blog & content",
    href: "/admin/blog",
    icon: Newspaper,
    group: "Manage",
  },
  { label: "AEO analytics", href: "/admin/aeo", icon: Search, group: "Manage" },
  {
    label: "User access",
    href: "/admin/users",
    icon: Shield,
    group: "Manage",
    admin: true,
  },
];
export default function AdminWorkspace({ children }: { children?: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const [command, setCommand] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [signOutError, setSignOutError] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useDashboardAuth();
  const fabsyStaff = auth.role.data === "admin" || auth.role.data === "case_manager";
  useAdminWorkspaceLive(auth.session?.user.id, fabsyStaff);
  // Practice members without a Fabsy staff role only work Ontario LTB files.
  const links = navigation.filter((item) =>
    fabsyStaff
      ? !item.admin || auth.role.data === "admin"
      : auth.role.isSuccess && "ltb" in item && item.ltb === true,
  );
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommand((open) => !open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim().slice(0, 120)), 200);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setMobile(false);
    setCommand(false);
    setSearch("");
  }, [location.pathname, location.hash]);
  const results = useQuery({
    queryKey: ["admin-command-search", auth.session?.user.id, term],
    enabled:
      command &&
      term.length >= 2 &&
      !!auth.session &&
      (auth.role.data === "admin" || auth.role.data === "case_manager"),
    queryFn: async ({ signal }) => {
      const responses = await Promise.all(
        ["submitted", "partial"].map((p_filter) =>
          supabase
            .rpc("admin_dashboard_queue", { p_filter, p_search: term })
            .abortSignal(signal),
        ),
      );
      if (responses.some((response) => response.error))
        throw new Error("Case search unavailable");
      const records = responses.flatMap(
        (response) => (response.data as unknown as DashboardQueue).items,
      );
      return Array.from(
        new Map(records.map((row) => [`${row.kind}-${row.id}`, row])).values(),
      ).slice(0, 8);
    },
    staleTime: 15_000,
    gcTime: 0,
    retry: false,
  });
  const contextualHref = (path: string) =>
    path.startsWith("/admin/dashboard#") &&
    location.pathname === "/admin/dashboard"
      ? path.replace("/admin/dashboard#", `/admin/dashboard${location.search}#`)
      : path;
  const go = (path: string) => {
    setCommand(false);
    setMobile(false);
    setSearch("");
    if (path === '/admin/portal') window.location.assign(path);
    else navigate(contextualHref(path));
  };
  const nav = (
    <nav aria-label="Admin navigation" className="space-y-5 px-3 py-5">
      {["Workspace", "Insights", "Operations", "Manage"].map((group) => (
        <div key={group}>
          <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {group}
          </h2>
          <div className="space-y-0.5">
            {links
              .filter((item) => item.group === group)
              .map((item) => {
                const Icon = item.icon;
                const active =
                  `${location.pathname}${location.hash}` === item.href;
                return (
                  <Link
                    key={item.href}
                    to={contextualHref(item.href)}
                    reloadDocument={item.href === '/admin/portal'}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobile(false)}
                    className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`}
                    />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
      <Link
        to="/"
        className="flex items-center gap-3 px-3 py-3 text-xs text-slate-500 hover:text-blue-600"
      >
        <ArrowUpRight className="h-4 w-4" />
        View website
      </Link>
    </nav>
  );
  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-800 bg-[#16202f] px-4 text-white shadow-sm sm:px-5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open admin navigation"
          onClick={() => setMobile(true)}
          className="h-8 w-8 text-slate-200 hover:bg-slate-700 hover:text-white lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link
          to="/admin/dashboard"
          aria-label="Fabsy admin overview"
          className="text-2xl font-extrabold tracking-tight lg:w-[192px]"
        >
          fabsy<span className="text-blue-400">.</span>
        </Link>
        <button
          type="button"
          onClick={() => setCommand(true)}
          className="ml-auto flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-left text-xs text-slate-300 transition-colors hover:bg-white/10 sm:ml-0 sm:max-w-md"
          aria-label="Search cases and admin tools"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Search cases & tools</span>
          <kbd className="ml-auto hidden shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] sm:block">
            ⌘ / Ctrl K
          </kbd>
        </button>
        <div className="ml-auto flex items-center gap-3">
          {fabsyStaff && <a href="/admin/portal" className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-700 px-2.5 text-xs font-medium text-white hover:bg-slate-600">
            <Inbox className="h-4 w-4" /><span>Portal queue</span>
          </a>}
          <span className="hidden rounded-md bg-white/5 px-2 py-1 text-[11px] capitalize text-slate-300 sm:inline">
            {auth.role.data?.replace("_", " ") || "Staff"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            className="h-8 w-8 text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={async () => {
              const { error } = await supabase.auth.signOut();
              if (error) setSignOutError(true);
              else navigate("/admin");
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <aside className="fixed bottom-0 left-0 top-14 hidden w-[216px] overflow-y-auto border-r border-slate-200/80 bg-[#edf0f3] lg:block">
        {nav}
      </aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent
          side="left"
          className="w-[280px] overflow-y-auto bg-[#edf0f3] p-0"
        >
          <SheetTitle className="px-6 pt-6 text-lg">Fabsy admin</SheetTitle>
          <SheetDescription className="sr-only">
            Admin navigation
          </SheetDescription>
          {nav}
        </SheetContent>
      </Sheet>
      <div id="admin-content" className="min-w-0 lg:ml-[216px]">
        {signOutError && (
          <div
            role="alert"
            className="flex justify-between bg-amber-50 p-3 text-sm text-amber-900"
          >
            Sign-out failed. Try again.
            <button
              aria-label="Dismiss sign-out error"
              onClick={() => setSignOutError(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {children || <Outlet />}
      </div>
      <CommandDialog
        open={command}
        onOpenChange={(value) => {
          setCommand(value);
          if (!value) setSearch("");
        }}
      >
        <DialogTitle className="sr-only">Search cases and tools</DialogTitle>
        <DialogDescription className="sr-only">
          Search by name, ticket number, email, or admin tool.
        </DialogDescription>
        <CommandInput
          placeholder="Search cases, ticket numbers, tools…"
          value={search}
          onValueChange={setSearch}
          maxLength={120}
        />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Tools">
            {links.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => go(item.href)}
                >
                  <Icon className="mr-2 h-4 w-4 text-slate-400" />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
          {term.length >= 2 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Cases">
                {results.isFetching && (
                  <p className="px-3 py-2 text-xs text-slate-500">
                    Searching cases…
                  </p>
                )}
                {results.isError && (
                  <p role="alert" className="px-3 py-2 text-xs text-amber-700">
                    Case search unavailable. Try again.
                  </p>
                )}
                {!results.isFetching &&
                  !results.isError &&
                  !results.data?.length && (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      No matching cases
                    </p>
                  )}
                {search.trim() === term &&
                  results.data?.map((item: QueueItem) => (
                    <CommandItem
                      key={`${item.kind}-${item.id}`}
                      value={`${search} ${item.name} ${item.ticket_number || ""}`}
                      onSelect={() => go(itemHref(item))}
                    >
                      <FolderOpen className="mr-2 h-4 w-4 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">
                        {item.name}
                        <span className="ml-2 text-xs text-slate-400">
                          {item.ticket_number || "Partial intake"}
                        </span>
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                    </CommandItem>
                  ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </div>
  );
}
