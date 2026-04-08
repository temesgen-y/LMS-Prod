import { z } from 'zod';
import { validatePasswordPolicy, PASSWORD_MIN_LENGTH } from '@/lib/security/password';

export const signupSchema = z
  .object({
    firstName:       z.string().min(1, 'First name is required').max(100),
    lastName:        z.string().min(1, 'Last name is required').max(100),
    email:           z.string().min(1, 'Email is required').email('Enter a valid email'),
    password:        z
      .string()
      .min(1, 'Password is required')
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
      .superRefine((password, ctx) => {
        // We don't have access to other fields here for identifier checks,
        // so the identifier check runs in the form's onSubmit (client) and
        // server-side in the API. Structural rules run here.
        const result = validatePasswordPolicy(password);
        if (!result.valid) {
          for (const err of result.errors) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
          }
        }
      }),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    program:         z.string().min(1, 'Program is required'),
    degreeLevel:     z.string().min(1, 'Degree level is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SignupFormData = z.infer<typeof signupSchema>;
