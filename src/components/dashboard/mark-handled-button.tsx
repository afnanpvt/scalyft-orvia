"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function MarkHandledButton({ callId }: { callId: string }) {
  const [handled, setHandled] = useState(false);
  const [loading, setLoading] = useState(false);

  async function markHandled() {
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("calls")
      .update({
        extracted_data: { handled: true, handled_at: new Date().toISOString() },
      })
      .eq("id", callId);

    if (!error) {
      setHandled(true);
    }
    setLoading(false);
  }

  if (handled) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Check className="h-3.5 w-3.5" /> Handled
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={markHandled}
      disabled={loading}
    >
      <Check className="mr-1 h-3.5 w-3.5" />
      {loading ? "Saving..." : "Mark as Handled"}
    </Button>
  );
}
