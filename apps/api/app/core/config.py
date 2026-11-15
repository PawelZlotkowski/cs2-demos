from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BUNDLED_FIXTURE = Path(__file__).resolve().parents[2] / "data" / "fixtures" / "sample-match.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RR_", env_file=".env", extra="ignore")

    app_name: str = "Round Reviewer API"
    # Personal mode only accepts a loopback peer. Hosting requires per-owner tokens.
    access_mode: Literal["local", "authenticated"] = "local"
    api_tokens: dict[str, SecretStr] = Field(default_factory=dict)
    local_trusted_networks: list[str] = Field(default_factory=list)
    local_trusted_hosts: list[str] = Field(default_factory=list)
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
    max_upload_bytes: int = Field(300 * 1024 * 1024, ge=1)
    max_decompress_bytes: int = Field(2 * 1024 * 1024 * 1024, ge=1)
    max_multipart_overhead_bytes: int = Field(64 * 1024, ge=1024)
    max_concurrent_uploads: int = Field(2, ge=1)
    max_pending_jobs: int = Field(8, ge=1)
    max_storage_bytes: int = Field(20 * 1024**3, ge=1)
    min_free_disk_bytes: int = Field(2 * 1024**3, ge=0)
    parse_timeout_seconds: float = Field(120.0, gt=0)
    parser_memory_bytes: int = Field(4 * 1024**3, ge=64 * 1024**2)
    max_replay_bytes: int = Field(256 * 1024**2, ge=1024)

    # Coach model (AI Coach plan §6.1): self-hosted llama.cpp, OpenAI-compatible.
    # Off by default so the app runs without a GPU; the code ranker and the
    # finding templates stand in until RR_LLM_ENABLED=true.
    llm_enabled: bool = False
    # Numerical moment selection still uses the model. Freeform explanations are
    # experimental until typed-claim grounding is implemented; templates are safe default.
    coach_freeform_enabled: bool = False
    llm_base_url: str = "http://127.0.0.1:8080/v1"
    llm_model: str = "qwen3-14b-q4_k_m"
    llm_timeout_seconds: float = 180.0
    # Sampling profile: "auto" picks one from RR_LLM_MODEL (qwen3, gemma,
    # ministral, gpt-oss); see SAMPLING_PROFILES in coach/llm_client.py.
    # The four overrides beat the profile for both thinking and non-thinking.
    llm_sampling: str = "auto"
    llm_temperature: float | None = None
    llm_top_p: float | None = None
    llm_top_k: int | None = None
    llm_min_p: float | None = None
    # How the agent reaches the tools: "mcp" (cs2-demo server in-process over
    # the MCP protocol, or RR_MCP_URL / RR_MCP_COMMAND) or "inprocess"
    coach_tools: str = "mcp"
    mcp_url: str | None = None
    mcp_command: str | None = None
    coach_max_steps: int = 6
    coach_max_tool_calls: int = Field(12, ge=1)
    coach_max_tool_bytes: int = Field(262144, ge=1024)
    coach_max_output_tokens: int = Field(4096, ge=1)
    coach_job_timeout_seconds: float = Field(120.0, gt=0)
    coach_max_concurrency: int = Field(1, ge=1)
    traces_dir: Path | None = None
    # Knowledge base (plan §7): markdown folder, optional local embedding server
    knowledge_dir: Path | None = None
    embed_url: str | None = None
    embed_model: str = "bge-m3"
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
    ffprobe_bin: str = "ffprobe"
    ffprobe_timeout_seconds: float = Field(15.0, gt=0)
    clip_duration_tolerance_seconds: float = Field(1.0, ge=0)
    # Whole-round clips right after parsing (off: the coach records its moments instead)
    csdm_round_clips: bool = False
    # Extra seconds recorded around each coach moment, so the play is not cut at the
    # edges (CS2 needs a moment to settle after the jump, and the result lands after the action)
    csdm_moment_pad_before: float = 1.0
    csdm_moment_pad_after: float = 3.0

    @model_validator(mode="after")
    def validate_access(self) -> "Settings":
        if self.access_mode == "authenticated" and not self.api_tokens:
            raise ValueError("RR_API_TOKENS is required for authenticated mode.")
        if any(not owner or len(token.get_secret_value()) < 32 for owner, token in self.api_tokens.items()):
            raise ValueError("Every API owner must have a token of at least 32 characters.")
        values = [token.get_secret_value() for token in self.api_tokens.values()]
        if len(values) != len(set(values)):
            raise ValueError("Each API owner must have a different token.")
        return self

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

    def resolved_traces_dir(self) -> Path:
        path = self.traces_dir or (self.data_dir / "traces")
        path.mkdir(parents=True, exist_ok=True)
        return path

    def resolved_fixture_path(self) -> Path:
        if self.fixture_path:
            return self.fixture_path
        path = self.data_dir / "fixtures" / "sample-match.json"
        # A fresh RR_DATA_DIR has no fixtures folder: use the one in the repo
        return path if path.exists() else BUNDLED_FIXTURE


settings = Settings()
