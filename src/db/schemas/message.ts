import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    _id: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 },
  },
  { versionKey: false },
);

export const MessageClaim = model('MessageClaim', schema);
