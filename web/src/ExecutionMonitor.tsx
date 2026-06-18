import { useCallback, useEffect, useState } from "react";
import { Plan, Telemetry, getJSON, post } from "./api";
import ConfirmBanner from "./ConfirmBanner";
import TonightTargets from "./TonightTargets";

export default function ExecutionMonitor({ tel }: { tel: Telemetry | null }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPlans(await getJSON<Plan[]>("/api/transient/plans"));
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const call = async (fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const ex = tel?.executor ?? null;
  const running = ex && ex.state !== "idle";
  const pct = ex && ex.total ? Math.round((ex.current_step / ex.total) * 100) : 0;

  return (
    <div>
      <ConfirmBanner tel={tel} />
      <section className="card">
        <h2>
          Now observing
          {ex?.manual_override && <span className="pill warn" style={{ marginLeft: 8 }}>manual override</span>}
          <span className={`pill ${ex?.auto_execute ? "ok" : "idle"}`} style={{ marginLeft: 8 }}>
            auto-exec {ex?.auto_execute ? "on" : "off"}
          </span>
        </h2>
        {running ? (
          <>
            <div className="kv">
              <span>Target</span>
              <b>{ex!.object ?? "—"} <span className="muted">({ex!.mode})</span></b>
            </div>
            <div className="kv">
              <span>Step</span>
              <b>{ex!.step ?? "—"} <span className="muted">· {ex!.current_step}/{ex!.total}</span></b>
            </div>
            <div className="kv">
              <span>Exposure left</span>
              <b>{ex!.exposure_remaining > 0 ? `${ex!.exposure_remaining.toFixed(0)} s` : "—"}</b>
            </div>
            <div className="kv">
              <span>Frames</span>
              <b>{ex!.n_done} done{ex!.n_failed ? `, ${ex!.n_failed} failed` : ""}</b>
            </div>
            <div className="progress">
              <div className="bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="row">
              {ex!.state === "paused" ? (
                <button onClick={() => call(() => post("/api/transient/executor/resume"))} disabled={busy}>
                  Resume
                </button>
              ) : (
                <button onClick={() => call(() => post("/api/transient/executor/pause"))} disabled={busy}>
                  Pause
                </button>
              )}
              <button className="danger" onClick={() => call(() => post("/api/transient/executor/abort"))} disabled={busy}>
                Abort
              </button>
            </div>
          </>
        ) : (
          <div className="muted">
            idle — no block running.{" "}
            {ex?.manual_override && "Manual override is on; "}
            launch a queued block below.
            {ex?.manual_override && (
              <button
                className="small"
                onClick={() => call(() => post("/api/transient/executor/override", { on: false }))}
              >
                clear override
              </button>
            )}
          </div>
        )}
      </section>

      {err && <div className="err">{err}</div>}

      <TonightTargets />

      <section className="card">
        <h2>Plans <span className="muted">· {plans.length}</span></h2>
        {!plans.length && <div className="muted">no saved plans — build one in the Plan tab.</div>}
        {plans.map((p) => (
          <div className="candrow" key={p.id}>
            <div className="candhead">
              <b style={{ color: "#fff" }}>{p.name}</b>
              {p.object_name && <span className="pill idle">{p.object_name}</span>}
              <span className="muted">
                {(p.recipe_json ?? []).reduce((a, r) => a + (r.count || 0), 0) * p.repeat} shots
              </span>
              {p.last_block_id && <span className="pill ok">has run</span>}
            </div>
            <div className="row">
              <button className="active" disabled={busy}
                      onClick={() => call(() => post(`/api/transient/plans/${p.id}/run?resume=false`))}>Run</button>
              <button disabled={busy || !p.last_block_id}
                      title={p.last_block_id ? "Continue, skipping completed shots" : "Run once first"}
                      onClick={() => call(() => post(`/api/transient/plans/${p.id}/run?resume=true`))}>Resume</button>
            </div>
          </div>
        ))}
      </section>

    </div>
  );
}
