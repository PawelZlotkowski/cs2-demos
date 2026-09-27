from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BUNDLED_FIXTURE = Path(__file__).resolve().parents[2] / "data" / "fixtures" / "sample-match.json"


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

    # Coach model (AI Coach plan §6.1): self-hosted llama.cpp, OpenAI-compatible.
    # Off by default so the app runs without a GPU; the code ranker and the
    # finding templates stand in until RR_LLM_ENABLED=true.
    llm_enabled: bool = False
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
    traces_dir: Path | None = None
    # Admin Lab (doc 29 §2.2): trace viewer, labelling, evaluation. Until accounts
    # (A13 roles) exist it is switched on per PC, since traces hold player data.
    lab_enabled: bool = False
    # Lab Labels write T17 files here (default: the repo's data/labels, which is committed)
    labels_dir: Path | None = None
    # Fine-tuning set built from the traces (T50); the Lab Dataset tab reviews it (T51)
    dataset_dir: Path | None = None
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
    # Whole-round clips right after parsing (off: the coach records its moments instead)
    csdm_round_clips: bool = False
    # Extra seconds recorded around each coach moment, so the play is not cut at the
    # edges (CS2 needs a moment to settle after the jump, and the result lands after the action)
    csdm_moment_pad_before: float = 1.0
    csdm_moment_pad_after: float = 3.0

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
