# Campus Buggy Tracker

## Prerequisites

- Node.js 20 or newer
- npm
- MongoDB running locally, or a MongoDB Atlas connection string

## First-time setup

From this folder:

```bash
cp server/.env.example server/.env
npm install
npm run install:all
```

Start MongoDB. With Docker installed, the included Compose service is the simplest option (the first run downloads the image):

```bash
docker compose up -d mongo
```

If the Compose plugin is unavailable, start the same container directly:

```bash
docker run -d --name buggy-tracker-mongo -p 127.0.0.1:27017:27017 -v buggy-mongo-data:/data/db mongo:8.0
```

With MongoDB installed as a Linux service, use:

```bash
sudo systemctl start mongod
```

# The key is `buggy-demo-admin`.

## Development demo

```bash
npm run dev
```

On the laptop, open `http://localhost:5173`. For another device on the same Wi-Fi, find the laptop's address with `hostname -I` and open:

- Student map: `http://LAPTOP_IP:5173/`
- Driver console: `http://LAPTOP_IP:5173/driver`
- Admin dashboard: `http://LAPTOP_IP:5173/admin`

## One-port production demo

Build React and let Express serve it:

```bash
npm run build
npm start
```

Then open `http://localhost:5000`, or `http://LAPTOP_IP:5000` from devices on the local network. `VITE_SERVER_URL` is blank by default so the page uses the same host as Express.

## Real phone GPS

An official project-local `cloudflared` binary is installed at `tools/cloudflared`. Quick Tunnels do not require a Cloudflare account. After MongoDB is running, build once and start the app plus HTTPS tunnel together:

```bash
npm run build
npm run demo:https
```

Wait for the terminal to print a generated `https://...trycloudflare.com` address. Open that address with `/driver` appended on the phone and allow location access. Keep this terminal open; pressing `Ctrl+C` closes both the app and temporary tunnel. The address changes each time.

This Quick Tunnel is free and intended for testing and demonstrations. It does not require a domain, payment method, or account. Keep the tunnel terminal open throughout the demonstration.
