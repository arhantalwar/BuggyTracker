import mongoose from 'mongoose';

const demandNudgeSchema = new mongoose.Schema(
  {
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'DemandZone', required: true, index: true },
    deviceHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
  },
  { timestamps: true }
);

demandNudgeSchema.index({ zoneId: 1, deviceHash: 1 }, { unique: true });

export default mongoose.model('DemandNudge', demandNudgeSchema);
