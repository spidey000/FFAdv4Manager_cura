from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PrinterStatus:
    raw: str
    machine_status: str | None = None
    move_mode: str | None = None
    current_file: str | None = None
    nozzle_current: int | None = None
    nozzle_target: int | None = None
    bed_current: int | None = None
    bed_target: int | None = None
    sd_current: int | None = None
    sd_total: int | None = None
    layer_current: int | None = None
    layer_total: int | None = None

    status_errors: dict[str, str] = field(default_factory=dict)

    @property
    def status_available(self) -> bool:
        return bool(self.machine_status and self.machine_status.upper() not in {
            "UNKNOWN", "OFFLINE", "DISCONNECTED", "UNAVAILABLE", "ERROR", "NOT CONNECTED"
        })

    @property
    def connection_status(self) -> str:
        return "online" if self.status_available else "partial" if self.raw.strip() else "unavailable"

    @property
    def ready_to_print(self) -> bool:
        # Only explicit idle states are permission to replace/start a job.
        return self.machine_status in {"READY", "IDLE"}

    @property
    def is_printing(self) -> bool:
        return self.machine_status in {"BUILDING_FROM_SD", "BUILDING", "PRINTING"}

    @property
    def has_active_job(self) -> bool:
        return self.is_printing or self.machine_status == "PAUSED"

    @property
    def progress_percent(self) -> float | None:
        if self.sd_total and self.sd_total > 0 and self.sd_current is not None:
            return min(100.0, max(0.0, (self.sd_current / self.sd_total) * 100.0))
        return None
