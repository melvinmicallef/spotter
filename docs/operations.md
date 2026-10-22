# Spotter Operations Guide

## Runtime model

Spotter runs one Node.js process. Express serves the compiled PWA and `/api/*`,
while SQLite stores canonical data at `/data/spotter.sqlite` and uploaded
exercise images live at `/data/media`. The image runs as the non-root `node`
user and exposes
port `3000`.

The initial application has no built-in authentication. Run it on a trusted
network or place an authenticating TLS reverse proxy in front of it.

## Start with Docker Compose

```bash
docker compose up --build -d
curl --fail http://localhost:3000/api/health
```

The Compose file bind-mounts `./data` next to `compose.yaml` at `/data` in the
container. The directory contains the SQLite database and uploaded media, so
it remains on the host when the container is replaced. Ensure the directory is
writable by the container's UID/GID `1000`.

## Reset development data

Development data can be cleared by stopping the container and removing the
host `./data` directory before starting a fresh container:

```bash
docker compose down
rm -rf ./data
docker compose up --build -d
```

This permanently deletes the server database and uploaded media. It does not
clear IndexedDB or other site data stored in a browser profile.

## Environment variables

| Variable        | Default                | Purpose                                  |
| --------------- | ---------------------- | ---------------------------------------- |
| `PORT`          | `3000`                 | HTTP listen port inside the container    |
| `DATABASE_PATH` | `/data/spotter.sqlite` | Canonical SQLite file                    |
| `MEDIA_PATH`    | `/data/media`          | Uploaded GIF/PNG/JPEG exercise images    |
| `APP_VERSION`   | `0.2.0`                | Version exposed by `/api/version`        |
| `GIT_COMMIT`    | `unknown`              | Build revision exposed by `/api/version` |
| `WEB_DIST_PATH` | bundled client         | Optional compiled-client override        |

## Backup

SQLite uses WAL mode. Do not copy only `spotter.sqlite` while the application is
actively writing. For a simple consistent backup, stop the container, archive
the host `./data` directory, then restart it:

```bash
docker compose stop spotter
mkdir -p backups
tar czf "./backups/spotter-$(date +%Y%m%d-%H%M%S).tgz" -C ./data .
docker compose start spotter
```

## Restore

Stop Spotter, restore all files from one backup into `./data`, make them
writable by UID/GID `1000`, and start the container. Check `/api/health` and
the workout history before discarding the previous copy.

## Upgrade

1. Create a consistent backup.
2. Pull or build the intended image tag.
3. Replace the container while retaining the same host `./data` directory.
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
- Weekly day swaps are device-local and apply only to the current ISO week.
