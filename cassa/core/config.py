"""Configuration via environment variables (``CASSA_*``) or a ``.env`` file.

There is no device map in config: CASSA discovers whatever devices the INDI
server exposes and you bind each role (mount/camera/focuser/filter) to a real
device at runtime from the web console. Those bindings persist to
``bindings_path``. The only config here is where the INDI server lives plus the
identity stamped into FITS provenance and obsids.
"""
from __future__ import annotations

import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("cassa.config")


class Settings(BaseSettings):
    # INDI server (typically a remote edge node at the observatory). Can also be
    # repointed at runtime from the console; the chosen host/port persist with
    # the device bindings.
    indi_host: str = "localhost"
    indi_port: int = 7624

    # identity baked into FITS provenance + obsids
    site_id: str = "cassa"
    instrument_id: str = "instr"
    observer: str = "CASSA"
    # fallbacks used only when no mount/camera is bound yet
    telescope_name: str = "Unknown"
    instrument_name: str = "Unknown"

    # archive
    db_url: str = "sqlite+aiosqlite:///data/cassa.db"
    data_dir: str = "data/store"

    # runtime device bindings (role -> device) chosen from the UI, persisted here
    bindings_path: str = "data/bindings.json"

    model_config = SettingsConfigDict(env_prefix="CASSA_", env_file=".env", extra="ignore")


def load_settings() -> Settings:
    s = Settings()
    log.info("config loaded — INDI %s:%s, site=%s", s.indi_host, s.indi_port, s.site_id)
    return s
