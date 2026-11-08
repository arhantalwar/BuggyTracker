import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api, SERVER_URL } from '../api.js';
import BuggyMap from '../components/BuggyMap.jsx';
import SignalPill from '../components/SignalPill.jsx';

function computeStatus(lastSeen, thresholds) {
  if (!lastSeen) return 'waiting';
  const age = (Date.now() - new Date(lastSeen).getTime()) / 1000;
  if (age >= thresholds.lostAfterSeconds) return 'lost';
  if (age >= thresholds.staleAfterSeconds) return 'stale';
  return 'live';
}

function timeAgo(timestamp) {
  if (!timestamp) return 'No position yet';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.floor(seconds / 60)}m ago`;
}

function directionText(buggy, routes) {
  const route = routes.find((item) => item.id === buggy.routeId);
  if (!route || buggy.direction === 'unknown') return null;
  return `Towards ${buggy.direction === 'reverse' ? route.startLabel : route.endLabel}`;
}

function distanceMeters(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const latDistance = radians(second.lat - first.lat);
  const lngDistance = radians(second.lng - first.lng);
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(lngDistance / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function demandDeviceId() {
  const storageKey = 'buggyDemandDeviceId';
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, id);
  }
  return id;
}

export default function StudentPage() {
  const [buggies, setBuggies] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [demandZones, setDemandZones] = useState([]);
  const [thresholds, setThresholds] = useState({ staleAfterSeconds: 30, lostAfterSeconds: 90 });
  const [selectedId, setSelectedId] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const [clock, setClock] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [nudgeBusy, setNudgeBusy] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [nudgeError, setNudgeError] = useState(false);

  useEffect(() => {
    if (!panelOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [panelOpen]);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getBuggies(), api.getRoutes(), api.getDemandZones()])
      .then(([data, routeData, demandData]) => {
        if (!mounted) return;
        setBuggies(data.buggies);
        setThresholds(data.thresholds);
        setRoutes(routeData.routes);
        setDemandZones(demandData.zones);
      })
      .catch((err) => mounted && setError(err.message));

    const socket = io(SERVER_URL || undefined, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConnection('connected'));
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('buggy:started', (buggy) => {
      setBuggies((current) => [...current.filter((item) => item.id !== buggy.id), buggy]);
    });
    socket.on('buggy:updated', (buggy) => {
      setBuggies((current) => [...current.filter((item) => item.id !== buggy.id), buggy]);
    });
    socket.on('buggy:ended', ({ id }) => {
      setBuggies((current) => current.filter((item) => item.id !== id));
      setSelectedId((current) => current === id ? null : current);
    });
    socket.on('route:created', (route) => {
      setRoutes((current) => [...current.filter((item) => item.id !== route.id), route]);
    });
    socket.on('route:updated', (route) => {
      setRoutes((current) => current.map((item) => item.id === route.id ? route : item));
    });
    socket.on('route:deleted', ({ id }) => {
      setRoutes((current) => current.filter((item) => item.id !== id));
    });
    socket.on('demand:updated', ({ zones }) => setDemandZones(zones));

    const clock = window.setInterval(() => setClock((value) => value + 1), 1000);
    const demandRefresh = window.setInterval(() => {
      api.getDemandZones().then((data) => mounted && setDemandZones(data.zones)).catch(() => {});
    }, 30000);
    return () => {
      mounted = false;
      socket.disconnect();
      window.clearInterval(clock);
      window.clearInterval(demandRefresh);
    };
  }, []);

  const liveBuggies = useMemo(() => buggies
    .map((buggy) => ({ ...buggy, status: computeStatus(buggy.lastSeen, thresholds) }))
    .sort((a, b) => a.buggyId.localeCompare(b.buggyId)), [buggies, thresholds, clock]);
  const selectedBuggy = liveBuggies.find((buggy) => buggy.id === selectedId);

  async function requestPickup() {
    setNudgeMessage('');
    setNudgeError(false);
    if (!demandZones.length) {
      setNudgeError(true);
      setNudgeMessage('No pickup zones are configured yet.');
      return;
    }
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setNudgeError(true);
      setNudgeMessage('Pickup requests need HTTPS so your phone can verify its location.');
      return;
    }
    if (!navigator.geolocation) {
      setNudgeError(true);
      setNudgeMessage('This browser cannot provide your location.');
      return;
    }
    setNudgeBusy(true);
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }));
      const current = { lat: position.coords.latitude, lng: position.coords.longitude };
      const nearest = demandZones
        .map((zone) => ({ zone, distance: distanceMeters(current, zone.center) }))
        .filter(({ zone, distance }) => distance <= zone.radiusMeters)
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest) throw new Error('You are not currently inside a campus pickup zone.');
      const data = await api.nudgeDemandZone(nearest.zone.id, { ...current, accuracy: position.coords.accuracy, deviceId: demandDeviceId() });
      setDemandZones((zones) => zones.map((zone) => zone.id === data.zone.id ? data.zone : zone));
      const assignment = data.zone.thresholdReached
        ? data.zone.assignedBuggyLabel ? ` ${data.zone.assignedBuggyLabel} has been notified.` : ' Demand is high; an available buggy will be notified.'
        : ` ${data.zone.threshold - data.zone.demandCount} more request${data.zone.threshold - data.zone.demandCount === 1 ? '' : 's'} needed to alert a buggy.`;
      setNudgeMessage(`${data.message}${assignment}`);
    } catch (requestError) {
      setNudgeError(true);
      setNudgeMessage(requestError.code === 1 ? 'Location permission was denied.' : requestError.message || 'Could not verify your pickup zone.');
    } finally {
      setNudgeBusy(false);
    }
  }

  return (
    <div className={`student-layout ${panelOpen ? 'mobile-panel-open' : ''}`}>
      <button
        type="button"
        className="mobile-panel-toggle"
        aria-label="Open active buggies"
        aria-expanded={panelOpen}
        aria-controls="active-buggies-panel"
        onClick={() => setPanelOpen(true)}
      >
        <span className="hamburger-icon" aria-hidden="true"><i /><i /><i /></span>
        <span>Buggies</span>
        <b>{liveBuggies.length}</b>
      </button>
      {panelOpen && <button type="button" className="mobile-panel-backdrop" aria-label="Close active buggies" onClick={() => setPanelOpen(false)} />}
      <aside className="buggy-panel" id="active-buggies-panel" aria-label="Active buggies">
        <div className="mobile-panel-head">
          <strong>Live buggies</strong>
          <button type="button" aria-label="Close active buggies" onClick={() => setPanelOpen(false)}>×</button>
        </div>
        <div className="eyebrow">Campus transport</div>
        <h1>Find your ride.</h1>
        <p className="lede">Live buggy positions, without the guesswork.</p>
        <div className={`connection-state connection-${connection}`}>
          <i /> {connection === 'connected' ? 'Receiving live updates' : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </div>
        {error && <div className="notice notice-error">{error}</div>}
        <div className="panel-heading">
          <h2>Active buggies</h2>
          <span>{liveBuggies.length}</span>
        </div>
        <div className="buggy-list">
          {liveBuggies.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">B</div>
              <strong>No active buggies</strong>
              <span>A driver will appear here when their shift begins.</span>
            </div>
          )}
          {liveBuggies.map((buggy) => (
            <button
              type="button"
              key={buggy.id}
              className={`buggy-card ${selectedId === buggy.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedId(buggy.id);
                setPanelOpen(false);
              }}
            >
              <span className="buggy-avatar">{buggy.buggyId.slice(0, 2)}</span>
              <span className="buggy-card-main">
                <span className="buggy-title-row"><strong>{buggy.buggyId}</strong><SignalPill status={buggy.status} /></span>
                <span>Driver: {buggy.driverName}</span>
                <span className={`seat-availability ${buggy.availableSeats === 0 ? 'seats-full' : buggy.availableSeats <= 2 ? 'seats-low' : ''}`}>
                  {buggy.availableSeats === 0 ? 'Full · no seats available' : `${buggy.availableSeats} of ${buggy.passengerCapacity} passenger seats available`}
                </span>
                <small>{timeAgo(buggy.lastSeen)} · {buggy.location?.source === 'simulation' ? 'Simulated route' : 'Phone GPS'}</small>
                {buggy.routeId && <small className="route-association">Route: {routes.find((route) => route.id === buggy.routeId)?.name || 'Unavailable'}</small>}
                {directionText(buggy, routes) && <span className="buggy-direction"><b>→</b> {directionText(buggy, routes)}</span>}
              </span>
              <span className="chevron">›</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="map-stage" aria-label="Live campus map">
        <div className="pickup-request-wrap">
          <button type="button" className="pickup-request-button" disabled={nudgeBusy} onClick={requestPickup}>
            <span>⌖</span><strong>{nudgeBusy ? 'Checking location…' : 'Request pickup'}</strong>
          </button>
          {nudgeMessage && <div className={`pickup-request-message ${nudgeError ? 'error' : ''}`}>{nudgeMessage}<button type="button" aria-label="Dismiss message" onClick={() => setNudgeMessage('')}>×</button></div>}
        </div>
        <BuggyMap buggies={liveBuggies} selectedBuggy={selectedBuggy} routes={routes} demandZones={demandZones} onSelectBuggy={setSelectedId} />
        <div className="map-legend">
          <span><i className="legend-live" /> Live</span>
          <span><i className="legend-stale" /> Stale</span>
          <span><i className="legend-lost" /> Lost</span>
        </div>
      </section>
    </div>
  );
}
