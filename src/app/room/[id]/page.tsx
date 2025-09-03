"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import confetti from "canvas-confetti";
import { PROMPTS } from "@/lib/prompts";

type Side = "left" | "right" | "spectator";
type Point = { x: number; y: number };
type Stroke = { side: Side; path: Point[]; color: string; width: number };

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const qs = useSearchParams();
  const initialSide = (qs.get("as") as Side) || null;

  const [side, setSide] = useState<Side | null>(initialSide);
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [color, setColor] = useState("#000000");
  const [width, setWidth] = useState(6);
  const [counts, setCounts] = useState({ left: 0, right: 0 });
  const [winner, setWinner] = useState<"left"|"right"|"tie"|null>(null);
  const [prompt, setPrompt] = useState<string>("");

  const leftCanvas = useRef<HTMLCanvasElement | null>(null);
  const rightCanvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const currentPath = useRef<Point[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<number | null>(null);
  const wakeRef = useRef<any>(null);

  // Responsive canvas sizing
  const resizeCanvas = (c: HTMLCanvasElement) => {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = c.getBoundingClientRect();
    c.width = Math.floor(rect.width * dpr);
    c.height = Math.floor(rect.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const drawStroke = (canvas: HTMLCanvasElement, s: Stroke) => {
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    s.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };

  const canvasFor = (which: Side) => (which === "left" ? leftCanvas.current! : rightCanvas.current!);

  // Drawing + round signals
  useEffect(() => {
    const ch = supabase.channel(`room:${id}`);
    channelRef.current = ch;

    ch.on("broadcast", { event: "stroke" }, (payload) => {
      const s = payload.payload as Stroke;
      drawStroke(canvasFor(s.side), s);
    });

    ch.on("broadcast", { event: "round_start" }, (payload) => {
      setWinner(null);
      const until = payload.payload.until as number;
      const pr = String(payload.payload.prompt || "");
      setPrompt(pr);
      setStarted(true);

      // Wake lock during round (best effort)
      const lock = async () => {
        try {
          // @ts-ignore
          if (navigator.wakeLock?.request) {
            // @ts-ignore
            wakeRef.current = await navigator.wakeLock.request("screen");
          }
        } catch {}
      };
      lock();

      const tick = () => {
        const ms = Math.max(0, until - Date.now());
        const secs = Math.ceil(ms / 1000);
        setTimeLeft(secs);
        if (ms <= 0) {
          setStarted(false);
          if (wakeRef.current) { try { wakeRef.current.release(); } catch {} wakeRef.current = null; }
          if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
          setWinner((() => (counts.left > counts.right ? "left" : counts.right > counts.left ? "right" : "tie"))());
          setTimeout(() => confetti({ particleCount: 180, spread: 70 }), 80);
        }
      };
      tick();
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(tick, 200) as unknown as number;
    });

    ch.subscribe();
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); ch.unsubscribe(); };
  }, [id, counts.left, counts.right]);

  // Vote counts (initial + realtime)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("votes").select("vote_for").eq("room_id", id);
      const left = (data || []).filter(r => r.vote_for === "left").length;
      const right = (data || []).length - left;
      setCounts({ left, right });
    })();
    const ch = supabase
      .channel(`votes:${id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "votes", filter: `room_id=eq.${id}` },
        (payload: any) => {
          const v = payload.new?.vote_for;
          if (v === "left") setCounts(c => ({ ...c, left: c.left + 1 }));
          if (v === "right") setCounts(c => ({ ...c, right: c.right + 1 }));
        }
      )
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [id]);

  // Pointer drawing
  const onPointerDown = (e: React.PointerEvent, which: Side) => {
    if (!started || side !== which) return;
    drawing.current = true;
    currentPath.current = [];
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    currentPath.current.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const onPointerMove = (e: React.PointerEvent, which: Side) => {
    if (!drawing.current || side !== which) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    currentPath.current.push(p);
    drawStroke(canvasFor(which), { side: which, path: currentPath.current.slice(-2), color, width });
  };
  const endStroke = (which: Side) => {
    if (!drawing.current || side !== which) return;
    drawing.current = false;
    const payload: Stroke = { side: which, path: currentPath.current, color, width };
    channelRef.current?.send({ type: "broadcast", event: "stroke", payload });
    currentPath.current = [];
  };

  // Start round: choose prompt, save it, broadcast with timer
  const startRound = async () => {
    const pr = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    setPrompt(pr);
    await supabase.from("rooms").update({ prompt_text: pr }).eq("id", id);
    const until = Date.now() + 30_000;
    channelRef.current?.send({ type: "broadcast", event: "round_start", payload: { until, prompt: pr } });
  };

  const clearCanvases = () => {
    [leftCanvas.current, rightCanvas.current].forEach((c) => {
      if (!c) return;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
    });
  };

  // Size canvases on load/resize
  useEffect(() => {
    const handle = () => {
      if (leftCanvas.current) resizeCanvas(leftCanvas.current);
      if (rightCanvas.current) resizeCanvas(rightCanvas.current);
    };
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  const total = counts.left + counts.right;
  const leftPct = total ? Math.round((counts.left/total)*100) : 0;
  const rightPct = total ? 100 - leftPct : 0;

  // === Stitch & Share ===
  const stitchBattle = async () => {
    if (!leftCanvas.current || !rightCanvas.current) return null;
    const L = leftCanvas.current, R = rightCanvas.current;

    // draw onto offscreen canvas at CSS pixel size
    const W = Math.max(L.clientWidth, 320);
    const H = Math.max(L.clientHeight, 240);
    const gap = 16, pad = 16, banner = 56;

    const off = document.createElement("canvas");
    off.width = W * 2 + gap + pad * 2;
    off.height = H + pad * 2 + banner;
    const ctx = off.getContext("2d")!;

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, off.width, off.height);

    // banner
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, off.width, banner);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Happy Doodle • ${prompt || "Doodle Duel"} • Room ${String(id).slice(0,8)}`, off.width/2, banner/2);

    // art
    ctx.drawImage(L, pad, banner + pad, W, H);
    ctx.drawImage(R, pad + W + gap, banner + pad, W, H);

    // footer
    ctx.fillStyle = "#333";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const verdict = winner ? (winner === "tie" ? "Tie!" : `${winner.toUpperCase()} wins!`) : "";
    ctx.fillText(`Votes • Left ${counts.left} vs Right ${counts.right} ${verdict ? "— " + verdict : ""}`, off.width/2, banner + pad + H + 12);

    const blob: Blob | null = await new Promise(res => off.toBlob(res, "image/png", 1.0));
    return blob;
  };

  const shareBattle = async () => {
    const blob = await stitchBattle();
    if (!blob) return;

    // upload to Supabase Storage
    const filename = `battle-${id}-${Date.now()}.png`;
    const up = await supabase.storage.from("battles").upload(filename, blob, { contentType: "image/png", upsert: true });
    if (up.error) { alert("Upload failed: " + up.error.message); return; }
    const { data: pub } = supabase.storage.from("battles").getPublicUrl(filename);
    const url = pub.publicUrl;

    // Share or copy/download
    // @ts-ignore
    if (navigator.share) {
      try {
        // @ts-ignore
        await navigator.share({ title: "Happy Doodle Battle", text: prompt || "Doodle battle!", url });
        return;
      } catch {}
    }
    // Fallback: copy URL + open in new tab
    try { await navigator.clipboard.writeText(url); } catch {}
    window.open(url, "_blank");
  };

  return (
    <main className="min-h-screen p-4 flex flex-col items-center gap-4 select-none">
      <h1 className="text-2xl font-bold">Room {String(id).slice(0, 8)}</h1>

      {prompt && (
        <div className="px-4 py-2 rounded-xl bg-yellow-100 text-yellow-800 text-center">
          Prompt: <span className="font-semibold">{prompt}</span>
        </div>
      )}

      {!side && (
        <div className="flex gap-3">
          <button onClick={() => setSide("left")} className="px-4 py-2 rounded-2xl bg-black text-white">Join LEFT</button>
          <button onClick={() => setSide("right")} className="px-4 py-2 rounded-2xl bg-black text-white">Join RIGHT</button>
          <button onClick={() => setSide("spectator")} className="px-4 py-2 rounded-2xl bg-gray-300">Spectate</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 justify-center">
        <label className="text-sm">Color</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <label className="text-sm ml-3">Brush</label>
        <input type="range" min={2} max={16} value={width} onChange={(e) => setWidth(parseInt(e.target.value))} />
        <button onClick={clearCanvases} className="ml-3 px-3 py-2 rounded bg-gray-200">Clear</button>
        <div className="ml-1 font-semibold">{started ? `Time: ${timeLeft}s` : "Not started"}</div>
        <button onClick={startRound} className="ml-2 px-4 py-2 rounded-2xl bg-emerald-600 text-white">Start 30s Round</button>
        <button onClick={shareBattle} className="px-4 py-2 rounded-2xl bg-blue-600 text-white">Share Battle Image</button>
      </div>

      {/* Responsive canvases */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-5xl">
        <div className="flex flex-col items-center gap-2">
          <div className="font-semibold">Left {side === "left" ? "(you)" : ""}</div>
          <canvas
            ref={leftCanvas}
            className={"w-[92vw] max-w-[420px] h-[62vw] max-h-[300px] border rounded-xl bg-white touch-none " + ((side === "left" && started) ? "cursor-crosshair" : "opacity-70")}
            onPointerDown={(e) => onPointerDown(e, "left")}
            onPointerMove={(e) => onPointerMove(e, "left")}
            onPointerUp={() => endStroke("left")}
            onPointerLeave={() => endStroke("left")}
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="font-semibold">Right {side === "right" ? "(you)" : ""}</div>
          <canvas
            ref={rightCanvas}
            className={"w-[92vw] max-w-[420px] h-[62vw] max-h-[300px] border rounded-xl bg-white touch-none " + ((side === "right" && started) ? "cursor-crosshair" : "opacity-70")}
            onPointerDown={(e) => onPointerDown(e, "right")}
            onPointerMove={(e) => onPointerMove(e, "right")}
            onPointerUp={() => endStroke("right")}
            onPointerLeave={() => endStroke("right")}
          />
        </div>
      </div>

      <div className="w-full max-w-md space-y-1 mt-2">
        <div className="text-sm text-gray-700">Live Results</div>
        <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-black" style={{ width: `${leftPct}%` }} />
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Left: {counts.left} ({leftPct}%)</span>
          <span>Right: {counts.right} ({rightPct}%)</span>
        </div>
        {winner && (
          <div className="mt-1 text-lg font-semibold">
            {winner === "tie" ? "It’s a tie!" : `${winner.toUpperCase()} wins!`}
          </div>
        )}
      </div>
    </main>
  );
}
