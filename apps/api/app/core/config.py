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

    # Coach model (AI Coach plan §6.1): self-hosted llama.cpp, OpenAI-compatible.
    # Off by default so the app runs without a GPU; the code ranker and the
    # finding templates stand in until RR_LLM_ENABLED=true.
    llm_enabled: bool = False
    llm_base_url: str = "http://127.0.0.1:8080/v1"
    llm_model: str = "qwen3-14b-q4_k_m"
    llm_timeout_seconds: float = 180.0
    # How the agent reaches the tools: "mcp" (cs2-demo server in-process over
    # the MCP protocol, or RR_MCP_URL / RR_MCP_COMMAND) or "inprocess"
    coach_tools: str = "mcp"
    mcp_url: str | None = None
    mcp_command: str | None = None
    coach_max_steps: int = 6
    traces_dir: Path | None = None

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
        return self.fixture_path or (self.data_dir / "fixtures" / "sample-match.json")


settings = Settings()
