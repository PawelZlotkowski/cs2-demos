ALLOWED_EXTENSIONS = {".dem", ".dem.zst"}


def is_allowed_demo_filename(filename: str) -> bool:
    lower = filename.lower()
    return lower.endswith(".dem.zst") or lower.endswith(".dem")


UPLOAD_REJECT_MESSAGE = (
    "That isn't a demo file. Choose a .dem.zst from FACEIT or a .dem from CS Demo Manager."
)
