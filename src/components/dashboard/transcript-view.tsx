"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { TranscriptTurn } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TranscriptView({
  transcript,
}: {
  transcript: TranscriptTurn[] | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!transcript || transcript.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transcript available.
      </p>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="mb-2"
      >
        {expanded ? (
          <>
            <ChevronUp className="mr-1 h-4 w-4" /> Hide transcript
          </>
        ) : (
          <>
            <ChevronDown className="mr-1 h-4 w-4" /> Show transcript ({transcript.length} turns)
          </>
        )}
      </Button>
      {expanded && (
        <div className="space-y-2">
          {transcript.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                turn.role === "assistant"
                  ? "bg-muted text-foreground"
                  : "ml-auto bg-primary text-primary-foreground"
              )}
            >
              <span className="mb-1 block text-xs font-medium opacity-70">
                {turn.role === "assistant" ? "Orvia" : "Caller"}
              </span>
              {turn.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
