"""Device Manager: holds the INDI connection and the site's devices.

Keeps a resilient background connection to ``indiserver``: if the server is not yet
up (or drops), it retries on a fixed interval. The latest camera preview is cached
in memory and served by the core API.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from ..dal.indi.protocol import INDIClient
from ..dal.indi_adapter import IndiCamera, IndiMount

log = logging.getLogger("cassa.agent")

_RECONNECT_DELAY = 2.0


class DeviceManager:
    def __init__(self, settings):
        self.settings = settings
        self.client = INDIClient(settings.indi_host, settings.indi_port)
        self.mount: IndiMount | None = None
        self.camera: IndiCamera | None = None
        self.connected = False
        self.latest_png: bytes | None = None
        self.latest_image_at: str | None = None
        self._stop = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self.client.close()

    async def _run(self) -> None:
        while not self._stop:
            try:
                await self.client.connect()
                await self._setup()
                self.connected = True
                log.info("virtual site online (mount=%s, camera=%s)",
                         self.settings.mount_device, self.settings.camera_device)
                await self.client.wait_closed()  # returns when the link drops
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.warning("INDI connection problem: %s", e)
            finally:
                self.connected = False
                self.mount = None
                self.camera = None
            if self._stop:
                break
            await asyncio.sleep(_RECONNECT_DELAY)

    async def _setup(self) -> None:
        self.mount = IndiMount(self.client, self.settings.mount_device)
        self.camera = IndiCamera(
            self.client, self.settings.camera_device, on_image=self._on_image
        )
        await self.mount.connect()
        await self.camera.connect()

    def _on_image(self, png: bytes) -> None:
        self.latest_png = png
        self.latest_image_at = datetime.now(timezone.utc).isoformat()
        log.info("new preview frame (%d bytes)", len(png))

    def snapshot(self) -> dict:
        ready = self.connected and self.mount is not None and self.camera is not None
        return {
            "ts": datetime.now(timezone.utc).isoformat(),
            "indi_connected": self.connected,
            "last_image_at": self.latest_image_at,
            "mount": self.mount.status().dict() if ready else None,
            "camera": self.camera.status().dict() if ready else None,
        }
