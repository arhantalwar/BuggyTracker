import BuggySession from '../models/BuggySession.js';
import DemandNudge from '../models/DemandNudge.js';
import DemandZone from '../models/DemandZone.js';

export const NUDGE_LIFETIME_MINUTES = 10;

export function distanceMeters(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const latDistance = radians(second.lat - first.lat);
  const lngDistance = radians(second.lng - first.lng);
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(lngDistance / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function serializeDemandZone(zone) {
  const item = zone.toObject ? zone.toObject() : zone;
  return {
    id: String(item._id),
    name: item.name,
    center: { lat: item.center.lat, lng: item.center.lng },
    radiusMeters: item.radiusMeters,
    threshold: item.threshold,
    active: item.active !== false
  };
}

export async function getDemandSnapshot() {
  const now = new Date();
  const liveLocationCutoff = Date.now() - Number(process.env.STALE_AFTER_SECONDS || 30) * 1000;
  const [zoneDocuments, sessionDocuments] = await Promise.all([
    DemandZone.find({ active: true }).sort({ name: 1 }),
    BuggySession.find({ active: true, 'location.lat': { $exists: true }, 'location.lng': { $exists: true } })
  ]);
  const sessions = sessionDocuments
    .map((session) => session.toObject ? session.toObject() : session)
    .filter((session) => session.location?.lat != null
      && session.location?.lng != null
      && (session.passengerCount || 0) < 10
      && session.lastSeen
      && new Date(session.lastSeen).getTime() >= liveLocationCutoff);

  return Promise.all(zoneDocuments.map(async (document) => {
    const zone = serializeDemandZone(document);
    const demandCount = await DemandNudge.countDocuments({ zoneId: document._id, expiresAt: { $gt: now } });
    let nearest = null;
    if (demandCount >= zone.threshold) {
      for (const session of sessions) {
        const distance = distanceMeters(zone.center, session.location);
        if (!nearest || distance < nearest.distanceMeters) nearest = { session, distanceMeters: distance };
      }
    }
    return {
      ...zone,
      demandCount,
      thresholdReached: demandCount >= zone.threshold,
      assignedBuggyId: nearest ? String(nearest.session._id) : null,
      assignedBuggyLabel: nearest?.session.buggyId || null,
      assignedBuggySeats: nearest ? 10 - (nearest.session.passengerCount || 0) : null,
      distanceToAssignedBuggy: nearest ? Math.round(nearest.distanceMeters) : null,
      nudgeLifetimeMinutes: NUDGE_LIFETIME_MINUTES
    };
  }));
}

export async function broadcastDemandSnapshot(app) {
  const zones = await getDemandSnapshot();
  app.get('io').emit('demand:updated', { zones });
  return zones;
}
