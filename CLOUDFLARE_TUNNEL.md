# Cloudflare Tunnel Setup (kid-to-story)

This tunnel is already provisioned in the Cloudflare dashboard and appears as:

- **Tunnel name:** kid-to-story
- **Tunnel ID:** 620de6cc-b84e-4580-bb4a-8bf448ce7ef0
- **Connector type:** cloudflared

Follow the steps below to manage it locally.

## 1. Generate credentials and config
1. Log in once so cert.pem exists:
   ```powershell
   cloudflared tunnel login
   ```
2. Create the credentials JSON for this tunnel:
   ```powershell
   cloudflared tunnel token --cred-file "C:\Users\Tsung Lin\.cloudflared\620de6cc-b84e-4580-bb4a-8bf448ce7ef0.json" kid-to-story
   ```
3. Create `C:\Users\Tsung Lin\.cloudflared\config.yml`:
   ```yaml
   tunnel: 620de6cc-b84e-4580-bb4a-8bf448ce7ef0
   credentials-file: C:\Users\Tsung Lin\.cloudflared\620de6cc-b84e-4580-bb4a-8bf448ce7ef0.json
   origin-cert: C:\Users\Tsung Lin\.cloudflared\cert.pem

   ingress:
     - hostname: kid-to-story.win
       service: http://host.docker.internal:8000
     - service: http_status:404
   ```

## 2. Run or install the connector (Windows example)
- Foreground run:
  ```powershell
  cloudflared tunnel run kid-to-story
  ```
- Install as a Windows service (auto-start on boot):
  ```powershell
  cloudflared service install
  ```
- Inspect live connectors:
  ```powershell
  cloudflared tunnel info kid-to-story
  ```

## 3. Verify end-to-end
- Host side (PowerShell):
  ```powershell
  Invoke-WebRequest -UseBasicParsing -Uri https://kid-to-story.win/health
  ```
- Android emulator (via adb) can reach the domain on 443/80:
  ```powershell
  & "C:\Users\Tsung Lin\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell "toybox nc -z -w 3 kid-to-story.win 443"
  ```
  Exit code `0` confirms connectivity.

## 4. Frontend configuration
- Expo `.env` (git-ignored):
  ```
  EXPO_PUBLIC_API_BASE=https://kid-to-story.win
  ```
- Restart Metro bundler (npm start) after changing this value so the app reads the new origin.

## 5. Notes
- **ComfyUI Reminder**: the tunnel now points kid-to-story.win at the FastAPI backend. Keep ComfyUI reachable separately (default http://host.docker.internal:8188) and ensure no local process binds to 127.0.0.1:8000, otherwise cloudflared would proxy the wrong app. Update COMFYUI_SERVER in infra/.env if you relocate it, otherwise backend features that queue workflows will fail (e.g. story template creation).
- Cloudflare terminates HTTPS on 443; only localhost:8000 must be reachable from cloudflared.
- Additional internal services can be exposed by appending extra entries under ingress.
- Keep cloudflared updated (`choco upgrade cloudflared -y`) to retain access to commands like `tunnel token`.

---

## Ubuntu Setup (Linux)

These steps install `cloudflared`, bind this machine to the existing tunnel, and point it at the local backend published on port 8000.

1) Install cloudflared (Cloudflare repo)

```bash
curl -fsSL https://pkg.cloudflare.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare.gpg] https://pkg.cloudflare.com/ $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

If your distro release isn’t supported, download the latest `.deb` from Cloudflare and install with `sudo dpkg -i <file>.deb`.

2) Authenticate

```bash
cloudflared tunnel login
```

This opens a browser or prints a URL for headless login. It creates `~/.cloudflared/cert.pem`.

3) Bind this machine to the existing tunnel

```bash
cloudflared tunnel token \
  --cred-file ~/.cloudflared/620de6cc-b84e-4580-bb4a-8bf448ce7ef0.json \
  kid-to-story
```

4) Create config (`~/.cloudflared/config.yml`)

Use 127.0.0.1 on Linux (not host.docker.internal). Make sure Docker publishes the backend as `-p 8000:8000`.

```yaml
tunnel: 620de6cc-b84e-4580-bb4a-8bf448ce7ef0
credentials-file: /home/<you>/.cloudflared/620de6cc-b84e-4580-bb4a-8bf448ce7ef0.json

ingress:
  - hostname: kid-to-story.win
    service: http://127.0.0.1:8000
  - service: http_status:404
```

5) Run the tunnel

- Foreground (quick test):

```bash
cloudflared tunnel run kid-to-story
```

- Install as a system service (auto‑start):

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/
sudo cp ~/.cloudflared/620de6cc-b84e-4580-bb4a-8bf448ce7ef0.json /etc/cloudflared/
sudo chmod 600 /etc/cloudflared/*.json
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

6) Verify

```bash
cloudflared tunnel info kid-to-story   # connector healthy
curl -I https://kid-to-story.win/health  # expect HTTP/1.1 200
```

If you use Docker for the backend, ensure compose publishes port `8000:8000` (this repo’s compose already does).

7) Frontend + misc

- Set `EXPO_PUBLIC_API_BASE=https://kid-to-story.win` in `frontend/.env` and restart Metro.
- Keep ComfyUI separate; set `COMFYUI_SERVER=127.0.0.1:8188` for local GPU or your remote domain if you proxy it independently.

