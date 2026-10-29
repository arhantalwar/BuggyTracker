import express from 'express';
import mongoose from 'mongoose';
import { adminAuth } from '../middleware/adminAuth.js';
import BuggySession from '../models/BuggySession.js';
import CampusRoute from '../models/CampusRoute.js';
import Driver from '../models/Driver.js';
import DemandNudge from '../models/DemandNudge.js';
import DemandZone from '../models/DemandZone.js';
import { broadcastDemandSnapshot, getDemandSnapshot, serializeDemandZone } from '../services/demand.js';
import { hashPasscode } from '../services/passcodes.js';
import { toPublicBuggy } from '../services/publicBuggy.js';

const router = express.Router();
router.use(adminAuth);

function serializeRoute(route) {
  const item = route.toObject ? route.toObject() : route;
  return {
    id: String(item._id),
    name: item.name,
    startLabel: item.startLabel || 'Route start',
    endLabel: item.endLabel || 'Route end',
    color: item.color,
    waypoints: item.waypoints,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function routeInput(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const startLabel = typeof body.startLabel === 'string' ? body.startLabel.trim() : 'Route start';
  const endLabel = typeof body.endLabel === 'string' ? body.endLabel.trim() : 'Route end';
  const color = typeof body.color === 'string' ? body.color.trim() : '';
  const waypoints = Array.isArray(body.waypoints)
    ? body.waypoints.map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }))
    : [];

  if (!name || name.length > 80) throw Object.assign(new Error('Route name is required and must be at most 80 characters.'), { status: 400 });
  if (!startLabel || !endLabel || startLabel.length > 60 || endLabel.length > 60) throw Object.assign(new Error('Both endpoint names are required and must be at most 60 characters.'), { status: 400 });
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw Object.assign(new Error('Choose a valid route color.'), { status: 400 });
  if (waypoints.length < 2 || waypoints.length > 200) throw Object.assign(new Error('A route needs between 2 and 200 points.'), { status: 400 });
  if (waypoints.some(({ lat, lng }) => !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180)) {
    throw Object.assign(new Error('Every waypoint must have valid coordinates.'), { status: 400 });
  }
  return { name, startLabel, endLabel, color, waypoints };
}

function demandZoneInput(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const lat = Number(body.center?.lat);
  const lng = Number(body.center?.lng);
  const radiusMeters = Number(body.radiusMeters);
  const threshold = Number(body.threshold);
  if (!name || name.length > 80) throw Object.assign(new Error('Pickup zone name is required and must be at most 80 characters.'), { status: 400 });
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw Object.assign(new Error('Choose the pickup zone center on the map.'), { status: 400 });
  }
  if (!Number.isInteger(radiusMeters) || radiusMeters < 20 || radiusMeters > 500) {
    throw Object.assign(new Error('Pickup radius must be a whole number from 20 to 500 metres.'), { status: 400 });
  }
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 50) {
    throw Object.assign(new Error('Demand threshold must be a whole number from 1 to 50 students.'), { status: 400 });
  }
  return { name, center: { lat, lng }, radiusMeters, threshold, active: true };
}

function validId(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message: 'Invalid database ID.' });
    return false;
  }
  return true;
}

router.get('/overview', async (_req, res, next) => {
  try {
    const [sessions, routes, drivers, demandZones] = await Promise.all([
      BuggySession.find().sort({ createdAt: -1 }),
      CampusRoute.find().sort({ name: 1 }),
      Driver.find().sort({ name: 1 }),
      getDemandSnapshot()
    ]);
    const activeDriverIds = new Set(sessions.filter((session) => session.active && session.driverId).map((session) => String(session.driverId)));
    res.json({
      buggies: sessions.map((session) => ({ ...toPublicBuggy(session), active: session.active, shiftEndedAt: session.shiftEndedAt || null })),
      routes: routes.map(serializeRoute),
      drivers: drivers.map((driver) => ({ id: String(driver._id), name: driver.name, active: activeDriverIds.has(String(driver._id)) })),
      demandZones
    });
  } catch (error) {
    next(error);
  }
});

router.post('/demand-zones', async (req, res, next) => {
  try {
    const zone = await DemandZone.create(demandZoneInput(req.body));
    const zones = await broadcastDemandSnapshot(req.app);
    res.status(201).json({ zone: zones.find((item) => item.id === String(zone._id)) || serializeDemandZone(zone) });
  } catch (error) {
    next(error);
  }
});

router.put('/demand-zones/:id', async (req, res, next) => {
  try {
    if (!validId(req, res)) return;
    const zone = await DemandZone.findByIdAndUpdate(req.params.id, demandZoneInput(req.body), { new: true, runValidators: true });
    if (!zone) return res.status(404).json({ message: 'Pickup zone not found.' });
    const zones = await broadcastDemandSnapshot(req.app);
    res.json({ zone: zones.find((item) => item.id === String(zone._id)) || serializeDemandZone(zone) });
  } catch (error) {
    next(error);
  }
});

router.delete('/demand-zones/:id', async (req, res, next) => {
  try {
    if (!validId(req, res)) return;
    const zone = await DemandZone.findByIdAndDelete(req.params.id);
    if (!zone) return res.status(404).json({ message: 'Pickup zone not found.' });
    await DemandNudge.deleteMany({ zoneId: zone._id });
    await broadcastDemandSnapshot(req.app);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/drivers', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const passcode = typeof req.body.passcode === 'string' ? req.body.passcode.trim() : '';
    if (!name || name.length > 60) return res.status(400).json({ message: 'Driver name is required and must be at most 60 characters.' });
    if (passcode.length < 4 || passcode.length > 32) return res.status(400).json({ message: 'Passcode must contain 4 to 32 characters.' });
    const credentials = await hashPasscode(passcode);
    const driver = await Driver.create({ name, normalizedName: name.toLocaleLowerCase(), ...credentials });
    res.status(201).json({ driver: { id: String(driver._id), name: driver.name, active: false } });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'A driver with that name already exists.' });
    next(error);
  }
});

router.delete('/drivers/:id', async (req, res, next) => {
  try {
    if (!validId(req, res)) return;
    if (await BuggySession.exists({ driverId: req.params.id, active: true })) {
      return res.status(409).json({ message: 'End this driver\'s active shift before deleting the account.' });
    }
    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) return res.status(404).json({ message: 'Driver not found.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.delete('/buggies/:id', async (req, res, next) => {
  try {
    if (!validId(req, res)) return;
    const session = await BuggySession.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ message: 'Buggy record not found.' });
    if (session.active) req.app.get('io').emit('buggy:ended', { id: String(session._id) });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/routes', async (req, res, next) => {
  try {
    const route = await CampusRoute.create(routeInput(req.body));
    const result = serializeRoute(route);
    req.app.get('io').emit('route:created', result);
    res.status(201).json({ route: result });
  } catch (error) {
    next(error);
  }
});

router.put('/routes/:id', async (req, res, next) => {
  try {
    if (!validId(req, res)) return;
    const route = await CampusRoute.findByIdAndUpdate(req.params.id, routeInput(req.body), { new: true, runValidators: true });
    if (!route) return res.status(404).json({ message: 'Route not found.' });
    const result = serializeRoute(route);
    req.app.get('io').emit('route:updated', result);
    res.json({ route: result });
  } catch (error) {
    next(error);
  }
});

router.delete('/routes/:id', async (req, res, next) => {
  try {
    if (!validId(req, res)) return;
    const route = await CampusRoute.findByIdAndDelete(req.params.id);
    if (!route) return res.status(404).json({ message: 'Route not found.' });
    req.app.get('io').emit('route:deleted', { id: String(route._id) });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
