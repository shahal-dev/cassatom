import { useEffect, useState } from "react";
import { Almanac as AlmanacData, getJSON } from "./api";

function fmtT(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { timeZone: tz || undefined, hour: "2-digit", minute: "2-digit" });
}

function Item({ icon, label, children, title }: { icon: string; label?: string; children: React.ReactNode; title?: string }) {
  return (
    <span className="almitem" title={title}>
      <span className="ic">{icon}</span>
      {label && <span className="lbl">{label}</span>}
      <b>{children}</b>
    </span>
  );
}

// Night almanac strip — twilight, astronomical night, moon phase/rise/set, with icons.
export default function Almanac() {
  const [a, setA] = useState<AlmanacData | null>(null);

  useEffect(() => {
    const load = () => getJSON<AlmanacData>("/api/sky/almanac").then(setA).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (!a || !a.available) return null;
  const tz = a.timezone;
  const tw = a.twilight;
  const m = a.moon;

  return (
    <div className="almanac">
      {a.is_dark
        ? <span className="pill ok" title="Sun below −18°">🌌 astro dark</span>
        : <span className="pill warn" title="Not astronomically dark yet">🌇 not dark</span>}

      {a.sun && <Item icon="☀️" label="sun" title="Current sun altitude">{a.sun.alt_deg}°</Item>}
      {a.sun && <Item icon="🌇" label="set">{fmtT(a.sun.sunset, tz)}</Item>}
      {a.sun && <Item icon="🌅" label="rise">{fmtT(a.sun.sunrise, tz)}</Item>}

      {tw && <Item icon="🌆" label="civil" title="Civil twilight (sun −6°): dusk / dawn">{fmtT(tw.civil.dusk, tz)} / {fmtT(tw.civil.dawn, tz)}</Item>}
      {tw && <Item icon="⚓" label="naut" title="Nautical twilight (sun −12°): dusk / dawn">{fmtT(tw.nautical.dusk, tz)} / {fmtT(tw.nautical.dawn, tz)}</Item>}
      {a.astronomical_night && (
        <Item icon="🔭" label="astro night" title="Astronomical night (sun below −18°)">
          {fmtT(a.astronomical_night.start, tz)} → {fmtT(a.astronomical_night.end, tz)}
        </Item>
      )}

      {m && <Item icon={m.emoji} title={`${m.phase} · ${m.up ? "up" : "down"} · alt ${m.alt_deg}°`}>{m.phase} {Math.round(m.illumination * 100)}%</Item>}
      {m && <Item icon="🌘" label="moon" title="Moonrise / moonset">↑{fmtT(m.rise, tz)} ↓{fmtT(m.set, tz)}</Item>}
    </div>
  );
}
