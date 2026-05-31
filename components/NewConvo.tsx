"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { TextareaExpand } from "@/components/ui/textarea";
import { PencilOff, TrendingUp, Laptop, Star, ArrowUp } from "lucide-react";
import { useState, useEffect } from "react";

const randomGreetings = [
  "Ready to plan your *semester schedule?*",
  "Let’s craft your *perfect semester schedule*",
  "Need help designing your *class lineup?*",
  "How can I help make your *schedule better?*",
];

const starterButtonsConfig = [
  {
    label: "Find best professor",
    icon: Star,
    iconProps: { className: "w-5 h-5 text-yellow-500" },
    value: "Find best professor for ",
  },
  {
    label: "GPA boosters",
    icon: TrendingUp,
    iconProps: { className: "w-5 h-5 text-green-500" },
    value: "GPA boosters",
  },
  {
    label: "Lightwork VAPAs",
    icon: PencilOff,
    iconProps: { className: "w-5 h-5 text-sky-500" },
    value: "Lightwork VAPAs",
  },
  {
    label: "Easy web-based",
    icon: Laptop,
    iconProps: { className: "w-5 h-5 text-zinc-500" },
    value: "Easy web-based classes",
  },
];

type Props = {
  onSubmit: (greeting: string, query: string) => void;
};

const NewConvo = ({ onSubmit }: Props) => {
  // Deterministic seed so text shows on first paint; randomized after mount.
  const [greeting, setGreeting] = useState(randomGreetings[0]);
  const [parts, setParts] = useState<string[]>(randomGreetings[0].split("*"));

  useEffect(() => {
    const gr =
      randomGreetings[Math.floor(Math.random() * randomGreetings.length)];
    setGreeting(gr);
    setParts(gr.split("*"));
  }, []);

  return (
    <div className="flex-1 w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-y-3 justify-center">
        <h1 className="text-3xl text-center">
          {parts.map((text, idx) =>
            idx % 2 === 1 ? (
              <span className="text-texas font-semibold" key={idx}>
                {text}
              </span>
            ) : (
              text
            )
          )}
        </h1>

        <div className="flex w-[95%] items-end gap-2 rounded-3xl border py-1.5 pl-4 pr-2 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring md:w-full">
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
                'textarea[name="query"]'
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

        <div className="flex flex-wrap items-center justify-center gap-x-2 mx-6">
          {starterButtonsConfig.map((btn, idx) => (
            <Button
              key={idx}
              className="rounded-xl h-10 flex items-center justify-center gap-2 px-3"
              variant="outline"
              onClick={() => {
                const textarea = document.querySelector(
                  'textarea[name="query"]'
                ) as HTMLTextAreaElement | null;
                if (!textarea) return;
                textarea.value = btn.value;
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
                textarea.focus();
              }}
            >
              <btn.icon {...btn.iconProps} />
              <span>{btn.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NewConvo;
