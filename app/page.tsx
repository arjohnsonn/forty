"use client";
import { Button } from "@/components/ui/button";
import { TextareaExpand } from "@/components/ui/textarea";
import { Check, X, Paperclip } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [rmpEnabled, setRmpEnabled] = useState(false);

  return (
    <>
      <div className="h-screen w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-y-2 justify-center h-full">
          <h1 className="text-3xl text-center">
            Let&apos;s make your perfect schedule
          </h1>

          <div className="flex flex-col items-center justify-center w-full rounded-xl border border-zinc-800">
            <TextareaExpand
              className="rounded-xl mt-2 resize-none overflow-y-auto max-h-60"
              placeholder="Ask anything"
              name="query"
              required
            />
            <div className="flex flex-row justify-start gap-x-2 w-full px-3 pb-2">
              <Button
                className="rounded-xl h-10 flex items-center justify-center gap-2 px-3"
                variant="outline"
              >
                <Paperclip className="w-5 h-5" />
                <span>Attach</span>
              </Button>
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
          </div>
        </div>
      </div>
    </>
  );
}
