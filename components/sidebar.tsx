"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  CalendarDays,
  GraduationCap,
  SquarePen,
  CalendarPlus,
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
import { CURRENT_TERM_CODE } from "@/lib/term";

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
      "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-150",
      active
        ? "bg-texas/10 text-texas"
        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
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
  <div className="mb-6 last:mb-0">
    {title && (
      <h3 className="mb-2 whitespace-nowrap px-3 text-xs text-muted-foreground">
        {title}
      </h3>
    )}
    <div className="space-y-0.5">{children}</div>
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
          style={{ transform: collapsed ? undefined : "translateX(calc(15rem - 2px))" }}
          className="fixed left-2 top-4 z-[100] flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-[color,transform] duration-300 hover:text-foreground"
        >
          {!collapsed ? (
            <PanelRightOpen className="h-5 w-5" />
          ) : (
            <PanelRightClose className="h-5 w-5" />
          )}
        </button>
      )}

      {isMobile && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="fixed left-4 top-4 z-[100] rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-background text-foreground transition-[transform,visibility] duration-300",
          ((!isMobile && collapsed) || (isMobile && !mobileOpen)) && "invisible -translate-x-full",
          isMobile && mobileOpen && "shadow-lg",
        )}
      >
        <Link
          href="/"
          onClick={() => window.dispatchEvent(new Event("forty:new-chat"))}
          className="flex h-16 shrink-0 items-center justify-center border-b px-4 transition-colors hover:text-muted-foreground"
          title="New chat"
        >
          <Image
            src="/forty-logo.png"
            alt="Forty"
            width={28}
            height={28}
            className="flex-shrink-0"
            priority
          />
          <span className="ml-2 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
            Forty
          </span>
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
              icon={<CalendarPlus className="h-4 w-4" />}
              text="Build a schedule"
              active={pathname === "/build"}
            />
            <SidebarItem
              href="/plan"
              icon={<GraduationCap className="h-4 w-4" />}
              text="Degree plan"
              active={pathname === "/plan"}
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
              <p className="px-3 py-2 text-sm text-muted-foreground">No chats yet</p>
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
                        : "hover:bg-foreground/5",
                    )}
                  >
                    <Link
                      href={`/chat/${c.id}`}
                      title={c.title}
                      className={cn(
                        "flex h-9 items-center truncate rounded-lg pl-3 pr-10 text-sm transition-colors duration-150",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      {c.title}
                    </Link>
                    <div className="absolute inset-y-0 right-1.5 flex items-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          title="Chat options"
                          aria-label="Chat options"
                          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus:outline-none group-hover:opacity-100 data-[state=open]:opacity-100"
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
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
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
              href={`https://utdirect.utexas.edu/apps/registrar/course_schedule/${CURRENT_TERM_CODE}/`}
              icon={<Calendar className="h-4 w-4" />}
              text="Course schedule"
              target="_blank"
            />
            <SidebarItem
              href="https://utdirect.utexas.edu/apps/degree/audits/"
              icon={<GraduationCap className="h-4 w-4" />}
              text="Degree audit"
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
              text="Class registration"
              target="_blank"
            />
          </Section>
        </div>

        <div className="mx-2 mb-2 space-y-2 rounded-xl border p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Credits</span>
            <span className="font-mono tabular-nums text-foreground">
              {balance === null ? "—" : `$${balance.toFixed(2)}`}
            </span>
          </div>
          <button
            onClick={() => setTopUpOpen(true)}
            className="h-8 w-full rounded-lg border text-xs font-medium transition-colors hover:bg-foreground/5"
          >
            Add credits
          </button>
        </div>

        <div className="flex items-center gap-1 border-t p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex flex-1 items-center gap-2 overflow-hidden rounded-lg p-2 text-left transition-colors hover:bg-foreground/5">
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
                Sign out
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
          className="fixed inset-0 z-30 bg-black/50"
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
