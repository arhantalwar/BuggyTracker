# Campus Buggy Tracker

A demo-ready MERN application with three views:

- **Student map (`/`)** — shows all active buggies immediately, receives live Socket.IO updates, displays available passenger seats, lets students request pickup from verified campus zones, marks quiet buggies stale/lost, highlights the assigned route, and shows which endpoint the buggy is travelling toward.
- **Driver console (`/driver`)** — authenticates an approved driver with a passcode, tracks up to ten passengers with touch-friendly controls, receives nearby pickup-demand alerts, requires a saved route and direction, broadcasts browser GPS every five seconds, survives refreshes through a local session token, and ends the shift cleanly.
- **Admin dashboard (`/admin`)** — creates approved driver accounts, deletes buggy records, creates pickup-demand zones, and creates and edits predefined routes by clicking map points.

The map uses Leaflet, MapLibre, and OpenFreeMap with OpenStreetMap data, so it needs no paid key or map account. Express listens on `0.0.0.0`, allowing other devices on the same network to connect.

On phone-sized screens, the student view keeps the map full-height and moves the active-buggy list into the **Buggies** hamburger drawer. Selecting a buggy closes the drawer and focuses that buggy on the map.

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

If using Atlas, change `MONGO_URI` in `server/.env` instead.

Change `ADMIN_KEY` in `server/.env` before publishing a tunnel URL. The example key is `buggy-demo-admin`; it is provided only for a quick local demonstration.

## Development demo

```bash
npm run dev
```

On the laptop, open `http://localhost:5173`. For another device on the same Wi-Fi, find the laptop's address with `hostname -I` and open:

- Student map: `http://LAPTOP_IP:5173/`
- Driver console: `http://LAPTOP_IP:5173/driver`
- Admin dashboard: `http://LAPTOP_IP:5173/admin`

Vite proxies API and live-update traffic to the backend, so no client URL setting is needed. Simulation works over ordinary local HTTP. Browser geolocation usually does **not** work on a phone over `http://LAPTOP_IP`; browsers require HTTPS except on `localhost`.

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

## Admin dashboard and routes

Open `/admin` and enter the `ADMIN_KEY` from `server/.env`. The key remains in the current browser tab's session storage and is sent only in the `X-Admin-Key` request header.

The dashboard can:

- create any number of approved drivers, each with a private passcode;
- delete a driver account when that driver has no active shift;
- show active and ended buggy-session records;
- permanently delete a buggy record, immediately disconnecting it if active;
- create a route by naming both endpoints, choosing its color, and clicking ordered points from the starting endpoint to the final endpoint;
- undo or clear points, edit a saved route, or delete a route.

### Pickup-demand zones

An admin creates a pickup zone by choosing its centre on the map, setting a radius from 20–500 metres, and choosing how many active requests should alert a buggy. Zones appear as amber circles on the student map and turn red when their threshold is reached.

The student presses **Request pickup** and grants one-time browser location access. The server measures the submitted position against the selected zone and rejects the request if it is outside the radius. Each browser counts once per zone; pressing again renews the same request instead of increasing the count. Requests expire after ten minutes.

Only a hash of the browser's anonymous local identifier, the zone, and its expiry time are stored. Exact student coordinates are used for the proximity check and are not saved. When demand reaches the configured threshold, the closest active buggy with at least one free passenger seat receives a live alert. Assignment is recalculated from current buggy positions whenever demand is read, so a newly available closer buggy can receive the alert.

Phone browsers require HTTPS for student and driver geolocation. Use the included Cloudflare Quick Tunnel during the live demo.

Passcodes are salted and hashed before storage and are never returned by the API. The driver page exposes only approved driver names, then verifies the selected driver and passcode before issuing a private shift token. One driver and one buggy can each have only one active shift.

Each buggy has ten passenger seats plus the driver seat. The driver uses the **−** and **+** controls whenever passengers leave or board. Counts are limited to 0–10 by the server, saved with the shift, restored after a refresh, and broadcast immediately. Student cards and map popups show remaining seats and clearly mark a full buggy.

Saved routes appear immediately on open student maps. A driver must choose one under **Assigned route** before GPS can start. The direction button shows **Starting point → End point**, and the driver taps it at a turnaround. Selecting a buggy card or map marker emphasizes its assigned route, fades the other routes, and displays **Towards _endpoint_**. At least two points are required; a route supports up to 200 points.

## Configure your campus

Set the default map center and zoom in `client/.env`:

```dotenv
VITE_CAMPUS_LAT=19.1334
VITE_CAMPUS_LNG=72.9133
VITE_CAMPUS_ZOOM=16
```

Create the campus routes from the admin map editor. Simulation follows the exact saved waypoints. Rebuild after changing the environment values above.

Signal timing is controlled in `server/.env`:

```dotenv
STALE_AFTER_SECONDS=30
LOST_AFTER_SECONDS=90
```

## Suggested classroom demonstration

1. Start MongoDB and the application.
2. Open `/admin`, create a driver with a passcode, and save a route with at least two points.
3. Create a pickup zone around the demonstration location with a threshold of one for a single-phone demo.
4. Put the student map on the projector.
5. Open `/driver` on a phone, enter `BUGGY-01`, choose the approved driver, enter the passcode, and start the shift.
6. Select the saved route, tap **Phone GPS**, and allow location access. The marker appears and updates every five seconds.
7. From another phone inside the zone, press **Request pickup** and allow location access. The nearest driver receives the demand alert.
8. Pause broadcasting to show the marker become stale and then lost, then end the shift.

## API summary

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Server/database readiness |
| `GET` | `/api/buggies` | Public active-buggy snapshot |
| `GET` | `/api/routes` | Public predefined-route list |
| `GET` | `/api/demand-zones` | Public pickup-zone demand state and assignments |
| `POST` | `/api/demand-zones/:id/nudge` | Verify proximity and create or renew an anonymous pickup request |
| `GET` | `/api/drivers/options` | Public approved-driver name list |
| `POST` | `/api/drivers/register` | Verify a driver passcode, start a shift, and issue a private token |
| `GET` | `/api/drivers/me` | Restore an active driver session |
| `GET` | `/api/drivers/demand-alerts` | Get demand currently assigned to the authenticated buggy |
| `PUT` | `/api/drivers/occupancy` | Update and broadcast the onboard passenger count |
| `PUT` | `/api/drivers/location` | Send authenticated GPS coordinates and route direction |
| `DELETE` | `/api/drivers/session` | End a shift |
| `GET` | `/api/admin/overview` | Protected buggy, driver, and route database view |
| `DELETE` | `/api/admin/buggies/:id` | Permanently delete a buggy record |
| `POST` | `/api/admin/drivers` | Create an approved driver account |
| `DELETE` | `/api/admin/drivers/:id` | Delete an available driver account |
| `POST` | `/api/admin/demand-zones` | Create a pickup-demand zone |
| `PUT` | `/api/admin/demand-zones/:id` | Update a pickup-demand zone |
| `DELETE` | `/api/admin/demand-zones/:id` | Delete a zone and its active requests |
| `POST` | `/api/admin/routes` | Create a predefined route |
| `PUT` | `/api/admin/routes/:id` | Update a predefined route |
| `DELETE` | `/api/admin/routes/:id` | Delete a predefined route |

Driver-only routes use `Authorization: Bearer <token>`. Tokens are kept in the driver's browser local storage and are never included in public buggy data.
Admin routes use the `X-Admin-Key` header.
