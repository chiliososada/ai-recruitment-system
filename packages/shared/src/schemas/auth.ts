import { z } from 'zod';
import { LocaleSchema, UserRoleSchema } from '../enums.js';
import { boundedText } from './common.js';

/** Password policy: 8–128 chars, at least one letter and one digit (FR-01.1). */
export const passwordSchema = z
  .string()
  .min(8, { message: 'auth.password.tooShort' })
  .max(128, { message: 'auth.password.tooLong' })
  .regex(/[A-Za-z]/, { message: 'auth.password.needsLetter' })
  .regex(/[0-9]/, { message: 'auth.password.needsDigit' });

export const emailSchema = z.string().trim().toLowerCase().email({ message: 'auth.email.invalid' });

export const RegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: UserRoleSchema,
  displayName: boundedText(1, 80),
  locale: LocaleSchema.optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'auth.password.required' }),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const VerifyEmailSchema = z.object({
  token: z.string().min(10),
});
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

/** Authenticated principal returned by /auth/me and embedded in sessions. */
export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: UserRoleSchema,
  displayName: z.string(),
  locale: LocaleSchema,
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const SessionSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresAt: z.string(),
  user: AuthUserSchema,
  /** Present only in local runtime so the email-verification flow is testable. */
  devEmailVerificationToken: z.string().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export const UpdateAccountSchema = z
  .object({
    displayName: boundedText(1, 80).optional(),
    locale: LocaleSchema.optional(),
    password: passwordSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'common.noChanges' });
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
