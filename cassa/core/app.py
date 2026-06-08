"""CASSA Core API (Phase 0).

REST for manual control + a WebSocket that streams live telemetry to the console.
Run with:  uvicorn cassa.core.app:app --reload
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..agent.device_manager import DeviceManager
from .config import load_settings

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
log = logging.getLogger("cassa.core")

_TELEMETRY_HZ = 2.0  # telemetry pushes per second


class SlewReq(BaseModel):
    ra_hours: float = Field(ge=0, lt=24)
    dec_deg: float = Field(ge=-90, le=90)
    track: bool = True


class ExposeReq(BaseModel):
    seconds: float = Field(gt=0, le=3600)


async def _broadcaster(app: FastAPI) -> None:
    period = 1.0 / _TELEMETRY_HZ
    while True:
        await asyncio.sleep(period)
        clients = app.state.clients
        if not clients:
            continue
        snap = app.state.dm.snapshot()
        for ws in list(clients):
            try:
                await ws.send_json(snap)
            except Exception:
                clients.discard(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    app.state.dm = DeviceManager(settings)
    app.state.clients = set()
    await app.state.dm.start()
    task = asyncio.create_task(_broadcaster(app))
    log.info("CASSA core ready — INDI target %s:%s", settings.indi_host, settings.indi_port)
    try:
        yield
    finally:
        task.cancel()
        await app.state.dm.stop()


app = FastAPI(title="CASSA Core", version="0.0.1", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


def _mount(app: FastAPI):
    dm = app.state.dm
    if not dm.connected or dm.mount is None:
        raise HTTPException(503, "mount not connected")
    return dm.mount


def _camera(app: FastAPI):
    dm = app.state.dm
    if not dm.connected or dm.camera is None:
        raise HTTPException(503, "camera not connected")
    return dm.camera


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": app.version}


@app.get("/api/status")
async def status():
    return app.state.dm.snapshot()


@app.post("/api/mount/slew")
async def slew(req: SlewReq):
    await _mount(app).slew_to_radec(req.ra_hours, req.dec_deg, req.track)
    return {"ok": True}


@app.post("/api/mount/sync")
async def sync(req: SlewReq):
    await _mount(app).sync_to_radec(req.ra_hours, req.dec_deg)
    return {"ok": True}


@app.post("/api/mount/abort")
async def abort():
    await _mount(app).abort()
    return {"ok": True}


@app.post("/api/mount/park")
async def park():
    await _mount(app).park(True)
    return {"ok": True}


@app.post("/api/mount/unpark")
async def unpark():
    await _mount(app).park(False)
    return {"ok": True}


@app.post("/api/camera/expose")
async def expose(req: ExposeReq):
    await _camera(app).expose(req.seconds)
    return {"ok": True}


@app.get("/api/camera/last-image.png")
async def last_image():
    png = app.state.dm.latest_png
    if not png:
        raise HTTPException(404, "no image yet")
    return Response(content=png, media_type="image/png")


@app.websocket("/ws/telemetry")
async def telemetry(ws: WebSocket):
    await ws.accept()
    app.state.clients.add(ws)
    try:
        await ws.send_json(app.state.dm.snapshot())
        while True:
            await ws.receive_text()  # keep the socket open; ignore inbound
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        app.state.clients.discard(ws)
