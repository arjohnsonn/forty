// components/sidebar.tsx
"use client";

import type React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Plus,
  Settings,
  BookOpen,
  Calendar,
  GraduationCap,
  Home,
  ChevronRight,
  Menu,
  Sheet,
  School,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Sample conversation history data
const recentConversations = [
  {
    id: "1",
    title: "Spring 2024 Schedule",
    timestamp: "2025-05-05T12:00:00Z",
  },
];

type SidebarItemProps = {
  href: string;
  icon: React.ReactNode;
  text: string;
  active?: boolean;
  target?: string;
};

const SidebarItem = ({
  href,
  icon,
  text,
  active,
  target,
}: SidebarItemProps) => {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-zinc-800 text-white"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      )}
      title={text}
      target={target}
    >
      {icon}
      <span className="truncate">{text}</span>
    </Link>
  );
};

type SectionProps = {
  title?: string;
  children: React.ReactNode;
};

const Section = ({ title, children }: SectionProps) => {
  return (
    <div className="mb-4">
      {title && (
        <h3 className="mb-1 px-3 text-xs font-medium uppercase text-zinc-500">
          {title}
        </h3>
      )}
      <div className="space-y-1">{children}</div>
    </div>
  );
};

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Mobile check
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  useEffect(() => {
    if (isMobile) {
      setMobileOpen(false);
    }
  }, [pathname, isMobile]);

  return (
    <>
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "fixed left-0 top-20 z-50 flex h-8 w-8 items-center justify-center rounded-r-md bg-zinc-800 text-white transition-all duration-300",
            collapsed ? "left-0" : "left-60"
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform",
              !collapsed && "rotate-180"
            )}
          />
        </button>
      )}

      {isMobile && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="fixed left-4 top-4 z-50 rounded-md bg-zinc-800 p-2 text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-zinc-900 text-white transition-all duration-300",
          collapsed ? "w-0 overflow-hidden" : "w-60",
          isMobile && !mobileOpen && "transform -translate-x-full",
          isMobile && mobileOpen && "transform translate-x-0 shadow-lg"
        )}
      >
        <div className="flex items-center pb-[1.43rem] border-b border-zinc-800 p-4 overflow-hidden">
          <GraduationCap className="h-5 w-5 flex-shrink-0" />
          <h1 className="ml-2 font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
            UT Registration GPT
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <Section>
            <SidebarItem
              href="/"
              icon={<Home className="h-4 w-4" />}
              text="New Chat"
              active={pathname === "/"}
            />
          </Section>

          <Section title="Recent Conversations">
            {recentConversations
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime()
              )
              .map((convo) => (
                <SidebarItem
                  key={convo.id}
                  href={`/chat/${convo.id}`}
                  icon={<MessageSquare className="h-4 w-4" />}
                  text={convo.title}
                  active={pathname === `/chat/${convo.id}`}
                />
              ))}
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

        <div className="border-t border-zinc-800 p-2">
          <SidebarItem
            href="/settings"
            icon={<Settings className="h-4 w-4" />}
            text="Settings"
            active={pathname === "/settings"}
          />
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
