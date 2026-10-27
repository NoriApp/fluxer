import { z } from 'zod';

const schema = z.object({
  TOKEN: z.string().min(1),
  CLIENT_SECRET: z.string().min(1),
  OBISIDIAN_HOST: z.string().min(1),
  OBISIDIAN_PORT: z.coerce.number().int().min(1).max(65535),
  OBISIDIAN_PASSWORD: z.string().min(1),
  OBISIDIAN_SECURE: z.string().min(1),
  MONGODB_URI: z.string().min(1),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error(
    result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n'),
  );
  process.exit(1);
}

export const env = result.data;
