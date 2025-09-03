"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Counts = { left: number; right: number };

// Safe random ID for browsers without crypto.randomUUID
function makeId() {
  try {
    // @ts-expect-error: older browsers
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      // @ts-expect-error
      return crypto.randomUUID();
    }
  } catch {}
  const s = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s()}${s()}-${s()}-${s()}-${s()}-${s()}${s()}${s()}`;
}

function useDeviceVoter(roomId: string) {
  const [hash, setHash] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return; // SSR guard
    const key = "hd_voter_id";
    let v = localStorage.getItem(key);
    if (!v) {
      v = makeId();
      localStorage.setItem(key, v);
    }
    setHash(btoa(`${roomId}|${v}`).slice(0, 32));
  }, [roomId]);

  return hash;
}

export default function VotePage() {
  const { id } = useParams<{ id: string }>();
  const voterHash = useDeviceVoter(id);
  const [counts, setCounts] = useState<Counts>({ left: 0, right: 0 });
  const [voted, setVoted] = useState<"left" | "right" | null>(null);
  const [prompt, setPrompt] = useState<string>("");

  const total = counts.left + counts.right;
  const leftPct = total ? Math.round((counts.left / total) * 100) : 0;
  const rightPct = total ? 100 - leftPct : 0;

  // initial counts + prompt
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("votes").select("vote_for").eq("room_id", id);
      const left = (data || []).filter((r) => r.vote_for === "left").length;
      const right = (data || []).length - left;
      setCounts({ left, right });

      const { data: room } = await supabase.from("rooms").select("prompt_text").eq("id", id).single();
      if (room?.prompt_text) setPrompt(room.prompt_text);
    })();
  }, [id]);

  // realtime votes (CLEANUP DOES NOT RETURN A PROMISE)
  useEffect(() => {
    const ch = supabase
      .channel(`votes:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "votes", filter: `room_id=eq.${id}` },
        (payload) => {
          const v = (payload as any).new?.vote_for as "left" | "right" | undefined;
          if (v === "left") setCounts((c) => ({ ...c, left: c.left + 1 }));
          if (v === "right") setCounts((c) => ({ ...c, right: c.right + 1 }));
        }
      )
      .subscribe();

    return () => {
      // call and ignore the returned Promise to satisfy React’s cleanup typing
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ch.unsubscribe();
    };
  }, [id]);

  // listen for round start to refresh prompt (same cleanup pattern)
  useEffect(() => {
    const ch = supabase
      .channel(`room:${id}`)
      .on("broadcast", { event: "round_start" }, (payload) => {
        const pr = String((payload as any).payload?.prompt || "");
        if (pr) setPrompt(pr);
      })
      .subscribe();

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ch.unsubscribe();
    };
  }, [id]);

  const cast = async (side: "left" | "right") => {
    if (!voterHash || voted) return;
    await supabase
      .from("votes")
      .upsert(
        { room_id: id as string, voter_hash: voterHash, vote_for: side },
        { onConflict: "room_id,voter_hash" }
      );
    setVoted(side);
  };

  return (
    <main className="min-h-screen p-6 flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Audience Vote</h1>
      <p className="text-gray-600">Room {String(id).slice(0, 8)}</p>
      {prompt && (
        <div className="px-4 py-2 rounded-xl bg-yellow-100 text-yellow-800 text-center">
          Prompt: <span className="font-semibold">{prompt}</span>
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={() => cast("left")}
          disabled={!voterHash || !!voted}
          className="px-6 py-4 rounded-2xl bg-black text-white disabled:opacity-60"
        >
          Vote LEFT
        </button>
        <button
          onClick={() => cast("right")}
          disabled={!voterHash || !!voted}
          className="px-6 py-4 rounded-2xl bg-black text-white disabled:opacity-60"
        >
          Vote RIGHT
        </button>
      </div>

      {voted && <p className="text-emerald-600">Thanks! You voted {voted.toUpperCase()}.</p>}

      <div className="w-full max-w-md space-y-2 mt-4">
        <div className="text-sm text-gray-700">Live Results</div>
        <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-black" style={{ width: `${leftPct}%` }} />
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Left: {counts.left} ({leftPct}%)</span>
          <span>Right: {counts.right} ({rightPct}%)</span>
        </div>
      </div>
    </main>
  );
}
