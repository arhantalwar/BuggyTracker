import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    normalizedName: { type: String, required: true, unique: true, index: true, select: false },
    passcodeHash: { type: String, required: true, select: false },
    passcodeSalt: { type: String, required: true, select: false }
  },
  { timestamps: true }
);

export default mongoose.model('Driver', driverSchema);
