import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, SERVER_URL } from '../api.js';
import SignalPill from '../components/SignalPill.jsx';

const STORAGE_KEY = 'buggyDriverSession';
const SEND_INTERVAL_MS = 5000;

function loadStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export default function DriverPage() {
  const [form, setForm] = useState({ buggyId: '', driverId: '', passcode: '' });
  const [session, setSession] = useState(loadStoredSession);
  const [checking, setChecking] = useState(Boolean(loadStoredSession()));
  const [mode, setMode] = useState(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [latestCoords, setLatestCoords] = useState(null);
  const [busy, setBusy] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [driverOptions, setDriverOptions] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [travelDirection, setTravelDirection] = useState('forward');
  const [passengerCount, setPassengerCount] = useState(() => loadStoredSession()?.buggy?.passengerCount || 0);
  const [occupancyBusy, setOccupancyBusy] = useState(false);
  const [demandAlerts, setDemandAlerts] = useState([]);
  const watchId = useRef(null);
  const timerId = useRef(null);
  const pendingLocation = useRef(null);
  const sending = useRef(false);
  const lastSentAt = useRef(0);
  const travelDirectionRef = useRef('forward');

  function chooseDirection(direction) {
    travelDirectionRef.current = direction;
    setTravelDirection(direction);
  }

  const stopTracking = useCallback(() => {
    if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    if (timerId.current != null) window.clearInterval(timerId.current);
    watchId.current = null;
    timerId.current = null;
    pendingLocation.current = null;
    sending.current = false;
    lastSentAt.current = 0;
  }, []);

  const sendLocation = useCallback(async (location) => {
    if (!session?.token || !location || sending.current) return;
    sending.current = true;
    try {
      await api.sendLocation(session.token, {
        ...location,
        routeId: selectedRouteId || null,
        direction: location.direction || travelDirectionRef.current
      });
      setLatestCoords(location);
      setLastUpdate(new Date());
      lastSentAt.current = Date.now();
      setStatus('broadcasting');
      setMessage('');
    } catch (error) {
      setStatus('error');
      setMessage(error.message);
      if (/no longer active|token/i.test(error.message)) {
        stopTracking();
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      }
    } finally {
      sending.current = false;
    }
  }, [session, selectedRouteId, stopTracking]);

  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored?.token) {
      setChecking(false);
      return;
    }
    api.getSession(stored.token)
      .then(({ buggy }) => {
        const restored = { token: stored.token, buggy };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        setSession(restored);
        setSelectedRouteId(buggy.routeId || '');
        chooseDirection(buggy.direction === 'reverse' ? 'reverse' : 'forward');
        setPassengerCount(buggy.passengerCount || 0);
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      })
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    Promise.all([api.getRoutes(), api.getDriverOptions()])
      .then(([routeData, driverData]) => {
        setRoutes(routeData.routes);
        setDriverOptions(driverData.drivers);
      })
      .catch(() => {
        setRoutes([]);
        setDriverOptions([]);
      });
  }, []);

  useEffect(() => () => stopTracking(), [stopTracking]);

  useEffect(() => {
    if (!session?.token) {
      setDemandAlerts([]);
      return undefined;
    }
    let active = true;
    const refreshAlerts = () => api.getDemandAlerts(session.token)
      .then(({ alerts }) => active && setDemandAlerts(alerts))
      .catch(() => {});
    refreshAlerts();
    const interval = window.setInterval(refreshAlerts, 10000);
    const socket = io(SERVER_URL || undefined, { transports: ['websocket', 'polling'] });
    socket.on('demand:updated', refreshAlerts);
    return () => {
      active = false;
      window.clearInterval(interval);
      socket.disconnect();
    };
  }, [session?.token]);

  async function register(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const created = await api.register(form);
      const active = { token: created.token, buggy: created.buggy };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      setSession(active);
      setPassengerCount(created.buggy.passengerCount || 0);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function startGps() {
    if (!selectedRouteId) {
      setStatus('error');
      setMessage('Choose your route before broadcasting.');
      return;
    }
    stopTracking();
    setMode('gps');
    setStatus('acquiring');
    setMessage('');
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setMode(null);
      setStatus('error');
      setMessage('Phone GPS needs HTTPS. Open the driver page through the secure tunnel.');
      return;
    }
    if (!navigator.geolocation) {
      setMode(null);
      setStatus('error');
      setMessage('This browser does not provide geolocation.');
      return;
    }

    const onPosition = (position) => {
      pendingLocation.current = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        source: 'gps'
      };
      setStatus('broadcasting');
      setMessage('');
      if (lastSentAt.current === 0) sendLocation(pendingLocation.current);
    };
    watchId.current = navigator.geolocation.watchPosition(
      onPosition,
      (error) => {
        setStatus('error');
        setMessage(error.code === 1 ? 'Location permission was denied. Allow location access to broadcast.' : `Could not read GPS: ${error.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    timerId.current = window.setInterval(() => sendLocation(pendingLocation.current), SEND_INTERVAL_MS);
  }

  function pauseBroadcast() {
    stopTracking();
    setMode(null);
    setStatus('idle');
    setMessage('');
  }

  async function changePassengerCount(change) {
    if (!session?.token || occupancyBusy) return;
    const nextCount = passengerCount + change;
    if (nextCount < 0 || nextCount > 10) return;
    setOccupancyBusy(true);
    try {
      const { buggy } = await api.updateOccupancy(session.token, nextCount);
      setPassengerCount(buggy.passengerCount);
      const updatedSession = { ...session, buggy: { ...session.buggy, ...buggy } };
      setSession(updatedSession);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));
    } catch (error) {
      setStatus('error');
      setMessage(error.message);
    } finally {
      setOccupancyBusy(false);
    }
  }

  async function endShift() {
    if (!session?.token) return;
    setBusy(true);
    stopTracking();
    try {
      await api.endSession(session.token);
    } catch (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setMode(null);
    setStatus('idle');
    setLastUpdate(null);
    setLatestCoords(null);
    setPassengerCount(0);
    chooseDirection('forward');
    setBusy(false);
  }

  const assignedRoute = routes.find((route) => route.id === selectedRouteId);
  const directionDestination = assignedRoute
    ? travelDirection === 'forward' ? assignedRoute.endLabel : assignedRoute.startLabel
    : null;

  if (checking) {
    return <div className="driver-page"><div className="driver-card loading-card">Restoring your shift…</div></div>;
  }

  if (!session) {
    return (
      <div className="driver-page">
        <section className="driver-intro">
          <div className="eyebrow">Driver console</div>
          <h1>Start your shift.</h1>
          <p>Register this phone to a buggy, choose the assigned route, and broadcast its live GPS position.</p>
        </section>
        <form className="driver-card register-card" onSubmit={register}>
          <label>
            Buggy identifier
            <input
              required
              maxLength="24"
              placeholder="e.g. BUGGY-04"
              value={form.buggyId}
              onChange={(event) => setForm({ ...form, buggyId: event.target.value })}
            />
          </label>
          <label>
            Driver
            <select
              required
              value={form.driverId}
              onChange={(event) => setForm({ ...form, driverId: event.target.value })}
            >
              <option value="">Choose your name</option>
              {driverOptions.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
            </select>
          </label>
          <label>
            Passcode
            <input
              type="password"
              required
              minLength="4"
              maxLength="32"
              autoComplete="current-password"
              placeholder="Enter your passcode"
              value={form.passcode}
              onChange={(event) => setForm({ ...form, passcode: event.target.value })}
            />
          </label>
          {!driverOptions.length && <div className="notice">No drivers are available. Ask an admin to create your account.</div>}
          {message && <div className="notice notice-error">{message}</div>}
          <button className="primary-button" disabled={busy || !driverOptions.length}>{busy ? 'Starting…' : 'Start shift'}</button>
          <p className="form-note">This active shift will be remembered if the page refreshes.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="driver-page active-driver-page">
      <section className="driver-intro">
        <div className="eyebrow">Driver console</div>
        <h1>{session.buggy.buggyId}</h1>
        <p>Shift active for {session.buggy.driverName}</p>
      </section>
      <section className="driver-card broadcast-card">
        {demandAlerts.map((alert) => (
          <div className="driver-demand-alert" key={alert.id}>
            <span className="demand-alert-icon">!</span>
            <div><span>Pickup demand nearby</span><strong>{alert.demandCount} students at {alert.name}</strong><small>{alert.distanceToAssignedBuggy} m away · {alert.assignedBuggySeats} passenger seats currently free</small></div>
          </div>
        ))}
        <div className="broadcast-head">
          <div>
            <span className="field-label">Broadcast status</span>
            <h2>{status === 'broadcasting' ? 'Position is live' : status === 'acquiring' ? 'Finding location' : status === 'error' ? 'Needs attention' : 'Ready to broadcast'}</h2>
          </div>
          <SignalPill status={status === 'broadcasting' ? 'live' : status === 'error' ? 'lost' : 'waiting'} />
        </div>
        {message && <div className="driver-status-toast notice notice-error" role="alert">{message}</div>}
        <label className="route-select-label">
          Assigned route
          <select value={selectedRouteId} onChange={(event) => { setSelectedRouteId(event.target.value); chooseDirection('forward'); }} disabled={Boolean(mode)}>
            <option value="">Select your route</option>
            {routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
          </select>
        </label>
        {assignedRoute && (
          <div className="direction-control">
            <span className="field-label">Travel direction</span>
            <button
              type="button"
              className="direction-toggle active"
              onClick={() => chooseDirection(travelDirection === 'forward' ? 'reverse' : 'forward')}
            >
              {travelDirection === 'forward'
                ? `${assignedRoute.startLabel} → ${assignedRoute.endLabel}`
                : `${assignedRoute.endLabel} → ${assignedRoute.startLabel}`}
            </button>
            <small>Tap the button when the buggy begins its return journey.</small>
          </div>
        )}
        <div className={`occupancy-control ${passengerCount === 10 ? 'occupancy-full' : ''}`}>
          <div className="occupancy-heading">
            <div><span className="field-label">Passengers on board</span><strong>{passengerCount}<small>/10</small></strong></div>
            <span className="seats-remaining">{passengerCount === 10 ? 'Full' : `${10 - passengerCount} seat${10 - passengerCount === 1 ? '' : 's'} free`}</span>
          </div>
          <div className="capacity-meter" aria-label={`${passengerCount} of 10 passenger seats occupied`}>
            {Array.from({ length: 10 }, (_, index) => <i key={index} className={index < passengerCount ? 'occupied' : ''} />)}
          </div>
          <div className="occupancy-actions">
            <button type="button" aria-label="Remove one passenger" disabled={occupancyBusy || passengerCount === 0} onClick={() => changePassengerCount(-1)}>−</button>
            <span>Update as passengers board or leave</span>
            <button type="button" aria-label="Add one passenger" disabled={occupancyBusy || passengerCount === 10} onClick={() => changePassengerCount(1)}>+</button>
          </div>
        </div>
        <div className="mode-grid gps-only">
          <button type="button" className={`mode-button ${mode === 'gps' ? 'active' : ''}`} onClick={startGps} disabled={!selectedRouteId}>
            <span className="mode-icon">◎</span>
            <strong>Phone GPS</strong>
            <small>Use your real position</small>
          </button>
        </div>
        <div className="telemetry">
          <div><span>Mode</span><strong>{mode === 'gps' ? 'Phone GPS' : 'Paused'}</strong></div>
          <div><span>Heading</span><strong>{directionDestination ? `Towards ${directionDestination}` : 'No assigned route'}</strong></div>
          <div><span>Last sent</span><strong>{lastUpdate ? lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</strong></div>
          <div><span>Position</span><strong>{latestCoords ? `${latestCoords.lat.toFixed(5)}, ${latestCoords.lng.toFixed(5)}` : '—'}</strong></div>
        </div>
        {mode && <button type="button" className="secondary-button" onClick={pauseBroadcast}>Pause broadcasting</button>}
        <button type="button" className="danger-button" onClick={endShift} disabled={busy}>{busy ? 'Ending…' : 'End shift'}</button>
      </section>
      <p className="driver-tip">Keep this tab open while driving. The screen may lock, but some phones pause browser location in the background.</p>
    </div>
  );
}
