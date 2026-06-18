import { useEffect, useRef, useState } from "react";
import { ActivityEvent, Telemetry, getJSON } from "./api";

const KIND: Record<string, string> = {
  cmd: "k-cmd", exec: "k-exec", alert: "k-alert", error: "k-error", info: "k-info",
};

const f = (n: number | null | undefined, d = 1) => (n == null ? "—" : n.toFixed(d));

// Floating stats terminal for the Console — hidden by default; toggle with the
// button (bottom-right) or the ` (backtick) hotkey. Stats stream from the 2 Hz
// telemetry; the log polls /api/activity.
export default function BottomTerminal({ tel }: { tel: Telemetry | null }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<ActivityEvent[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const load = () => getJSON<ActivityEvent[]>("/api/activity?limit=200").then(setLog).catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === "`" && !el?.matches?.("input, textarea, select")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [log, open]);

  const m = tel?.mount, c = tel?.camera, ex = tel?.executor, g = tel?.guiding;
  const sf = tel?.safety, foc = tel?.focuser, fw = tel?.filter, prec = tel?.precision;
  const wx = sf?.weather;
  const safePill = (s: string) => (s === "safe" ? "ok" : s === "warn" ? "warn" : "bad");
  const mountState = m?.parked ? "parked" : m?.slewing ? "slewing" : m?.tracking ? "tracking" : "idle";
  const expRemain = ex && ex.state === "running" ? ex.exposure_remaining : c?.exposure_remaining ?? 0;

  if (!open) {
    return (
      <button className="term-toggle" onClick={() => setOpen(true)} title="Open stats terminal (`)">
        ⌨ stats
        {sf && <span className={`pill ${safePill(sf.state)}`}>{sf.state}</span>}
      </button>
    );
  }

  const lines = [...log].reverse(); // API is newest-first; terminal flows oldest → newest

  return (
    <div className="term">
      <div className="term-stats">
        {/* safety + weather */}
        {sf && <span className={`pill ${safePill(sf.state)}`}>● {sf.state}</span>}
        {sf?.sun_alt != null && <span className="muted">{sf.sun_alt > 0 ? "☀ day" : "🌙 night"} {f(sf.sun_alt, 0)}°</span>}
        {wx && (
          <span className="muted">
            {wx.temperature != null ? `🌡 ${wx.temperature}° ` : ""}
            {wx.humidity != null ? `· RH ${wx.humidity}% ` : ""}
            {wx.wind_speed != null ? `· 💨 ${wx.wind_speed} ` : ""}
            {wx.clouds != null ? `· ☁ ${wx.clouds}%` : ""}
            {wx.rain ? " · RAIN" : ""}
          </span>
        )}
        <span className="term-sep" />

        {/* mount + target */}
        <span className="term-grp">🔭 <b>RA</b> {f(m?.ra_hours, 3)}h <b>Dec</b> {f(m?.dec_deg, 2)}° · <b>Alt</b> {f(m?.alt_deg, 0)}° · {mountState}</span>
        {ex && ex.state !== "idle" && ex.object && <span className="term-grp">🎯 <b>{ex.object}</b></span>}
        <span className="term-sep" />

        {/* exposure + sequence */}
        {ex && ex.state !== "idle" ? (
          <span className="term-grp">
            ▶ {ex.step ?? ex.state}
            {expRemain > 0 ? ` · ${Math.round(expRemain)}s` : ""}
            {ex.total ? ` · step ${ex.current_step}/${ex.total}` : ""}
            {` · ${ex.n_done}✓${ex.n_failed ? ` ${ex.n_failed}✗` : ""}`}
          </span>
        ) : (
          <span className="muted">📷 {c?.exposing ? `exposing ${Math.round(c.exposure_remaining)}s` : "idle"}</span>
        )}
        <span className="term-sep" />

        {/* guiding + focus */}
        {g?.connected && <span className="muted">guide {f(g.rms_ra, 2)}/{f(g.rms_dec, 2)}″</span>}
        {foc?.position != null && <span className="muted">foc {f(foc.position, 0)}{foc.moving ? "⟳" : ""}</span>}
        {fw?.name && <span className="muted">filt {fw.name}</span>}
        {prec?.center?.running && <span className="pill warn">solving</span>}
        {prec?.autofocus?.running && <span className="pill warn">focusing</span>}

        <button className="small" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)} title="Close (`)">▼ close</button>
      </div>

      <div className="term-body" ref={bodyRef}>
        {!lines.length && <div className="muted">no activity yet</div>}
        {lines.map((e, i) => (
          <div className="logline" key={i}>
            <span className="logts">{e.ts}</span>
            <span className={KIND[e.kind] ?? "k-info"}>{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
