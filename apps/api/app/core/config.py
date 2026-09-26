from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RR_", env_file=".env", extra="ignore")

    app_name: str = "Round Reviewer API"
    data_dir: Path = Path(__file__).resolve().parents[2] / "data"
    upload_dir: Path | None = None
    work_dir: Path | None = None
    matches_dir: Path | None = None
    fixture_path: Path | None = None
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    # Legacy mock stage delay (sample fixture only)
    mock_stage_seconds: float = 0.4
    max_upload_bytes: int = 300 * 1024 * 1024
    max_decompress_bytes: int = 2 * 1024 * 1024 * 1024
    parse_timeout_seconds: float = 120.0

    # Gameplay video via CS Demo Manager (Windows host worker)
    csdm_enabled: bool = False
    csdm_mode: str = "stub"  # stub | csdm
    csdm_bin: str = "csdm"
    csdm_focus_steamid: str | None = None
    csdm_width: int = 1280
    csdm_height: int = 720
    csdm_fps: int = 30
    csdm_recording_system: str = "HLAE"
    csdm_max_rounds: int = 0  # 0 = all rounds
    csdm_timeout_seconds: float = 600.0

    def resolved_upload_dir(self) -> Path:
        path = self.upload_dir or (self.data_dir / "uploads")
        path.mkdir(parents=True, exist_ok=True)
        return path

    def resolved_work_dir(self) -> Path:
        path = self.work_dir or (self.data_dir / "work")
        path.mkdir(parents=True, exist_ok=True)
        return path

    def resolved_matches_dir(self) -> Path:
        path = self.matches_dir or (self.data_dir / "matches")
        path.mkdir(parents=True, exist_ok=True)
        return path

    def resolved_fixture_path(self) -> Path:
        return self.fixture_path or (self.data_dir / "fixtures" / "sample-match.json")


settings = Settings()
