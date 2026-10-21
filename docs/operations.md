# Spotter Operations Guide

## Runtime model

Spotter runs one Node.js process. Express serves the compiled PWA and `/api/*`,
while SQLite stores canonical data at `/data/spotter.sqlite`. The image runs as
the non-root `node` user and exposes port `3000`.

The initial application has no built-in authentication. Run it on a trusted
network or place an authenticating TLS reverse proxy in front of it.

## Start with Docker Compose

```bash
docker compose up --build -d
curl --fail http://localhost:3000/api/health
```

The `spotter-data` volume persists the database. To use a host directory
instead, make it writable by UID/GID `1000` and mount it at `/data`.

## Environment variables

| Variable        | Default                | Purpose                                  |
| --------------- | ---------------------- | ---------------------------------------- |
| `PORT`          | `3000`                 | HTTP listen port inside the container    |
| `DATABASE_PATH` | `/data/spotter.sqlite` | Canonical SQLite file                    |
| `APP_VERSION`   | `0.1.0`                | Version exposed by `/api/version`        |
| `GIT_COMMIT`    | `unknown`              | Build revision exposed by `/api/version` |
| `WEB_DIST_PATH` | bundled client         | Optional compiled-client override        |

## Backup

SQLite uses WAL mode. Do not copy only `spotter.sqlite` while the application is
actively writing. For a simple consistent backup, stop the container, copy the
entire mounted `/data` directory, then restart it:

```bash
docker compose stop spotter
docker run --rm -v spotter_spotter-data:/source:ro -v "$PWD/backups:/backup" \
  busybox tar czf /backup/spotter-$(date +%Y%m%d-%H%M%S).tgz -C /source .
docker compose start spotter
```

Volume names include the Compose project name and may differ. Confirm the
actual volume with `docker volume ls` before backing it up.

## Restore

Stop Spotter, restore all files from one backup into an empty data volume, make
them writable by UID/GID `1000`, and start the container. Check `/api/health`
and the workout history before discarding the previous volume.

## Upgrade

1. Create a consistent backup.
2. Pull or build the intended image tag.
3. Replace the container while retaining the same `/data` volume.
4. Wait for `/api/health`; ordered migrations run before the server listens.
5. Verify `/api/version`, catalogue data, and workout history.

Do not downgrade across a database migration unless release notes explicitly
state that the older image understands the newer schema.

## Known limitations

- One active workout is supported per device.
- Simultaneous editing of the same workout on multiple devices is unsupported.
- Completed workouts are read-only.
- There is no built-in account, authentication, export, or retention policy.
- Catalogue and template changes require connectivity.
