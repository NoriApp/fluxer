import mongoose, { type InferSchemaType } from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    language: { type: String, default: null },
    blacklist: {
      active: { type: Boolean, default: false, index: true },
      reason: { type: String, default: null },
      authorId: { type: String, default: null },
      category: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);

export default User;
