import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import BuggySession from '../models/BuggySession.js';
import CampusRoute from '../models/CampusRoute.js';
import Driver from '../models/Driver.js';
import { driverAuth } from '../middleware/driverAuth.js';
import { verifyPasscode } from '../services/passcodes.js';
import { toPublicBuggy } from '../services/publicBuggy.js';
import { getDemandSnapshot } from '../services/demand.js';

const router = express.Router();

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

router.get('/options', async (_req, res, next) => {
  try {
    const drivers = await Driver.find().sort({ name: 1 });
    res.json({ drivers: drivers.map((driver) => ({ id: String(driver._id), name: driver.name })) });
  } catch (error) {
    next(error);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const buggyId = cleanText(req.body.buggyId).toUpperCase();
    const driverId = cleanText(req.body.driverId);
    const passcode = cleanText(req.body.passcode);
    if (!buggyId || !driverId || !passcode) {
      return res.status(400).json({ message: 'Buggy ID, driver, and passcode are required.' });
    }
    if (buggyId.length > 24 || !mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: 'Choose a valid buggy and driver.' });
    }

    const driver = await Driver.findById(driverId).select('+passcodeHash +passcodeSalt');
    if (!driver || !(await verifyPasscode(passcode, driver.passcodeSalt, driver.passcodeHash))) {
      return res.status(401).json({ message: 'Driver or passcode is incorrect.' });
    }

    const existing = await BuggySession.findOne({ active: true, $or: [{ buggyId }, { driverId: driver._id }] });
    if (existing) {
      return res.status(409).json({ message: 'That buggy or driver already has an active shift.' });
    }

    const session = await BuggySession.create({
      buggyId,
      driverId: driver._id,
      driverName: driver.name,
      sessionToken: crypto.randomBytes(32).toString('hex')
    });
    req.app.get('io').emit('buggy:started', toPublicBuggy(session));
    res.status(201).json({ token: session.sessionToken, buggy: toPublicBuggy(session) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'That buggy already has an active driver.' });
    }
    next(error);
  }
});

router.get('/me', driverAuth, (req, res) => {
  res.json({ buggy: toPublicBuggy(req.driverSession) });
});

router.get('/demand-alerts', driverAuth, async (req, res, next) => {
  try {
    const sessionId = String(req.driverSession._id);
    const zones = await getDemandSnapshot();
    res.json({ alerts: zones.filter((zone) => zone.thresholdReached && zone.assignedBuggyId === sessionId) });
  } catch (error) {
    next(error);
  }
});

router.put('/occupancy', driverAuth, async (req, res, next) => {
  try {
    const passengerCount = Number(req.body.passengerCount);
    if (!Number.isInteger(passengerCount) || passengerCount < 0 || passengerCount > 10) {
      return res.status(400).json({ message: 'Passenger count must be a whole number from 0 to 10.' });
    }
    const session = req.driverSession;
    session.passengerCount = passengerCount;
    await session.save();
    const publicBuggy = toPublicBuggy(session);
    req.app.get('io').emit('buggy:updated', publicBuggy);
    res.json({ buggy: publicBuggy });
  } catch (error) {
    next(error);
  }
});

router.put('/location', driverAuth, async (req, res, next) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const accuracy = req.body.accuracy == null ? undefined : Number(req.body.accuracy);
    const source = req.body.source;
    const requestedRouteId = req.body.routeId;
    const direction = req.body.direction;

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ message: 'Valid latitude and longitude are required.' });
    }
    if (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0)) {
      return res.status(400).json({ message: 'Accuracy must be a positive number.' });
    }
    if (!['gps', 'simulation'].includes(source)) {
      return res.status(400).json({ message: 'Location source must be gps or simulation.' });
    }
    if (!['forward', 'reverse'].includes(direction)) {
      return res.status(400).json({ message: 'Choose a valid travel direction.' });
    }
    if (!requestedRouteId || !mongoose.isValidObjectId(requestedRouteId)) {
      return res.status(400).json({ message: 'Choose a valid assigned route.' });
    }

    const session = req.driverSession;
    const currentRouteId = session.routeId ? String(session.routeId) : null;
    if (requestedRouteId !== currentRouteId && !(await CampusRoute.exists({ _id: requestedRouteId }))) {
      return res.status(400).json({ message: 'Assigned route no longer exists.' });
    }
    session.location = { lat, lng, accuracy, source };
    session.routeId = requestedRouteId;
    session.direction = direction;
    session.lastSeen = new Date();
    await session.save();

    const publicBuggy = toPublicBuggy(session);
    req.app.get('io').emit('buggy:updated', publicBuggy);
    res.json({ buggy: publicBuggy });
  } catch (error) {
    next(error);
  }
});

router.delete('/session', driverAuth, async (req, res, next) => {
  try {
    const session = req.driverSession;
    session.active = false;
    session.shiftEndedAt = new Date();
    await session.save();
    req.app.get('io').emit('buggy:ended', { id: String(session._id) });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
