export const jsonResponse = (ref: string) =>
  ({
    content: {
      'application/json': {
        schema: { $ref: ref },
      },
    },
  }) as const;

export const jsonErrorResponse = jsonResponse(
  '#/components/schemas/ErrorResponse',
);

export const successResponse = (description: string, ref: string) =>
  ({
    description,
    ...jsonResponse(ref),
  }) as const;

export const errorResponse = (description: string) =>
  ({
    description,
    ...jsonErrorResponse,
  }) as const;

export const bearerSecurity = [{ bearerAuth: [] }] as const;

export const csrfHeaderParameter = {
  in: 'header',
  name: 'x-csrf-token',
  required: true,
  schema: { type: 'string' },
} as const;

export const refreshCsrfSecurity = [
  { refreshTokenCookie: [] },
  { csrfTokenCookie: [] },
] as const;
