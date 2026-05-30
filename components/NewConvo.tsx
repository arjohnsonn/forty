"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { TextareaExpand } from "@/components/ui/textarea";
import {
  Check,
  X,
  PencilOff,
  TrendingUp,
  Laptop,
  Star,
  ArrowUp,
} from "lucide-react";
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
  const [rmpEnabled, setRmpEnabled] = useState(true);
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

        <div className="flex flex-col items-center justify-center md:w-full w-[95%] rounded-xl border">
          <TextareaExpand
            className="rounded-xl w-full mt-2 resize-none overflow-y-auto max-h-60"
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
          <div className="flex flex-row justify-start gap-x-2 w-full px-3 pb-3">
            <div className="flex flex-row gap-x-2 justify-between w-full">
              <Button
                className="rounded-xl h-10 flex items-center justify-center gap-2 px-3"
                variant="outline"
                onClick={() => setRmpEnabled(!rmpEnabled)}
              >
                {rmpEnabled ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <X className="w-5 h-5 text-red-500" />
                )}
                <span>RMP</span>
              </Button>
            </div>
            <div className="flex flex-row">
              <Button
                className="rounded-full h-10 w-10 flex items-center justify-center p-0 bg-black dark:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                <ArrowUp className="w-5 h-5 dark:text-black text-white" />
              </Button>
            </div>
          </div>
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
