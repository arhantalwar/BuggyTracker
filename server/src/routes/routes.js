import express from 'express';
import CampusRoute from '../models/CampusRoute.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const routes = await CampusRoute.find().sort({ name: 1 }).lean();
    res.json({
      routes: routes.map((route) => ({
        id: String(route._id),
        name: route.name,
        startLabel: route.startLabel || 'Route start',
        endLabel: route.endLabel || 'Route end',
        color: route.color,
        waypoints: route.waypoints
      }))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
