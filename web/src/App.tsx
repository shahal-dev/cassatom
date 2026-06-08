import { useEffect, useRef, useState } from "react";
import { post, Telemetry } from "./api";

function fmt(n: number | null | undefined, d = 4): string {
  return n === null || n === undefined ? "—" : n.toFixed(d);
}

export default function App() {
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [wsOk, setWsOk] = useState(false);
  const [ra, setRa] = useState("5.59");
  const [dec, setDec] = useState("-5.39");
  const [track, setTrack] = useState(true);
  const [exp, setExp] = useState("2");
  const [imgT, setImgT] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const lastImg = useRef<string | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stop = false;
    const connect = () => {
      ws = new WebSocket(`ws://${location.host}/ws/telemetry`);
      ws.onopen = () => setWsOk(true);
      ws.onclose = () => {
        setWsOk(false);
        if (!stop) setTimeout(connect, 1500);
      };
      ws.onmessage = (e) => {
        const t: Telemetry = JSON.parse(e.data);
        setTel(t);
        if (t.last_image_at && t.last_image_at !== lastImg.current) {
          lastImg.current = t.last_image_at;
          setImgT(Date.now());
        }
      };
    };
    connect();
    return () => {
      stop = true;
      ws?.close();
    };
  }, []);

  const call = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  };

  const m = tel?.mount;
  const c = tel?.camera;

  return (
    <div className="app">
      <header>
        <h1>CASSA · Virtual Site</h1>
        <span className={`pill ${wsOk ? "ok" : "bad"}`}>{wsOk ? "live" : "offline"}</span>
        <span className={`pill ${tel?.indi_connected ? "ok" : "bad"}`}>
          INDI {tel?.indi_connected ? "connected" : "down"}
        </span>
      </header>

      {err && <div className="err">{err}</div>}

      <div className="grid">
        <section className="card">
          <h2>Mount</h2>
          <div className="kv"><span>RA (h)</span><b>{fmt(m?.ra_hours)}</b></div>
          <div className="kv"><span>Dec (°)</span><b>{fmt(m?.dec_deg)}</b></div>
          <div className="badges">
            <span className={`pill ${m?.slewing ? "warn" : "idle"}`}>{m?.slewing ? "slewing" : "idle"}</span>
            <span className={`pill ${m?.tracking ? "ok" : "idle"}`}>{m?.tracking ? "tracking" : "no track"}</span>
            <span className={`pill ${m?.parked ? "warn" : "idle"}`}>{m?.parked ? "parked" : "unparked"}</span>
          </div>
          <div className="row">
            <label>RA (h)<input value={ra} onChange={(e) => setRa(e.target.value)} /></label>
            <label>Dec (°)<input value={dec} onChange={(e) => setDec(e.target.value)} /></label>
            <label className="chk"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> track</label>
          </div>
          <div className="row">
            <button onClick={() => call(() => post("/api/mount/slew", { ra_hours: parseFloat(ra), dec_deg: parseFloat(dec), track }))}>Slew</button>
            <button className="danger" onClick={() => call(() => post("/api/mount/abort"))}>Abort</button>
            <button onClick={() => call(() => post("/api/mount/park"))}>Park</button>
            <button onClick={() => call(() => post("/api/mount/unpark"))}>Unpark</button>
          </div>
        </section>

        <section className="card">
          <h2>Camera</h2>
          <div className="badges">
            <span className={`pill ${c?.exposing ? "warn" : "idle"}`}>{c?.exposing ? "exposing" : "idle"}</span>
            <span className="pill idle">t− {fmt(c?.exposure_remaining, 1)} s</span>
          </div>
          <div className="row">
            <label>Exposure (s)<input value={exp} onChange={(e) => setExp(e.target.value)} /></label>
            <button onClick={() => call(() => post("/api/camera/expose", { seconds: parseFloat(exp) }))}>Expose</button>
          </div>
          <div className="preview">
            {imgT ? (
              <img src={`/api/camera/last-image.png?t=${imgT}`} alt="last frame" />
            ) : (
              <div className="noimg">no image yet — take an exposure</div>
            )}
          </div>
        </section>
      </div>

      <footer>last update {tel?.ts ?? "—"}</footer>
    </div>
  );
}
