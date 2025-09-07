---
layout: default
title: Stop/start
parent: Advanced
grand_parent: Manual Setup (single container)
nav_order: 2
---

# Stopping and starting AliasVault
You can stop and start AliasVault via the default docker compose commands. Run these commands from the directory where your AliasVault `docker-compose.yml` is located.

## Stop
To stop AliasVault:
```bash
docker compose down
```

## Start
To start AliasVault:

```bash
docker compose up -d
```

## Restart
To restart AliasVault:

```bash
docker compose restart
```
