"""Vendor-neutral device roles. The rest of CASSA talks to these, never to INDI."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional


@dataclass
class MountStatus:
    connected: bool
    ra_hours: Optional[float]
    dec_deg: Optional[float]
    slewing: bool
    tracking: bool
    parked: bool

    def dict(self) -> dict:
        return asdict(self)


@dataclass
class CameraStatus:
    connected: bool
    exposing: bool
    exposure_remaining: float

    def dict(self) -> dict:
        return asdict(self)
