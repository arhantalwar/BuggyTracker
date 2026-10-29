import mongoose from 'mongoose';

const demandZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    center: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 }
    },
    radiusMeters: { type: Number, required: true, min: 20, max: 500 },
    threshold: { type: Number, required: true, min: 1, max: 50 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model('DemandZone', demandZoneSchema);
