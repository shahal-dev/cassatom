export type MountTel = {
  connected: boolean;
  ra_hours: number | null;
  dec_deg: number | null;
  slewing: boolean;
  tracking: boolean;
  parked: boolean;
};

export type CameraTel = {
  connected: boolean;
  exposing: boolean;
  exposure_remaining: number;
};

export type Telemetry = {
  ts: string;
  indi_connected: boolean;
  last_image_at: string | null;
  mount: MountTel | null;
  camera: CameraTel | null;
};

export async function post(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
