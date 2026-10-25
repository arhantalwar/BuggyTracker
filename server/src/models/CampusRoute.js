import mongoose from 'mongoose';

const waypointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 }
  },
  { _id: false }
);

const campusRouteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    startLabel: { type: String, required: true, trim: true, maxlength: 60, default: 'Route start' },
    endLabel: { type: String, required: true, trim: true, maxlength: 60, default: 'Route end' },
    color: { type: String, required: true, default: '#27c278', match: /^#[0-9a-f]{6}$/i },
    waypoints: {
      type: [waypointSchema],
      required: true,
      validate: {
        validator: (points) => points.length >= 2 && points.length <= 200,
        message: 'A route needs between 2 and 200 points.'
      }
    }
  },
  { timestamps: true }
);

export default mongoose.model('CampusRoute', campusRouteSchema);
