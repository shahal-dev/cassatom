import { useCallback, useEffect, useState } from "react";
import { getJSON, IndiDevice, post, ROLES, Telemetry } from "./api";

export default function Devices({ tel }: { tel: Telemetry | null }) {
  const [devs, setDevs] = useState<IndiDevice[]>([]);
  const [ports, setPorts] = useState<Record<string, string>>({});
  const [roleSel, setRoleSel] = useState<Record<string, string>>({});
  const [host, setHost] = useState("");
  const [portN, setPortN] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scan = useCallback(async () => {
    try {
      setDevs(await getJSON<IndiDevice[]>("/api/indi/devices"));
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }, []);

  // refresh device list whenever the transport (re)connects
  const connected = tel?.indi_connected;
  useEffect(() => {
    if (connected) scan();
  }, [connected, scan]);

  // seed the server host/port fields from telemetry once
  useEffect(() => {
    if (tel?.server && !host) {
      setHost(tel.server.host);
      setPortN(String(tel.server.port));
    }
  }, [tel?.server, host]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      await scan();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const bind = (d: IndiDevice) => {
    const role = roleSel[d.device] || d.roles[0];
    if (!role) {
      setErr(`pick a role for ${d.device}`);
      return;
    }
    const params =
      role === "mount" && d.has_port && ports[d.device]
        ? { DEVICE_PORT: { PORT: ports[d.device] } }
        : undefined;
    run(() => post("/api/devices/bind", { role, device: d.device, params }));
  };

  return (
    <section className="card devices">
      <h2>
        Devices
        <span className={`pill ${connected ? "ok" : "bad"}`} style={{ marginLeft: 8 }}>
          INDI {connected ? "connected" : "down"}
        </span>
      </h2>

      {err && <div className="err">{err}</div>}

      <div className="row">
        <label>INDI host<input value={host} onChange={(e) => setHost(e.target.value)} style={{ width: 140 }} /></label>
        <label>port<input value={portN} onChange={(e) => setPortN(e.target.value)} style={{ width: 70 }} /></label>
        <button disabled={busy} onClick={() => run(() => post("/api/indi/server", { host, port: parseInt(portN, 10) }))}>
          Connect server
        </button>
        <button disabled={busy} onClick={scan}>Scan</button>
        <button disabled={busy || !connected} onClick={() => run(() => post("/api/devices/autodetect"))}>
          Auto-detect &amp; connect all
        </button>
      </div>

      <table className="devtable">
        <thead>
          <tr><th>Device</th><th>Roles</th><th>Serial port</th><th>State</th><th></th></tr>
        </thead>
        <tbody>
          {!devs.length && (
            <tr><td colSpan={5} className="muted">{connected ? "no devices — click Scan" : "INDI server not connected"}</td></tr>
          )}
          {devs.map((d) => (
            <tr key={d.device}>
              <td><b>{d.device}</b></td>
              <td>
                {d.roles.length > 1 ? (
                  <select value={roleSel[d.device] || d.roles[0]} onChange={(e) => setRoleSel({ ...roleSel, [d.device]: e.target.value })}>
                    {d.roles.map((r) => <option key={r}>{r}</option>)}
                  </select>
                ) : (
                  <span className="muted">{d.roles[0] ?? "—"}</span>
                )}
              </td>
              <td>
                {d.has_port ? (
                  <input
                    placeholder="/dev/ttyUSB0"
                    value={ports[d.device] ?? d.port ?? ""}
                    onChange={(e) => setPorts({ ...ports, [d.device]: e.target.value })}
                    style={{ width: 150 }}
                  />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                {d.bound_as ? <span className="pill ok">{d.bound_as}</span>
                  : d.connected ? <span className="pill warn">connected</span>
                  : <span className="pill idle">idle</span>}
              </td>
              <td>
                {d.bound_as ? (
                  <button disabled={busy} className="danger" onClick={() => run(() => post("/api/devices/unbind", { role: d.bound_as }))}>
                    Disconnect
                  </button>
                ) : (
                  <button disabled={busy || !d.roles.length} onClick={() => bind(d)}>Connect</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bindsummary">
        {ROLES.map((r) => (
          <span key={r} className="pill idle">
            {r}: <b style={{ color: tel?.bindings?.[r] ? "#b8f0cd" : undefined }}>{tel?.bindings?.[r] ?? "—"}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
