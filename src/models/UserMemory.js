import mongoose from 'mongoose';

const UserMemorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['profile','preference','project','fact','task','contact','custom'], default: 'fact' },
  content: { type: String, required: true },
  embedding: { type: [Number], required: true, index: '2dsphere' }, // swap to pgvector if Postgres
  salience: { type: Number, default: 0.5, min: 0, max: 1 },
  decayAt: { type: Date },
  source: { type: mongoose.Schema.Types.Mixed }, // { convId, msgIds[], origin }
  tags: [String]
}, { timestamps: true });

UserMemorySchema.index({ user: 1, salience: -1 });
UserMemorySchema.index({ user: 1, kind: 1 });
UserMemorySchema.index({ decayAt: 1 }); // For cleanup jobs

export default mongoose.model('UserMemory', UserMemorySchema);