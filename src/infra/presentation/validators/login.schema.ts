import { z } from 'zod';

// RFC 5321: local-part max 64 chars, domain max 255 chars
// Limited quantifiers prevent ReDoS attacks via backtracking
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]+$/;

/**
 * Schema de login.
 *
 * Motivo:
 * validar dados de entrada antes de chegar na regra de negócio de
 * autenticação, reutilizando a mesma regex de email já usada no projeto
 * (evita duplicar/divergir lógica sensível à segurança).
 */
export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'Email inválido.')
      .regex(EMAIL_REGEX, 'Email inválido.'),
    password: z
      .string()
      .refine((value) => value.trim().length > 0, 'Senha obrigatória.'),
  })
  .strict();

/**
 * Tipo inferido automaticamente a partir do schema.
 *
 * Motivo:
 * evita duplicar tipagem manual.
 */
export type LoginInput = z.infer<typeof loginSchema>;
