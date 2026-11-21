# KiwiAPI VPS Deployment Guide

Everything runs on one Ubuntu 24.04 VPS (2 vCPU, 4 GB RAM). Only SSH (port 22) is open on the firewall; all web traffic enters through Cloudflare Tunnel (`cloudflared`).

## 1. Buy the VPS
Create an Ubuntu 24.04 server (2 vCPU, 4 GB RAM) and add your SSH key. Note the server IP and login (`user@server`).

## 2. Add the domain to Cloudflare
1. Sign in to Cloudflare and add `kiwiapi.net` on the Free plan.
2. Replace the nameservers at your domain registrar with the two nameservers Cloudflare gives you.
3. Wait until Cloudflare shows the domain as **Active**.

## 3. SSH in and upload the project
From your local computer, copy the project folders (`api`, `www/main`, `www/dl`, `deploy`) up to the server:

```bash
ssh user@server "sudo mkdir -p /opt/kiwiapi && sudo chown -R \$(whoami):\$(whoami) /opt/kiwiapi"
rsync -az --exclude 'venv/' --exclude '__pycache__/' --exclude '.env' api www deploy user@server:/opt/kiwiapi/
```

## 4. Run `setup.sh` once on the server
SSH into the server and run the setup script as root:

```bash
ssh user@server
sudo bash /opt/kiwiapi/deploy/setup.sh
```

## 5. Fill in `/opt/kiwiapi/.env` and set `WEB_KEY`
Generate strong keys on the server:

```bash
openssl rand -hex 24
openssl rand -hex 24
```

Edit `/opt/kiwiapi/.env` and replace the placeholder keys:

```bash
sudo nano /opt/kiwiapi/.env
```

Put the same `WEB_KEY` value into your downloader page (`www/dl/index.html` or `dl.html`) where `REPLACE_WITH_WEB_KEY` appears, and make sure `API_BASE` is `https://api.kiwiapi.net`.

## 6. Log in to Cloudflare Tunnel and create the tunnel
Run on the server:

```bash
sudo cloudflared tunnel login
sudo cloudflared tunnel create kiwiapi
```

Note the `<TUNNEL-ID>` printed by `tunnel create`. It also writes the credentials file at `/root/.cloudflared/<TUNNEL-ID>.json`.

## 7. Route DNS for all three hostnames
Run these three commands on the server:

```bash
sudo cloudflared tunnel route dns kiwiapi kiwiapi.net
sudo cloudflared tunnel route dns kiwiapi dl.kiwiapi.net
sudo cloudflared tunnel route dns kiwiapi api.kiwiapi.net
```

## 8. Install the tunnel config and credentials
Copy the credentials JSON and config file into `/etc/cloudflared/`, then replace `<TUNNEL-ID>` with your real tunnel ID:

```bash
TUNNEL_ID="<TUNNEL-ID>"
sudo mkdir -p /etc/cloudflared
sudo cp "/root/.cloudflared/${TUNNEL_ID}.json" "/etc/cloudflared/${TUNNEL_ID}.json"
sudo chmod 600 "/etc/cloudflared/${TUNNEL_ID}.json"
sudo cp /opt/kiwiapi/deploy/cloudflared-config.yml /etc/cloudflared/config.yml
sudo sed -i "s/<TUNNEL-ID>/${TUNNEL_ID}/g" /etc/cloudflared/config.yml
sudo cloudflared service install
```

## 9. Enable and start all services
```bash
sudo systemctl enable --now cloudflared kiwiapi caddy update-ytdlp.timer cleanup-tmp.timer
```

## 10. Deploy future updates from your computer
From your local project folder:

```bash
bash deploy/deploy.sh user@server
```

## 11. Health checks
Run on the server to test local services:

```bash
curl -fsS http://127.0.0.1:8080 -H 'Host: dl.kiwiapi.net' >/dev/null && echo "OK local dl.kiwiapi.net" || echo "FAILED local dl.kiwiapi.net"
curl -fsS http://127.0.0.1:8000/docs >/dev/null && echo "OK local api /docs" || echo "FAILED local api /docs"
```

Run from anywhere to test public HTTPS through the Cloudflare Tunnel:

```bash
curl -fsS https://kiwiapi.net >/dev/null && echo "OK https://kiwiapi.net" || echo "FAILED https://kiwiapi.net"
curl -fsS https://dl.kiwiapi.net >/dev/null && echo "OK https://dl.kiwiapi.net" || echo "FAILED https://dl.kiwiapi.net"
curl -fsS https://api.kiwiapi.net/docs >/dev/null && echo "OK https://api.kiwiapi.net/docs" || echo "FAILED https://api.kiwiapi.net/docs"
```

## Note on large video and audio files
> Cloudflare's terms discourage serving high volumes of video and media files through its orange-cloud proxy. For small initial traffic this single-tunnel setup is fine. If download traffic grows, move `/v1/files` downloads onto a separate hostname (`files.kiwiapi.net`) set to **DNS only** (grey cloud) pointing straight at the VPS IP so large media transfers bypass Cloudflare's proxy.

## If something breaks

| Symptom | Command to run | What it means |
|---|---|---|
| API returns 502 or refuses to start | `sudo journalctl -u kiwiapi -n 50` | Check for missing `API_KEYS`/`WEB_KEY` in `/opt/kiwiapi/.env`, Python import errors, or permission errors in `/var/lib/kiwiapi/tmp`. |
| Public domain shows Cloudflare 502 / 1033 | `sudo journalctl -u cloudflared -n 50` | Tunnel credentials path, `<TUNNEL-ID>`, or DNS route is wrong, or the local target (`127.0.0.1:8080` / `8000`) is down. |
| Static site returns 404 or blank page | `sudo systemctl status caddy` | Caddy failed to reload, `Caddyfile` has a syntax issue, or `/opt/kiwiapi/www/main` / `www/dl` is missing `index.html`. |
| YouTube downloads suddenly fail | `sudo systemctl start update-ytdlp.service` | YouTube changed its player format; manually triggering the daily updater refreshes `yt-dlp` and restarts `kiwiapi`. |
| Disk filling up | `ls -lh /var/lib/kiwiapi/tmp && sudo systemctl status cleanup-tmp.timer` | Temporary files are not clearing; verify `cleanup-tmp.timer` is active and `/var/lib/kiwiapi/tmp` is owned by `kiwi`. |
