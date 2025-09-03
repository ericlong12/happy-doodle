"use client";
import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

type RoomRes = { id: string; joinUrl: string; spectateUrl: string };

export default function Home() {
  const [room, setRoom] = useState<RoomRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createRoom = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/room", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setRoom(json);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Happy Doodle</h1>
      <button
        onClick={createRoom}
        disabled={loading}
        className="px-5 py-3 rounded-2xl shadow bg-black text-white disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create Room"}
      </button>

      {err && <p className="text-red-600">{err}</p>}

      {room && (
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="flex flex-col items-center gap-2">
            <h2 className="font-semibold">Players: Scan to Join</h2>
            <QRCodeCanvas value={room.joinUrl} size={192} />
            <a className="text-sm underline break-all" href={room.joinUrl}>
              {room.joinUrl}
            </a>
          </div>
          <div className="flex flex-col items-center gap-2">
            <h2 className="font-semibold">Audience: Scan to Vote</h2>
            <QRCodeCanvas value={room.spectateUrl} size={192} />
            <a className="text-sm underline break-all" href={room.spectateUrl}>
              {room.spectateUrl}
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
