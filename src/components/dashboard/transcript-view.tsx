"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { TranscriptTurn } from "@/lib/types";

export function TranscriptView({
  transcript,
}: {
  transcript: TranscriptTurn[] | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!transcript || transcript.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground/50">
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
        className="mb-3 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <>
            <ChevronUp className="mr-1.5 size-3.5" /> Hide transcript
          </>
        ) : (
          <>
            <ChevronDown className="mr-1.5 size-3.5" /> Show transcript ({transcript.length} turns)
          </>
        )}
      </Button>
      {expanded && (
        <div className="space-y-4">
          {transcript.map((turn, i) => {
            const isAI = turn.role === "assistant";
            return (
              <div
                key={i}
                className={`flex ${isAI ? "justify-start" : "justify-end"}`}
              >
                <div className="max-w-[80%] space-y-1">
                  <p
                    className={`text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground/40 ${
                      isAI ? "" : "text-right"
                    }`}
                  >
                    {isAI ? "Orvia" : "Caller"}
                  </p>
                  <div
                    className={`px-4 py-3 text-[13px] leading-relaxed ${
                      isAI
                        ? "bg-accent/30 rounded-xl rounded-tl-sm"
                        : "bg-card border border-border/40 rounded-xl rounded-tr-sm"
                    }`}
                  >
                    {turn.content}
                  </div>
                  {turn.timestamp != null && (
                    <p
                      className={`text-[10px] tabular-nums text-muted-foreground/40 ${
                        isAI ? "" : "text-right"
                      }`}
                    >
                      {Math.floor(turn.timestamp / 60)}:
                      {String(Math.floor(turn.timestamp % 60)).padStart(2, "0")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
