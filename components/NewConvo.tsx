"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TextareaExpand } from "@/components/ui/textarea";
import { CourseSearchInput } from "@/components/course-search-input";
import { PrefSelect } from "@/components/pref-select";
import { DayPills, dayCodesToNames } from "@/components/day-pills";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  type LucideIcon,
  Wand2,
  TrendingUp,
  Users,
  Star,
  ArrowUp,
  X,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

const randomGreetings = [
  "Ready to plan your *semester schedule?*",
  "Let’s craft your *perfect semester schedule*",
  "Need help designing your *class lineup?*",
  "How can I help make your *schedule better?*",
];

// Each starter opens a dialog that collects its fields, then `compose()` builds the prompt
// from the entered values (which is dropped into the input — not sent automatically).
type StarterField = {
  key: string;
  label: string;
  type: "course" | "text" | "select" | "toggle" | "days";
  placeholder?: string;
  multiple?: boolean; // course
  professors?: boolean; // course: also search professors
  options?: { value: string; label: string }[]; // select
  default?: string;
};
type Starter = {
  label: string; // button label under the input (kept as-is)
  title: string; // dialog title (Title Case)
  icon: LucideIcon;
  iconProps: { className: string };
  fields: StarterField[];
  required: string[]; // field keys that must be filled to enable Insert
  compose: (v: Record<string, string>) => string;
};

const clean = (s: string | undefined) => (s ?? "").trim().replace(/,\s*$/, "");

const starterButtonsConfig: Starter[] = [
  {
    label: "Build my schedule",
    title: "Build My Schedule",
    icon: Wand2,
    iconProps: { className: "w-5 h-5 text-texas" },
    required: ["classes"],
    fields: [
      {
        key: "classes",
        label: "Classes",
        type: "course",
        multiple: true,
        placeholder: "C S 314, M 408C, HIS 315K",
      },
      {
        key: "earliest",
        label: "Earliest start",
        type: "select",
        default: "any",
        options: [
          { value: "any", label: "No preference" },
          { value: "9 AM", label: "After 9 AM" },
          { value: "10 AM", label: "After 10 AM" },
          { value: "11 AM", label: "After 11 AM" },
          { value: "noon", label: "After noon" },
        ],
      },
      {
        key: "latest",
        label: "Latest end",
        type: "select",
        default: "any",
        options: [
          { value: "any", label: "No preference" },
          { value: "3 PM", label: "Before 3 PM" },
          { value: "5 PM", label: "Before 5 PM" },
          { value: "7 PM", label: "Before 7 PM" },
        ],
      },
      {
        key: "gaps",
        label: "Gaps between classes",
        type: "select",
        default: "any",
        options: [
          { value: "any", label: "No preference" },
          { value: "minimize", label: "Back-to-back (minimal gaps)" },
          { value: "breaks", label: "Spread out (some breaks)" },
        ],
      },
      { key: "daysOff", label: "Days off", type: "days" },
      {
        key: "bestProfs",
        label: "Prefer highly-rated professors",
        type: "toggle",
        default: "true",
      },
    ],
    compose: (v) => {
      const prefs: string[] = [];
      if (v.earliest && v.earliest !== "any")
        prefs.push(`no classes before ${v.earliest}`);
      if (v.latest && v.latest !== "any")
        prefs.push(`no classes after ${v.latest}`);
      if (v.gaps === "minimize") prefs.push("minimal gaps between classes");
      if (v.gaps === "breaks") prefs.push("some breaks between classes");
      const offDays = dayCodesToNames(v.daysOff);
      if (offDays.length) prefs.push(`no classes on ${offDays.join(", ")}`);
      if (v.bestProfs === "true") prefs.push("the highest-rated professors");
      const base = `Build me a conflict-free schedule with ${clean(v.classes)}.`;
      return prefs.length ? `${base} Prefer ${prefs.join(", ")}.` : base;
    },
  },
  {
    label: "Find easy A's",
    title: "Find Easy A's",
    icon: TrendingUp,
    iconProps: { className: "w-5 h-5 text-green-500" },
    required: ["subject"],
    fields: [
      {
        key: "subject",
        label: "Subject or Major",
        type: "text",
        placeholder: "Computer Science",
      },
    ],
    compose: (v) =>
      `What are the easiest GPA-boosting classes for ${clean(v.subject)}?`,
  },
  {
    label: "Best professor",
    title: "Best Professor",
    icon: Star,
    iconProps: { className: "w-5 h-5 text-yellow-500" },
    required: ["class"],
    fields: [
      { key: "class", label: "Class", type: "course", placeholder: "C S 314" },
    ],
    compose: (v) =>
      `Who's the best professor for ${clean(v.class)} based on ratings and grades?`,
  },
  {
    label: "Compare professors",
    title: "Compare Professors",
    icon: Users,
    iconProps: { className: "w-5 h-5 text-sky-500" },
    required: ["target"],
    fields: [
      {
        key: "target",
        label: "Class or professors",
        type: "course",
        multiple: true,
        professors: true,
        placeholder: "M 408C, or professors to compare",
      },
    ],
    compose: (v) => {
      const items = (v.target ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const courses = items.filter((s) => /\d{3}/.test(s)); // course codes carry a 3-digit number
      const profs = items.filter((s) => !/\d{3}/.test(s));
      const parts: string[] = [];
      if (courses.length)
        parts.push(`the professors teaching ${courses.join(", ")}`);
      if (profs.length) parts.push(profs.join(" and "));
      const subject = parts.join(", and ") || clean(v.target);
      return `Compare ${subject} by rating and average GPA.`;
    },
  },
];

type Props = {
  onSubmit: (greeting: string, query: string) => void;
};

const NewConvo = ({ onSubmit }: Props) => {
  // Deterministic seed so text shows on first paint; randomized after mount.
  const [greeting, setGreeting] = useState(randomGreetings[0]);
  const [parts, setParts] = useState<string[]>(randomGreetings[0].split("*"));
  const [activeStarter, setActiveStarter] = useState<Starter | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  // Set when Insert is clicked; consumed in the dialog's onCloseAutoFocus so the prompt is
  // written into the input after the focus trap releases (otherwise the trap steals focus).
  const pendingInsert = useRef<string | null>(null);

  useEffect(() => {
    const gr =
      randomGreetings[Math.floor(Math.random() * randomGreetings.length)];
    setGreeting(gr);
    setParts(gr.split("*"));
  }, []);

  const allFilled = !!activeStarter?.required.every((k) =>
    fieldValues[k]?.trim(),
  );

  // Drop the composed prompt into the input (don't send) so the user can review/edit it.
  const insertStarter = () => {
    if (!activeStarter || !allFilled) return;
    pendingInsert.current = activeStarter.compose(fieldValues);
    setActiveStarter(null);
  };

  return (
    <div className="flex-1 w-full flex items-center justify-center">
      <div className="flex w-full flex-col items-center justify-center gap-y-3 px-4">
        <h1 className="text-2xl text-center sm:text-3xl">
          {parts.map((text, idx) =>
            idx % 2 === 1 ? (
              <span className="text-texas font-semibold" key={idx}>
                {text}
              </span>
            ) : (
              text
            ),
          )}
        </h1>

        <div className="flex w-full max-w-2xl items-end gap-2 rounded-3xl border py-1.5 pl-4 pr-2 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
          <TextareaExpand
            rows={1}
            className="max-h-60 min-h-0 flex-1 resize-none self-center overflow-y-auto border-0 bg-transparent px-0 py-2 focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const textarea = e.currentTarget as HTMLTextAreaElement;
                const query = textarea.value.trim();
                if (!query) return;
                onSubmit(greeting, query);
                textarea.value = "";
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }}
            placeholder="Ask anything"
            name="query"
            required
          />
          <Button
            className="h-9 w-9 shrink-0 rounded-full border-transparent bg-texas p-0 transition-colors hover:bg-texas/90 disabled:cursor-not-allowed disabled:opacity-50"
            variant="outline"
            onClick={() => {
              const textarea = document.querySelector(
                'textarea[name="query"]',
              ) as HTMLTextAreaElement | null;
              if (!textarea || !textarea.value.trim()) return;
              const query = textarea.value.trim();
              onSubmit(greeting, query);
              textarea.value = "";
              textarea.dispatchEvent(new Event("input", { bubbles: true }));
            }}
          >
            <ArrowUp className="h-5 w-5 text-white" />
          </Button>
        </div>

        <div className="flex w-full max-w-2xl flex-wrap items-center justify-center gap-2 lg:max-w-none lg:flex-nowrap">
          {starterButtonsConfig.map((btn, idx) => (
            <Button
              key={idx}
              className="rounded-xl h-10 flex items-center justify-center gap-2 px-3"
              variant="outline"
              onClick={() => {
                setFieldValues(
                  Object.fromEntries(
                    btn.fields.map((f) => [f.key, f.default ?? ""]),
                  ),
                );
                setActiveStarter(btn);
              }}
            >
              <btn.icon {...btn.iconProps} />
              <span>{btn.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <Dialog
        open={!!activeStarter}
        onOpenChange={(o) => !o && setActiveStarter(null)}
      >
        <DialogPortal>
          <DialogOverlay />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Built from primitives (not the shared DialogContent) so its overflow stays
                visible — the course autocomplete dropdown can extend past the dialog. */}
            <DialogPrimitive.Content
              aria-describedby={undefined}
              onCloseAutoFocus={(e) => {
                const query = pendingInsert.current;
                if (query == null) return; // normal close → let focus return to the trigger
                pendingInsert.current = null;
                e.preventDefault();
                const textarea = document.querySelector(
                  'textarea[name="query"]',
                ) as HTMLTextAreaElement | null;
                if (!textarea) return;
                textarea.value = query;
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
                textarea.focus();
                textarea.setSelectionRange(query.length, query.length);
              }}
              className="relative flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            >
              <DialogTitle className="flex items-center gap-2">
                {activeStarter && (
                  <activeStarter.icon {...activeStarter.iconProps} />
                )}
                {activeStarter?.title ?? "Quick Start"}
              </DialogTitle>
              <DialogPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
              {activeStarter && (
                <>
                  <div className="space-y-3">
                    {activeStarter.fields.map((f, i) => {
                      if (f.type === "toggle") {
                        return (
                          <label
                            key={f.key}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={fieldValues[f.key] === "true"}
                              onCheckedChange={(c) =>
                                setFieldValues((p) => ({
                                  ...p,
                                  [f.key]: c ? "true" : "",
                                }))
                              }
                            />
                            {f.label}
                          </label>
                        );
                      }
                      return (
                        <div key={f.key} className="space-y-1.5">
                          <Label htmlFor={f.key}>{f.label}</Label>
                          {f.type === "course" ? (
                            <CourseSearchInput
                              id={f.key}
                              autoFocus={i === 0}
                              multiple={f.multiple}
                              includeProfessors={f.professors}
                              value={fieldValues[f.key] ?? ""}
                              onChange={(v) =>
                                setFieldValues((p) => ({ ...p, [f.key]: v }))
                              }
                              onEnter={insertStarter}
                              placeholder={f.placeholder}
                            />
                          ) : f.type === "select" ? (
                            <PrefSelect
                              id={f.key}
                              value={fieldValues[f.key] ?? f.default ?? ""}
                              options={f.options ?? []}
                              onChange={(v) =>
                                setFieldValues((p) => ({ ...p, [f.key]: v }))
                              }
                            />
                          ) : f.type === "days" ? (
                            <DayPills
                              value={fieldValues[f.key] ?? ""}
                              onChange={(v) =>
                                setFieldValues((p) => ({ ...p, [f.key]: v }))
                              }
                            />
                          ) : (
                            <Input
                              id={f.key}
                              autoFocus={i === 0}
                              value={fieldValues[f.key] ?? ""}
                              onChange={(e) =>
                                setFieldValues((p) => ({
                                  ...p,
                                  [f.key]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  insertStarter();
                                }
                              }}
                              placeholder={f.placeholder}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setActiveStarter(null)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={insertStarter} disabled={!allFilled}>
                      Insert
                    </Button>
                  </div>
                </>
              )}
            </DialogPrimitive.Content>
          </div>
        </DialogPortal>
      </Dialog>
    </div>
  );
};

export default NewConvo;
