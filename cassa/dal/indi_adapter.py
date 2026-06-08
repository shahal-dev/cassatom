"""INDI implementations of the device roles (Mount, Camera).

These map the vendor-neutral role methods onto standard INDI properties. The same
adapter drives the simulator drivers and the real EQ6-R (``indi_eqmod``) / ToupTek
(``indi_toupbase``) — only the device names in config differ.
"""
from __future__ import annotations

import logging

from .imaging import fits_to_png
from .indi.protocol import INDIClient
from .roles import CameraStatus, MountStatus

log = logging.getLogger("cassa.dal")


class IndiMount:
    def __init__(self, client: INDIClient, device: str):
        self.client = client
        self.device = device

    async def connect(self, timeout: float = 15.0) -> None:
        c = self.client
        if not await c.wait_for(lambda: c.has_prop(self.device, "CONNECTION"), timeout):
            raise TimeoutError(f"mount {self.device!r} never appeared on the INDI server")
        if not c.element(self.device, "CONNECTION", "CONNECT"):
            await c.set_switch(self.device, "CONNECTION", {"CONNECT": True, "DISCONNECT": False})
        ok = await c.wait_for(
            lambda: c.element(self.device, "CONNECTION", "CONNECT") is True
            and c.has_prop(self.device, "EQUATORIAL_EOD_COORD"),
            timeout,
        )
        if not ok:
            raise TimeoutError(f"mount {self.device!r} failed to connect")
        log.info("mount %s connected", self.device)

    async def slew_to_radec(self, ra_hours: float, dec_deg: float, track: bool = True) -> None:
        await self.client.set_switch(
            self.device, "ON_COORD_SET", {"TRACK": track, "SLEW": not track, "SYNC": False}
        )
        await self.client.set_number(
            self.device, "EQUATORIAL_EOD_COORD", {"RA": ra_hours, "DEC": dec_deg}
        )

    async def sync_to_radec(self, ra_hours: float, dec_deg: float) -> None:
        await self.client.set_switch(
            self.device, "ON_COORD_SET", {"TRACK": False, "SLEW": False, "SYNC": True}
        )
        await self.client.set_number(
            self.device, "EQUATORIAL_EOD_COORD", {"RA": ra_hours, "DEC": dec_deg}
        )

    async def abort(self) -> None:
        await self.client.set_switch(self.device, "TELESCOPE_ABORT_MOTION", {"ABORT": True})

    async def park(self, park: bool = True) -> None:
        await self.client.set_switch(
            self.device, "TELESCOPE_PARK", {"PARK": park, "UNPARK": not park}
        )

    def status(self) -> MountStatus:
        c = self.client
        return MountStatus(
            connected=bool(c.element(self.device, "CONNECTION", "CONNECT", False)),
            ra_hours=c.element(self.device, "EQUATORIAL_EOD_COORD", "RA"),
            dec_deg=c.element(self.device, "EQUATORIAL_EOD_COORD", "DEC"),
            slewing=c.prop_state(self.device, "EQUATORIAL_EOD_COORD") == "Busy",
            tracking=bool(c.element(self.device, "TELESCOPE_TRACK_STATE", "TRACK_ON", False)),
            parked=bool(c.element(self.device, "TELESCOPE_PARK", "PARK", False)),
        )


class IndiCamera:
    def __init__(self, client: INDIClient, device: str, on_image=None):
        self.client = client
        self.device = device
        self.on_image = on_image
        client.add_blob_handler(self._on_blob)

    async def connect(self, timeout: float = 15.0) -> None:
        c = self.client
        if not await c.wait_for(lambda: c.has_prop(self.device, "CONNECTION"), timeout):
            raise TimeoutError(f"camera {self.device!r} never appeared on the INDI server")
        if not c.element(self.device, "CONNECTION", "CONNECT"):
            await c.set_switch(self.device, "CONNECTION", {"CONNECT": True, "DISCONNECT": False})
        ok = await c.wait_for(
            lambda: c.element(self.device, "CONNECTION", "CONNECT") is True, timeout
        )
        if not ok:
            raise TimeoutError(f"camera {self.device!r} failed to connect")
        await c.enable_blob(self.device, "Also")  # required to receive image BLOBs
        log.info("camera %s connected", self.device)

    async def expose(self, seconds: float) -> None:
        await self.client.set_number(
            self.device, "CCD_EXPOSURE", {"CCD_EXPOSURE_VALUE": seconds}
        )

    def _on_blob(self, device: str, name: str, ename: str, data: bytes, fmt: str) -> None:
        if device != self.device or not fmt.startswith(".fit"):
            return
        try:
            png = fits_to_png(data)
        except Exception:
            log.exception("FITS -> PNG conversion failed for %s", device)
            return
        if self.on_image:
            self.on_image(png)

    def status(self) -> CameraStatus:
        c = self.client
        remaining = c.element(self.device, "CCD_EXPOSURE", "CCD_EXPOSURE_VALUE", 0.0)
        return CameraStatus(
            connected=bool(c.element(self.device, "CONNECTION", "CONNECT", False)),
            exposing=c.prop_state(self.device, "CCD_EXPOSURE") == "Busy",
            exposure_remaining=float(remaining or 0.0),
        )
