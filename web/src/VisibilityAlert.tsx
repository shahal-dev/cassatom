import { useEffect, useState } from "react";
import { getJSON } from "./api";

type Vis = {
  observable: boolean;
  window_start_utc: string | null;
  window_end_utc: string | null;
  best_start_utc: string | null;
  best_end_utc: string | null;
  max_alt_deg: number;
  max_alt_utc: string;
  moon_sep_deg: number | null;
  timezone?: string | null;
};

function fmtT(iso: string | null, tz?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-GB", { timeZone: tz || undefined, hour: "2-digit", minute: "2-digit" });
}

// After a target is resolved, shows whether it's observable tonight (≥30° during the
// dark window), the observable window, and the best window (≥60°).
export default function VisibilityAlert({ raHours, decDeg }: { raHours: number | null; decDeg: number | null }) {
  const [v, setV] = useState<Vis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (raHours == null || decDeg == null || isNaN(raHours) || isNaN(decDeg)) {
      setV(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(() => {
      getJSON<Vis>(`/api/sky/visibility?ra_hours=${raHours}&dec_deg=${decDeg}`)
        .then((d) => { if (!cancel) { setV(d); setLoading(false); } })
        .catch(() => { if (!cancel) { setV(null); setLoading(false); } });
    }, 350);
    return () => { cancel = true; clearTimeout(t); };
  }, [raHours, decDeg]);

  if (loading && !v) return <div className="visbox">checking tonight's visibility…</div>;
  if (!v) return null;
  const tz = v.timezone;
  const T = (iso: string | null) => fmtT(iso, tz);

  if (!v.observable) {
    return (
      <div className="visbox bad">
        🚫 <b>Not observable tonight</b> — peaks at only {v.max_alt_deg}° during dark (needs ≥30°).
      </div>
    );
  }
  return (
    <div className="visbox ok">
      <div>✅ <b>Observable tonight</b> — above 30° from <b>{T(v.window_start_utc)}</b> to <b>{T(v.window_end_utc)}</b></div>
      {v.best_start_utc
        ? <div>⭐ <b>Best</b> (above 60°) from <b>{T(v.best_start_utc)}</b> to <b>{T(v.best_end_utc)}</b></div>
        : <div className="muted">never rises above 60° tonight</div>}
      <div className="muted">
        peak {v.max_alt_deg}° at {T(v.max_alt_utc)}
        {v.moon_sep_deg != null ? ` · ☾ ${v.moon_sep_deg}° away` : ""}
        {tz ? ` · times ${tz}` : ""}
      </div>
    </div>
  );
}
