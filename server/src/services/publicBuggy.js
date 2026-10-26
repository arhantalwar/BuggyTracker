const staleAfterMs = Number(process.env.STALE_AFTER_SECONDS || 30) * 1000;
const lostAfterMs = Number(process.env.LOST_AFTER_SECONDS || 90) * 1000;

export function signalStatus(lastSeen, now = Date.now()) {
  if (!lastSeen) return 'waiting';
  const age = now - new Date(lastSeen).getTime();
  if (age >= lostAfterMs) return 'lost';
  if (age >= staleAfterMs) return 'stale';
  return 'live';
}

export function toPublicBuggy(session) {
  const item = session.toObject ? session.toObject() : session;
  const passengerCount = Number.isInteger(item.passengerCount) ? item.passengerCount : 0;
  return {
    id: String(item._id),
    buggyId: item.buggyId,
    driverName: item.driverName,
    routeId: item.routeId ? String(item.routeId) : null,
    direction: item.direction || 'unknown',
    passengerCount,
    passengerCapacity: 10,
    availableSeats: 10 - passengerCount,
    location: item.location?.lat == null ? null : item.location,
    lastSeen: item.lastSeen || null,
    shiftStartedAt: item.shiftStartedAt,
    status: signalStatus(item.lastSeen)
  };
}

export const thresholds = {
  staleAfterSeconds: staleAfterMs / 1000,
  lostAfterSeconds: lostAfterMs / 1000
};
