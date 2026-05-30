"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  GraduationCap,
  SquarePen,
  Menu,
  Sheet,
  School,
  PanelRightOpen,
  PanelRightClose,
  Trash2,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { parseMessages, deriveTitle } from "@/lib/conversations";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useToast } from "@/components/hooks/use-toast";
import { signOutAction } from "@/app/actions";

type Conversation = { id: string; title: string };

type SidebarItemProps = {
  href: string;
  icon: React.ReactNode;
  text: string;
  active?: boolean;
  target?: string;
};

const SidebarItem = ({ href, icon, text, active, target }: SidebarItemProps) => (
  <Link
    href={href}
    className={cn(
      "flex items-center gap-3 rounded-lg px-4 py-2 transition-colors duration-150 ease-in-out",
      active
        ? "bg-foreground/10 text-foreground"
        : "text-zinc-400 hover:bg-foreground/10 hover:text-foreground"
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

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [supabase] = useState(() => createClient());
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const fetchConversations = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("id, messages, created_at, deleted")
      .order("created_at", { ascending: false });

    setConversations(
      (data ?? [])
        .filter((c) => !c.deleted)
        .map((c) => ({
          id: c.id as string,
          title: deriveTitle(parseMessages(c.messages)),
        }))
    );
  }, [supabase]);

  // Live updates (insert/update/delete) via Realtime — no polling.
  useEffect(() => {
    const channel = supabase
      .channel("sidebar-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => fetchConversations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchConversations]);

  // Initial load + refresh on navigation (also a safety net if Realtime drops an event).
  useEffect(() => {
    fetchConversations();
  }, [pathname, fetchConversations]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) setMobileOpen(false);
  }, [pathname, isMobile]);

  useEffect(() => {
    const width = isMobile ? "0" : collapsed ? "0" : "15rem";
    document.documentElement.style.setProperty("--sidebar-width", width);
    return () => {
      document.documentElement.style.setProperty("--sidebar-width", "0");
    };
  }, [collapsed, isMobile]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    if (pathname === `/chat/${id}`) router.push("/");
  };

  const initials = (userEmail || "?").charAt(0).toUpperCase();

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
          isMobile && mobileOpen && "translate-x-0 transform shadow-lg"
        )}
      >
        <div className="flex items-center justify-center border-b border-b-foreground/10 p-4 pt-5">
          <GraduationCap className="h-5 w-5 flex-shrink-0" />
          <h1 className="ml-2 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
            Forty
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <Section>
            <SidebarItem
              href="/"
              icon={<SquarePen className="h-4 w-4" />}
              text="New chat"
              active={pathname === "/"}
            />
          </Section>

          <Section title="Recents">
            {conversations.length === 0 ? (
              <p className="px-4 py-1 text-sm text-zinc-500">No chats yet</p>
            ) : (
              conversations.map((c) => {
                const active = pathname === `/chat/${c.id}`;
                return (
                  <div key={c.id} className="group relative">
                    <Link
                      href={`/chat/${c.id}`}
                      title={c.title}
                      className={cn(
                        "block truncate rounded-lg py-2 pl-4 pr-9 text-sm transition-colors duration-150",
                        active
                          ? "bg-foreground/10 text-foreground"
                          : "text-zinc-400 hover:bg-foreground/10 hover:text-foreground"
                      )}
                    >
                      {c.title}
                    </Link>
                    <button
                      onClick={(e) => handleDelete(c.id, e)}
                      title="Delete chat"
                      aria-label="Delete chat"
                      className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-foreground group-hover:block"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </Section>

          <Section title="Resources">
            <SidebarItem
              href="https://utdirect.utexas.edu/apps/registrar/course_schedule/20259/"
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

        <div className="flex items-center gap-1 border-t border-foreground/10 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex flex-1 items-center gap-2 overflow-hidden rounded-lg p-2 text-left transition-colors hover:bg-foreground/10">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">{userEmail}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {userEmail}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOutAction()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
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
    </>
  );
}
