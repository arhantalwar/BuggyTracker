export const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return response.status === 204 ? null : response.json();
}

export const api = {
  getBuggies: () => request('/api/buggies'),
  getRoutes: () => request('/api/routes'),
  getDemandZones: () => request('/api/demand-zones'),
  nudgeDemandZone: (id, location) => request(`/api/demand-zones/${id}/nudge`, {
    method: 'POST',
    body: JSON.stringify(location)
  }),
  getDriverOptions: () => request('/api/drivers/options'),
  register: (details) => request('/api/drivers/register', { method: 'POST', body: JSON.stringify(details) }),
  getSession: (token) => request('/api/drivers/me', { headers: { Authorization: `Bearer ${token}` } }),
  getDemandAlerts: (token) => request('/api/drivers/demand-alerts', { headers: { Authorization: `Bearer ${token}` } }),
  updateOccupancy: (token, passengerCount) => request('/api/drivers/occupancy', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ passengerCount })
  }),
  sendLocation: (token, location) => request('/api/drivers/location', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(location)
  }),
  endSession: (token) => request('/api/drivers/session', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  }),
  adminOverview: (key) => request('/api/admin/overview', { headers: { 'X-Admin-Key': key } }),
  adminDeleteBuggy: (key, id) => request(`/api/admin/buggies/${id}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': key }
  }),
  adminCreateDriver: (key, driver) => request('/api/admin/drivers', {
    method: 'POST',
    headers: { 'X-Admin-Key': key },
    body: JSON.stringify(driver)
  }),
  adminDeleteDriver: (key, id) => request(`/api/admin/drivers/${id}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': key }
  }),
  adminCreateDemandZone: (key, zone) => request('/api/admin/demand-zones', {
    method: 'POST',
    headers: { 'X-Admin-Key': key },
    body: JSON.stringify(zone)
  }),
  adminUpdateDemandZone: (key, id, zone) => request(`/api/admin/demand-zones/${id}`, {
    method: 'PUT',
    headers: { 'X-Admin-Key': key },
    body: JSON.stringify(zone)
  }),
  adminDeleteDemandZone: (key, id) => request(`/api/admin/demand-zones/${id}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': key }
  }),
  adminCreateRoute: (key, route) => request('/api/admin/routes', {
    method: 'POST',
    headers: { 'X-Admin-Key': key },
    body: JSON.stringify(route)
  }),
  adminUpdateRoute: (key, id, route) => request(`/api/admin/routes/${id}`, {
    method: 'PUT',
    headers: { 'X-Admin-Key': key },
    body: JSON.stringify(route)
  }),
  adminDeleteRoute: (key, id) => request(`/api/admin/routes/${id}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': key }
  })
};
