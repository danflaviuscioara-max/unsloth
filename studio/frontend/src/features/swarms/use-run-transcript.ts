// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import { TERMINAL, streamRunEvents } from "./api";
import { EMPTY_TRANSCRIPT, type Transcript, applyEvent } from "./transcript";

/** Live transcript for a run: replays history, then tails; reconnects from the last seq on drops. */
export function useRunTranscript(runId: number | null): Transcript {
  const [transcript, setTranscript] = useState<Transcript>(EMPTY_TRANSCRIPT);
  const lastSeq = useRef(-1);

  useEffect(() => {
    setTranscript(EMPTY_TRANSCRIPT);
    lastSeq.current = -1;
    if (runId == null) return;
    const abort = new AbortController();
    let terminal = false;

    (async () => {
      for (let attempt = 0; !abort.signal.aborted; attempt++) {
        try {
          const how = await streamRunEvents(
            runId,
            lastSeq.current,
            (e) => {
              lastSeq.current = e.seq;
              setTranscript((t) => {
                const next = applyEvent(t, e);
                terminal = next.status != null && TERMINAL.has(next.status);
                return next;
              });
            },
            abort.signal,
          );
          if (how === "end" || terminal) return;
        } catch {
          if (abort.signal.aborted) return;
        }
        await new Promise((r) => setTimeout(r, Math.min(1000 * (attempt + 1), 5000)));
      }
    })();

    return () => abort.abort();
  }, [runId]);

  return transcript;
}
