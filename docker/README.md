# Local Docker setup

From the repository root, run `docker compose up --build` to start the API and web app. Both host ports bind to loopback. The compose network uses the explicit private subnet `172.30.0.0/24`; the API trusts requests from that subnet and the internal `api` hostname for local-only access checks. Keep this trusted range limited to the local compose network and do not replace it with a broad private-network range. The API still requires its normal authentication for public or untrusted peers.

For the optional CS Demo Manager database, set a password in your shell before starting the `csdm` profile.

PowerShell:

```powershell
$securePassword = Read-Host "Local CSDM database password" -AsSecureString
$env:RR_CSDM_DB_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
docker compose --profile csdm up --build
```

Bash:

```bash
export RR_CSDM_DB_PASSWORD="$(openssl rand -base64 24)"
docker compose --profile csdm up --build
```

The password is read from the process environment, so no `.env` file needs to be created or changed. The web app and API publish on `127.0.0.1`; PostgreSQL is only started with the `csdm` profile and also binds to loopback.
