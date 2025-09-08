---
layout: default
title: Self-host Install
nav_order: 2
---

# Self-host Install

AliasVault can be self-hosted on your own servers using two different installation methods. Both use Docker, but they differ in how much is automated versus how much you manage yourself:

---

## Option 1: Installer Script (multi-container)

[Install AliasVault via installer script (multi-container)](./installer){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }

> **Best for:**
> - VM or LXC (e.g. Proxmox, DigitalOcean Droplet, VPS, AWS/Azure VM)
> - When the host is directly accessible from the internet and/or has ports 80/443 forwarded to it
> - When you don't have any TLS termination proxy of your own (yet)

This option installs the full AliasVault stack **consisting of multiple Docker containers** (client, api, ppostgres, task runner, smtp, admin, reverse proxy) in the background.

The `install.sh` script provides:
- **Automatic configuration of docker-compose.yml with multiple containers**
- **Built-in reverse proxy with Let's Encrypt TLS certificates**
- **Easy updates and migrations** via a custom CLI
- **Start/stop/uninstall commands** for convenience
- Allows to build Docker containers from source (optional)
- Opinionated defaults for a secure, production-ready setup

---

## Option 2: Manual Setup (single container)

[Install AliasVault via manual setup (single container)](./manual){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 }


> **Best for:**
> - Multi-purpose home servers / NAS (Synology, Unraid, Raspberry Pi, local Docker)
> - Users with existing shared TLS/SSL infrastructure (Traefik, Nginx, HAProxy, Caddy, etc.)

This option runs AliasVault as a **single bundled Docker container** (client, API, Postgres, task runner, SMTP, etc. included).

Everything is managed via **standard Docker commands**:
- Updates are done manually with `docker pull`
- In some cases, future updates may require **manual migration steps** (these will be documented)
- Certain admin actions (e.g. resetting a password) require **manual container access via SSH**
- TLS/SSL termination not included (you must handle HTTPS yourself separately)


👉 Use this option if you **already manage TLS/SSL**, have an existing host where you are running other Docker apps already, and/or prefer to manage the AliasVault Docker container with existing management tools like Portainer.
