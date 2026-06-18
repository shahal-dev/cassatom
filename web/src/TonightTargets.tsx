import { useCallback, useEffect, useState } from "react";
import { del, getJSON, post } from "./api";

type Target = {
  block_id: string;
  name: string;
  class_label: string | null;
  state: string | null;
  mode: string | null;
  scheduled_utc: string | null;
  n_done: number;
  count: number | null;
  exptime_s: number | null;
  observable: boolean;
  window_start_utc: string | null;
  window_end_utc: string | null;
  best_start_utc: string | null;
  best_end_utc: string | null;
  max_alt_deg: number;
  max_alt_utc: string;
  moon_sep_deg: number | null;
};
type Resp = { available: boolean; timezone: string | null; observable_count?: number; targets: Target[] };

function fmtT(iso: string | null, tz?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-GB", { timeZone: tz || undefined, hour: "2-digit", minute: "2-digit" });
}

export default function TonightTargets() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getJSON<Resp>("/api/transient/tonight")
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)));
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const launch = async (t: Target) => {
    setBusy(t.block_id);
    try {
      await post("/api/transient/executor/launch", { block_id: t.block_id });
      refresh();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (t: Target) => {
    if (t.state === "running" && !confirm(`Abort and remove "${t.name}" (it's running)?`)) return;
    setBusy(t.block_id);
    try {
      await del(`/api/transient/queue/${t.block_id}`);
      refresh();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const reorder = async (op: string, fn: () => Promise<unknown>) => {
    setBusy(op);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };
  const move = (i: number, dir: -1 | 1) => {
    const ids = (data?.targets ?? []).map((t) => t.block_id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder("reorder", () => post("/api/transient/queue/reorder", { block_ids: ids }));
  };
  const sortBest = () => reorder("sort", () => post("/api/transient/queue/sort"));

  const targets = data?.targets ?? [];
  const obsCount = data?.observable_count ?? targets.filter((t) => t.observable).length;
  const tz = data?.timezone;
  const T = (iso: string | null) => fmtT(iso, tz);

  return (
    <section className="card">
      <h2>
        Queue
        <span className="muted"> · {targets.length} · {obsCount} observable</span>
        <button className="small" onClick={sortBest} disabled={!!busy || targets.length < 2} title="Reorder the queue by best observable time">↕ Sort by best time</button>
        <button className="small" onClick={refresh}>refresh</button>
      </h2>
      {err && <div className="err">queue: {err}</div>}
      {data && !data.available && <div className="muted">no site location configured</div>}
      {data && data.available && !targets.length && <div className="muted">queue is empty — approve a candidate in the Candidates tab.</div>}

      {targets.map((t, i) => (
        <div className={`candrow${t.observable ? "" : " dim"}`} key={t.block_id}>
          <div className="candhead">
            <span className="muted">#{i + 1}</span>
            <b style={{ color: "#fff" }}>{t.name}</b>
            {t.class_label && <span className="pill idle">{t.class_label}</span>}
            <span className={`pill ${t.state === "running" ? "ok" : t.state === "paused" ? "warn" : "idle"}`}>{t.state}</span>
            {t.count != null && <span className="muted">{t.n_done}/{t.count} · {t.exptime_s}s</span>}
            {t.scheduled_utc && <span className="pill warn" title="Scheduled start">⏰ {T(t.scheduled_utc)}</span>}
            {!t.observable && <span className="pill bad">not up tonight</span>}
          </div>
          <div className="muted" style={{ margin: "4px 0" }}>
            {t.observable ? (
              <>
                ⭐ best {t.best_start_utc ? `${T(t.best_start_utc)}–${T(t.best_end_utc)}` : `peak ${t.max_alt_deg}° @ ${T(t.max_alt_utc)}`}
                {" · "}🔭 up {T(t.window_start_utc)}–{T(t.window_end_utc)}
                {" · ▲ "}{t.max_alt_deg}°
                {t.moon_sep_deg != null ? ` · ☾ ${t.moon_sep_deg}°` : ""}
              </>
            ) : (
              <>not observable tonight — peaks at only {t.max_alt_deg}° (needs ≥30°)</>
            )}
          </div>
          <div className="row">
            <button className="small" disabled={!!busy || i === 0} onClick={() => move(i, -1)} title="Move up">↑</button>
            <button className="small" disabled={!!busy || i === targets.length - 1} onClick={() => move(i, 1)} title="Move down">↓</button>
            <button className="active" disabled={!!busy || t.state !== "queued"} onClick={() => launch(t)}>
              {t.state === "running" ? "Running…" : t.scheduled_utc ? "Launch now" : "Launch"}
            </button>
            <button className="danger" disabled={!!busy} onClick={() => remove(t)}>
              {t.state === "running" ? "Abort" : "Remove"}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
