"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  CalendarDays,
  GraduationCap,
  SquarePen,
  Wand2,
  Menu,
  Sheet,
  School,
  BookOpen,
  Users,
  PanelRightOpen,
  PanelRightClose,
  Trash2,
  Pencil,
  MoreHorizontal,
  LogOut,
  Settings,
  Sparkles,
  FileText,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { parseMessages, deriveTitle } from "@/lib/conversations";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AccountSettingsDialog } from "@/components/account-settings-dialog";
import { TopUpDialog } from "@/components/topup-dialog";
import { useToast } from "@/components/hooks/use-toast";
import { signOutAction } from "@/app/actions";

type Conversation = { id: string; title: string };

type SidebarItemProps = {
  href: string;
  icon: React.ReactNode;
  text: string;
  active?: boolean;
  target?: string;
  onClick?: () => void;
};

const SidebarItem = ({
  href,
  icon,
  text,
  active,
  target,
  onClick,
}: SidebarItemProps) => (
  <Link
    href={href}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 rounded-lg px-4 py-2 transition-colors duration-150 ease-in-out",
      active
        ? "bg-texas/10 text-texas"
        : "text-zinc-600 hover:bg-foreground/10 hover:text-foreground dark:text-zinc-400",
    )}
    title={text}
    target={target}
  >
    {icon}
    <span className="truncate">{text}</span>
  </Link>
);

const Section = ({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) => (
  <div className="mb-4">
    {title && (
      <h3 className="mb-1 whitespace-nowrap px-3 text-xs font-medium uppercase text-zinc-500 dark:text-neutral-400">
        {title}
      </h3>
    )}
    <div className="space-y-1">{children}</div>
  </div>
);

export function Sidebar({
  userEmail,
  userName,
  userProvider,
}: {
  userEmail: string;
  userName: string;
  userProvider: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [supabase] = useState(() => createClient());
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const fetchConversations = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("id, messages, created_at, deleted, title")
      .order("created_at", { ascending: false });

    setConversations(
      (data ?? [])
        .filter((c) => !c.deleted)
        .map((c) => ({
          id: c.id as string,
          title:
            (c.title as string | null)?.trim() ||
            deriveTitle(parseMessages(c.messages)),
        })),
    );
  }, [supabase]);

  const fetchBalance = useCallback(async () => {
    const { data } = await supabase.rpc("credit_balance");
    setBalance(Number(data ?? 0));
  }, [supabase]);

  // Live updates (insert/update/delete) via Realtime - no polling. A finished chat persists the
  // conversation AND debits credits in the same step, so refresh the balance off the same event.
  useEffect(() => {
    const channel = supabase
      .channel("sidebar-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          fetchConversations();
          fetchBalance();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchConversations, fetchBalance]);

  // Reflect a rename done from the conversation header immediately (without waiting on a refetch).
  useEffect(() => {
    const onRename = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>)
        .detail;
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c)),
      );
    };
    window.addEventListener("forty:rename", onRename);
    return () => window.removeEventListener("forty:rename", onRename);
  }, []);

  // Initial load + refresh on navigation (also a safety net if Realtime drops an event).
  useEffect(() => {
    fetchConversations();
    fetchBalance();
  }, [pathname, fetchConversations, fetchBalance]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) setMobileOpen(false);
  }, [pathname, isMobile]);

  // The auth-state base width is set on <body> by the layout (from the server-known user),
  // so it's correct pre-paint on load and on sign-in/out. Here we only override for the
  // client-only collapse/mobile states, writing to the same element so it isn't shadowed.
  useEffect(() => {
    const width = isMobile ? "0px" : collapsed ? "0px" : "15rem";
    document.body.style.setProperty("--sidebar-width", width);
  }, [collapsed, isMobile]);

  const handleDelete = async (id: string) => {
    setDeleteTarget(null);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase
      .from("conversations")
      .update({ deleted: true })
      .eq("id", id);
    if (error) {
      fetchConversations();
      toast({ variant: "destructive", title: "Couldn't delete chat" });
      return;
    }
    // Resets the in-place landing view if it's showing this chat (router desynced); the pathname
    // check handles the normal /chat/<id> route.
    window.dispatchEvent(new CustomEvent("forty:deleted", { detail: { id } }));
    if (pathname === `/chat/${id}`) router.push("/");
  };

  const handleRename = async () => {
    const target = renameTarget;
    const next = draftTitle.trim();
    setRenameTarget(null);
    if (!target || !next || next === target.title) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === target.id ? { ...c, title: next } : c)),
    );
    window.dispatchEvent(
      new CustomEvent("forty:rename", {
        detail: { id: target.id, title: next },
      }),
    );
    const { error } = await supabase
      .from("conversations")
      .update({ title: next })
      .eq("id", target.id);
    if (error) {
      fetchConversations();
      toast({ variant: "destructive", title: "Couldn't rename chat" });
    }
  };

  const displayName = userName?.trim() || userEmail;
  const initials = (displayName || "?").charAt(0).toUpperCase();

  return (
    <>
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{ left: collapsed ? 8 : "calc(var(--sidebar-width) + 6px)" }}
          className="fixed top-5 z-[100] flex h-8 w-8 items-center justify-center rounded-r-md text-foreground transition-all duration-300 ease-in-out hover:text-zinc-400 active:text-zinc-500"
        >
          {!collapsed ? (
            <PanelRightOpen className="h-6 w-6" />
          ) : (
            <PanelRightClose className="h-6 w-6" />
          )}
        </button>
      )}

      {isMobile && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="fixed left-4 top-4 z-[100] rounded-md p-2 text-foreground transition-colors duration-150 ease-in-out hover:text-zinc-400 active:text-zinc-500"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-background text-foreground transition-all duration-300",
          collapsed ? "w-0 overflow-hidden" : "w-60",
          !collapsed && "border-r border-foreground/10",
          isMobile && !mobileOpen && "-translate-x-full transform",
          isMobile && mobileOpen && "translate-x-0 transform shadow-lg",
        )}
      >
        <Link
          href="/"
          onClick={() => window.dispatchEvent(new Event("forty:new-chat"))}
          className="flex items-center justify-center border-b border-b-foreground/10 p-4 pt-5 transition-colors hover:text-zinc-400"
          title="New chat"
        >
          <GraduationCap className="h-5 w-5 flex-shrink-0" />
          <h1 className="ml-2 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
            Forty
          </h1>
        </Link>

        <div className="flex-1 overflow-y-auto p-2">
          <Section>
            <SidebarItem
              href="/"
              icon={<SquarePen className="h-4 w-4" />}
              text="New chat"
              active={pathname === "/"}
              // Reset the landing UI even when the router already thinks it's on "/" (after an
              // in-place chat start, where the URL was changed via history.replaceState).
              onClick={() => window.dispatchEvent(new Event("forty:new-chat"))}
            />
            <SidebarItem
              href="/build"
              icon={<Wand2 className="h-4 w-4" />}
              text="Build a Schedule"
              active={pathname === "/build"}
            />
            <SidebarItem
              href="/calendar"
              icon={<CalendarDays className="h-4 w-4" />}
              text="Calendar"
              active={pathname === "/calendar"}
            />
            <SidebarItem
              href="/courses"
              icon={<BookOpen className="h-4 w-4" />}
              text="Courses"
              active={pathname === "/courses"}
            />
            <SidebarItem
              href="/professors"
              icon={<Users className="h-4 w-4" />}
              text="Professors"
              active={pathname === "/professors"}
            />
          </Section>

          <Section title="Recents">
            {conversations.length === 0 ? (
              <p className="px-4 py-1 text-sm text-zinc-500">No chats yet</p>
            ) : (
              conversations.map((c) => {
                const active = pathname === `/chat/${c.id}`;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "group relative rounded-lg transition-colors duration-150",
                      active
                        ? "bg-texas/10 text-texas"
                        : "hover:bg-foreground/10",
                    )}
                  >
                    <Link
                      href={`/chat/${c.id}`}
                      title={c.title}
                      className={cn(
                        "block truncate rounded-lg py-2 pl-4 pr-10 text-sm transition-colors duration-150",
                        active
                          ? "text-foreground"
                          : "text-zinc-600 group-hover:text-foreground dark:text-zinc-400",
                      )}
                    >
                      {c.title}
                    </Link>
                    <div className="absolute inset-y-0 right-1.5 flex items-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          title="Chat options"
                          aria-label="Chat options"
                          className="rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-foreground/20 hover:text-foreground focus:outline-none group-hover:opacity-100 data-[state=open]:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="right">
                          <DropdownMenuItem
                            onClick={() => {
                              setDraftTitle(c.title);
                              setRenameTarget(c);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(c)}
                            className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })
            )}
          </Section>

          <Section title="Resources">
            <SidebarItem
              href="https://utdirect.utexas.edu/apps/registrar/course_schedule/20269/"
              icon={<Calendar className="h-4 w-4" />}
              text="Course Schedule"
              target="_blank"
            />
            <SidebarItem
              href="https://utdirect.utexas.edu/apps/degree/audits/"
              icon={<GraduationCap className="h-4 w-4" />}
              text="Degree Audit"
              target="_blank"
            />
            <SidebarItem
              href="https://utdirect.utexas.edu/registrar/ris.WBX"
              icon={<Sheet className="h-4 w-4" />}
              text="Reg. Info Sheet (RIS)"
              target="_blank"
            />
            <SidebarItem
              href="https://utdirect.utexas.edu/registration/chooseSemester.WBX"
              icon={<School className="h-4 w-4" />}
              text="Class Registration"
              target="_blank"
            />
          </Section>
        </div>

        <div className="mx-2 mb-1 space-y-1 rounded-lg border border-foreground/10 px-3 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 shrink-0" /> Credits
            </span>
            <span className="font-medium text-foreground">
              {balance === null ? "—" : `$${balance.toFixed(2)}`}
            </span>
          </div>
          <button
            onClick={() => setTopUpOpen(true)}
            className="w-full rounded-md border border-texas/40 py-1.5 text-xs font-medium text-texas transition-colors hover:bg-texas/10"
          >
            Add credits
          </button>
        </div>

        <div className="flex items-center gap-1 border-t border-foreground/10 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex flex-1 items-center gap-2 overflow-hidden rounded-lg p-2 text-left transition-colors hover:bg-foreground/10">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">{displayName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {userEmail}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOutAction()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/terms">
                  <FileText className="mr-2 h-4 w-4" />
                  Terms
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/privacy">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Privacy
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/refund">
                  <Receipt className="mr-2 h-4 w-4" />
                  Refunds
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeSwitcher />
        </div>
      </div>

      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 transition-opacity duration-300"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <AccountSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        userEmail={userEmail}
        userName={userName}
        userProvider={userProvider}
      />

      <TopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRename();
              }
            }}
            placeholder="Chat name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!draftTitle.trim()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              This permanently removes “{deleteTarget?.title}”. This can’t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
