import { z } from 'zod';

const boolFlag = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    return val.trim().toLowerCase() === 'true';
  });

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_API_BASE_URL: optionalNonEmpty,
  DATABASE_URL: z
    .string()
    .default('mysql://mococall_user:mococall_dev_password@localhost:3306/mococall'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16)
    .default('dev_mococall_access_secret_key_change_in_prod'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default('dev_mococall_refresh_secret_key_change_in_prod'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  TELEPHONY_ENABLED: boolFlag.default(false),
  TELEPHONY_MODE: z.enum(['mock', 'live']).default('mock'),
  TELEPHONY_COMPLIANCE_VERIFIED: boolFlag.default(false),
  TELEPHONY_WEBHOOK_SECRET: z
    .string()
    .min(8)
    .default('dev_telephony_webhook_secret'),
  TWILIO_ACCOUNT_SID: optionalNonEmpty,
  TWILIO_AUTH_TOKEN: optionalNonEmpty,
  TWILIO_CALLER_ID: optionalNonEmpty,
  TWILIO_API_KEY_SID: optionalNonEmpty,
  TWILIO_API_KEY_SECRET: optionalNonEmpty,
  TWILIO_TWIML_APP_SID: optionalNonEmpty,
  TWILIO_DEFAULT_MESSAGE: z
    .string()
    .default('Hello from MocoCall. Your authorized live test call is now connected.'),
  DEFAULT_MAX_CALL_DURATION_SECONDS: z.coerce.number().int().positive().default(1800),
  DEFAULT_DAILY_CALL_LIMIT: z.coerce.number().int().positive().default(50),
  DEFAULT_MONTHLY_CALL_QUOTA: z.coerce.number().int().positive().default(500),
  VELOCITY_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  VELOCITY_MAX_CALLS: z.coerce.number().int().positive().default(5),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return envSchema.parse(source);
}
