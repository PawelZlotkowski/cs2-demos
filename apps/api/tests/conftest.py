import os

# Keep a developer's apps/api/.env (sign-in on, a real model or data folder) out of the tests.
# A missing file is skipped by pydantic-settings; this must run before `app` is imported.
os.environ["RR_ENV_FILE"] = os.path.join(os.path.dirname(__file__), "no-such.env")
