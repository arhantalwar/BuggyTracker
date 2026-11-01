import { useEffect, useState } from 'react';
import { api } from '../api.js';
import RouteEditorMap from '../components/RouteEditorMap.jsx';
import DemandZoneEditorMap from '../components/DemandZoneEditorMap.jsx';
import SignalPill from '../components/SignalPill.jsx';

const ADMIN_STORAGE_KEY = 'buggyAdminKey';
const emptyRoute = () => ({ id: null, name: '', startLabel: '', endLabel: '', color: '#27c278', waypoints: [] });
const emptyDemandZone = () => ({ id: null, name: '', center: null, radiusMeters: 100, threshold: 3 });

function formatDate(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_STORAGE_KEY) || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [buggies, setBuggies] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverDraft, setDriverDraft] = useState({ name: '', passcode: '' });
  const [demandZones, setDemandZones] = useState([]);
  const [demandDraft, setDemandDraft] = useState(emptyDemandZone);
  const [routeDraft, setRouteDraft] = useState(emptyRoute);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(Boolean(adminKey));

  async function loadOverview(key = adminKey) {
    const data = await api.adminOverview(key);
    setBuggies(data.buggies);
    setRoutes(data.routes);
    setDrivers(data.drivers);
    setDemandZones(data.demandZones);
    setAuthenticated(true);
    return data;
  }

  useEffect(() => {
    const storedKey = sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!storedKey) return;
    loadOverview(storedKey)
      .catch(() => {
        sessionStorage.removeItem(ADMIN_STORAGE_KEY);
        setAdminKey('');
        setAuthenticated(false);
      })
      .finally(() => setChecking(false));
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await loadOverview(adminKey);
      sessionStorage.setItem(ADMIN_STORAGE_KEY, adminKey);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    setAuthenticated(false);
    setAdminKey('');
  }

  async function deleteBuggy(buggy) {
    if (!window.confirm(`Permanently delete ${buggy.buggyId} driven by ${buggy.driverName}?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.adminDeleteBuggy(adminKey, buggy.id);
      setBuggies((current) => current.filter((item) => item.id !== buggy.id));
      setMessage(`${buggy.buggyId} was deleted.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createDriver(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api.adminCreateDriver(adminKey, driverDraft);
      setDrivers((current) => [...current, data.driver].sort((a, b) => a.name.localeCompare(b.name)));
      setDriverDraft({ name: '', passcode: '' });
      setMessage(`${data.driver.name} can now sign in on the driver page.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteDriver(driver) {
    if (!window.confirm(`Delete the driver account for ${driver.name}?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.adminDeleteDriver(adminKey, driver.id);
      setDrivers((current) => current.filter((item) => item.id !== driver.id));
      setMessage(`${driver.name}'s account was deleted.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function editDemandZone(zone) {
    setDemandDraft({ id: zone.id, name: zone.name, center: { ...zone.center }, radiusMeters: zone.radiusMeters, threshold: zone.threshold });
    setMessage(`Editing pickup zone ${zone.name}.`);
  }

  async function saveDemandZone(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const payload = {
      name: demandDraft.name,
      center: demandDraft.center,
      radiusMeters: Number(demandDraft.radiusMeters),
      threshold: Number(demandDraft.threshold)
    };
    try {
      const data = demandDraft.id
        ? await api.adminUpdateDemandZone(adminKey, demandDraft.id, payload)
        : await api.adminCreateDemandZone(adminKey, payload);
      setDemandZones((current) => [...current.filter((zone) => zone.id !== data.zone.id), data.zone].sort((a, b) => a.name.localeCompare(b.name)));
      setMessage(`${data.zone.name} was ${demandDraft.id ? 'updated' : 'created'}.`);
      setDemandDraft(emptyDemandZone());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteDemandZone(zone) {
    if (!window.confirm(`Delete pickup zone “${zone.name}” and its active requests?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.adminDeleteDemandZone(adminKey, zone.id);
      setDemandZones((current) => current.filter((item) => item.id !== zone.id));
      if (demandDraft.id === zone.id) setDemandDraft(emptyDemandZone());
      setMessage(`${zone.name} was deleted.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function editRoute(route) {
    setRouteDraft({
      id: route.id,
      name: route.name,
      startLabel: route.startLabel || 'Route start',
      endLabel: route.endLabel || 'Route end',
      color: route.color,
      waypoints: route.waypoints.map((point) => ({ ...point }))
    });
    setMessage(`Editing ${route.name}.`);
  }

  async function saveRoute(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const payload = {
      name: routeDraft.name,
      startLabel: routeDraft.startLabel,
      endLabel: routeDraft.endLabel,
      color: routeDraft.color,
      waypoints: routeDraft.waypoints
    };
    try {
      const data = routeDraft.id
        ? await api.adminUpdateRoute(adminKey, routeDraft.id, payload)
        : await api.adminCreateRoute(adminKey, payload);
      setRoutes((current) => [...current.filter((route) => route.id !== data.route.id), data.route].sort((a, b) => a.name.localeCompare(b.name)));
      setMessage(`${data.route.name} was ${routeDraft.id ? 'updated' : 'created'}.`);
      setRouteDraft(emptyRoute());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoute(route) {
    if (!window.confirm(`Delete the route “${route.name}”?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.adminDeleteRoute(adminKey, route.id);
      setRoutes((current) => current.filter((item) => item.id !== route.id));
      if (routeDraft.id === route.id) setRouteDraft(emptyRoute());
      setMessage(`${route.name} was deleted.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <div className="admin-login-page"><div className="admin-login-card">Checking admin session…</div></div>;

  if (!authenticated) {
    return (
      <div className="admin-login-page">
        <form className="admin-login-card" onSubmit={login}>
          <div className="admin-lock">⌁</div>
          <div className="eyebrow">Restricted area</div>
          <h1>Admin dashboard</h1>
          <p>Enter the key configured in <code>server/.env</code>.</p>
          <label>
            Admin key
            <input type="password" required autoComplete="current-password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} />
          </label>
          {error && <div className="notice notice-error">{error}</div>}
          <button className="primary-button" disabled={busy}>{busy ? 'Checking…' : 'Open dashboard'}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-titlebar">
        <div><div className="eyebrow">Operations</div><h1>Admin dashboard</h1></div>
        <button type="button" className="text-button" onClick={logout}>Lock dashboard</button>
      </div>
      <div className="admin-stats">
        <div><strong>{buggies.filter((buggy) => buggy.active).length}</strong><span>Active shifts</span></div>
        <div><strong>{buggies.length}</strong><span>Database records</span></div>
        <div><strong>{routes.length}</strong><span>Saved routes</span></div>
        <div><strong>{drivers.length}</strong><span>Approved drivers</span></div>
        <div><strong>{demandZones.length}</strong><span>Pickup zones</span></div>
      </div>
      {error && <div className="notice notice-error admin-notice">{error}</div>}
      {message && <div className="notice admin-notice">{message}</div>}

      <section className="admin-section">
        <div className="admin-section-heading"><div><div className="eyebrow">Access control</div><h2>Driver accounts</h2></div><span>Create each approved driver and give the passcode to that driver.</span></div>
        <div className="driver-admin-grid">
          <form className="driver-account-form" onSubmit={createDriver}>
            <label>Driver name<input required maxLength="60" placeholder="e.g. Asha" value={driverDraft.name} onChange={(event) => setDriverDraft({ ...driverDraft, name: event.target.value })} /></label>
            <label>Passcode<input type="password" required minLength="4" maxLength="32" autoComplete="new-password" placeholder="4–32 characters" value={driverDraft.passcode} onChange={(event) => setDriverDraft({ ...driverDraft, passcode: event.target.value })} /></label>
            <button className="primary-button compact-button" disabled={busy}>{busy ? 'Creating…' : 'Add driver'}</button>
          </form>
          <div className="driver-account-list">
            {drivers.length === 0 && <div className="admin-empty">No approved drivers yet.</div>}
            {drivers.map((driver) => (
              <div className="driver-account-row" key={driver.id}>
                <span className="buggy-avatar">{driver.name.slice(0, 2).toUpperCase()}</span>
                <div><strong>{driver.name}</strong><span>{driver.active ? 'Shift active' : 'Available'}</span></div>
                <button type="button" className="small-danger-button" onClick={() => deleteDriver(driver)} disabled={busy || driver.active}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading"><div><div className="eyebrow">Database</div><h2>Buggy records</h2></div><span>Deleting an active record immediately stops its driver session.</span></div>
        <div className="admin-buggy-table">
          {buggies.length === 0 && <div className="admin-empty">No buggy records in the database.</div>}
          {buggies.map((buggy) => (
            <div className="admin-buggy-row" key={buggy.id}>
              <span className="buggy-avatar">{buggy.buggyId.slice(0, 2)}</span>
              <div><strong>{buggy.buggyId}</strong><span>{buggy.driverName}</span></div>
              <SignalPill status={buggy.active ? buggy.status : 'lost'} />
              <div className="admin-shift-times">
                <div className="admin-date"><span>Shift started</span><strong>{formatDate(buggy.shiftStartedAt)}</strong></div>
                {!buggy.active && <div className="admin-date"><span>Shift ended</span><strong>{formatDate(buggy.shiftEndedAt)}</strong></div>}
              </div>
              <button type="button" className="small-danger-button" onClick={() => deleteBuggy(buggy)} disabled={busy}>Delete</button>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-section demand-admin-section">
        <div className="admin-section-heading"><div><div className="eyebrow">Pickup demand</div><h2>{demandDraft.id ? 'Edit pickup zone' : 'Create a pickup zone'}</h2></div><span>Students can request pickup only while their phone is inside the selected radius.</span></div>
        <div className="demand-admin-grid">
          <form className="demand-editor-panel" onSubmit={saveDemandZone}>
            <div className="demand-form-row">
              <label>Zone name<input required maxLength="80" placeholder="e.g. Library entrance" value={demandDraft.name} onChange={(event) => setDemandDraft({ ...demandDraft, name: event.target.value })} /></label>
              <label>Radius (metres)<input type="number" required min="20" max="500" step="1" value={demandDraft.radiusMeters} onChange={(event) => setDemandDraft({ ...demandDraft, radiusMeters: event.target.value })} /></label>
              <label>Students to alert<input type="number" required min="1" max="50" step="1" value={demandDraft.threshold} onChange={(event) => setDemandDraft({ ...demandDraft, threshold: event.target.value })} /></label>
            </div>
            <div className="route-map-wrap">
              <DemandZoneEditorMap center={demandDraft.center} radiusMeters={Number(demandDraft.radiusMeters) || 20} onChange={(center) => setDemandDraft((current) => ({ ...current, center }))} />
              <div className="route-map-help">{demandDraft.center ? `${demandDraft.center.lat.toFixed(5)}, ${demandDraft.center.lng.toFixed(5)}` : 'Click the map to choose the zone centre'}</div>
            </div>
            <div className="editor-actions">
              {demandDraft.id && <button type="button" className="secondary-button compact-button" onClick={() => setDemandDraft(emptyDemandZone())}>Cancel edit</button>}
              <button className="primary-button compact-button" disabled={busy || !demandDraft.center}>{busy ? 'Saving…' : demandDraft.id ? 'Update zone' : 'Save zone'}</button>
            </div>
          </form>
          <div className="saved-routes-panel">
            <h3>Pickup zones</h3>
            {demandZones.length === 0 && <div className="admin-empty">Create the first location where students may request pickup.</div>}
            {demandZones.map((zone) => (
              <div className={`demand-zone-card ${zone.thresholdReached ? 'threshold-reached' : ''}`} key={zone.id}>
                <span className="demand-zone-icon">◎</span>
                <div><strong>{zone.name}</strong><span>{zone.radiusMeters} m radius · alert at {zone.threshold} · {zone.demandCount || 0} active</span></div>
                <button type="button" onClick={() => editDemandZone(zone)}>Edit</button>
                <button type="button" className="route-delete" onClick={() => deleteDemandZone(zone)} disabled={busy}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-section route-admin-section">
        <div className="admin-section-heading"><div><div className="eyebrow">Route planner</div><h2>{routeDraft.id ? 'Edit route' : 'Create a route'}</h2></div><span>Click the map in travel order to add points.</span></div>
        <div className="route-admin-grid">
          <form className="route-editor-panel" onSubmit={saveRoute}>
            <div className="route-form-row">
              <label>Route name<input required maxLength="80" placeholder="e.g. Hostel to Main Gate" value={routeDraft.name} onChange={(event) => setRouteDraft({ ...routeDraft, name: event.target.value })} /></label>
              <label className="color-label">Color<input type="color" value={routeDraft.color} onChange={(event) => setRouteDraft({ ...routeDraft, color: event.target.value })} /></label>
            </div>
            <div className="route-endpoint-row">
              <label>Starting endpoint<input required maxLength="60" placeholder="e.g. Hostel 12" value={routeDraft.startLabel} onChange={(event) => setRouteDraft({ ...routeDraft, startLabel: event.target.value })} /></label>
              <label>Final endpoint<input required maxLength="60" placeholder="e.g. Main Gate" value={routeDraft.endLabel} onChange={(event) => setRouteDraft({ ...routeDraft, endLabel: event.target.value })} /></label>
            </div>
            <div className="route-map-wrap">
              <RouteEditorMap
                points={routeDraft.waypoints}
                color={routeDraft.color}
                routeId={routeDraft.id}
                onAddPoint={(point) => setRouteDraft((current) => ({ ...current, waypoints: [...current.waypoints, point] }))}
              />
              <div className="route-map-help">{routeDraft.waypoints.length} point{routeDraft.waypoints.length === 1 ? '' : 's'} · minimum 2</div>
            </div>
            <div className="editor-actions">
              <button type="button" className="secondary-button compact-button" disabled={!routeDraft.waypoints.length} onClick={() => setRouteDraft((current) => ({ ...current, waypoints: current.waypoints.slice(0, -1) }))}>Undo point</button>
              <button type="button" className="secondary-button compact-button" disabled={!routeDraft.waypoints.length} onClick={() => setRouteDraft((current) => ({ ...current, waypoints: [] }))}>Clear points</button>
              {routeDraft.id && <button type="button" className="secondary-button compact-button" onClick={() => setRouteDraft(emptyRoute())}>Cancel edit</button>}
              <button className="primary-button compact-button" disabled={busy || routeDraft.waypoints.length < 2}>{busy ? 'Saving…' : routeDraft.id ? 'Update route' : 'Save route'}</button>
            </div>
          </form>

          <div className="saved-routes-panel">
            <h3>Saved routes</h3>
            {routes.length === 0 && <div className="admin-empty">Draw and save your first campus route.</div>}
            {routes.map((route) => (
              <div className="saved-route-card" key={route.id}>
                <i style={{ background: route.color }} />
                <div><strong>{route.name}</strong><span>{route.startLabel} ↔ {route.endLabel} · {route.waypoints.length} points</span></div>
                <button type="button" onClick={() => editRoute(route)}>Edit</button>
                <button type="button" className="route-delete" onClick={() => deleteRoute(route)} disabled={busy}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
