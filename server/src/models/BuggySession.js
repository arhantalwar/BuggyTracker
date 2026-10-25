import mongoose from 'mongoose';

const buggySessionSchema = new mongoose.Schema(
  {
    buggyId: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
    driverName: { type: String, required: true, trim: true, maxlength: 60 },
    sessionToken: { type: String, required: true, unique: true, index: true },
    active: { type: Boolean, default: true, index: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusRoute', default: null, index: true },
    direction: { type: String, enum: ['forward', 'reverse', 'unknown'], default: 'unknown' },
    passengerCount: { type: Number, min: 0, max: 10, default: 0 },
    location: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
      accuracy: { type: Number, min: 0 },
      source: { type: String, enum: ['gps', 'simulation'] }
    },
    lastSeen: { type: Date },
    shiftStartedAt: { type: Date, default: Date.now },
    shiftEndedAt: { type: Date }
  },
  { timestamps: true }
);

buggySessionSchema.index(
  { buggyId: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);

buggySessionSchema.index(
  { driverId: 1 },
  { unique: true, partialFilterExpression: { active: true, driverId: { $gt: null } } }
);

export default mongoose.model('BuggySession', buggySessionSchema);
