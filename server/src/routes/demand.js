import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import DemandNudge from '../models/DemandNudge.js';
import DemandZone from '../models/DemandZone.js';
import { broadcastDemandSnapshot, distanceMeters, getDemandSnapshot, NUDGE_LIFETIME_MINUTES } from '../services/demand.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json({ zones: await getDemandSnapshot() });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/nudge', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid pickup zone.' });
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const deviceId = typeof req.body.deviceId === 'string' ? req.body.deviceId.trim() : '';
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ message: 'A valid current location is required.' });
    }
    if (deviceId.length < 16 || deviceId.length > 128 || !/^[a-zA-Z0-9-]+$/.test(deviceId)) {
      return res.status(400).json({ message: 'Invalid browser identifier.' });
    }
    const zone = await DemandZone.findOne({ _id: req.params.id, active: true });
    if (!zone) return res.status(404).json({ message: 'Pickup zone not found.' });
    const distance = distanceMeters({ lat, lng }, zone.center);
    if (distance > zone.radiusMeters) {
      return res.status(403).json({ message: `You must be inside ${zone.name} to request pickup.` });
    }

    const deviceHash = crypto.createHash('sha256').update(deviceId).digest('hex');
    const expiresAt = new Date(Date.now() + NUDGE_LIFETIME_MINUTES * 60 * 1000);
    await DemandNudge.findOneAndUpdate(
      { zoneId: zone._id, deviceHash },
      { $set: { expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const zones = await broadcastDemandSnapshot(req.app);
    res.json({
      message: `Pickup request counted at ${zone.name} for ${NUDGE_LIFETIME_MINUTES} minutes.`,
      zone: zones.find((item) => item.id === String(zone._id))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
