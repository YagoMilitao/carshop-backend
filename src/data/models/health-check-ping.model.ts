import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Modelo mínimo e isolado usado exclusivamente pelo script
 * `verify-read-write.ts` para confirmar, de forma segura e
 * não destrutiva, que operações básicas de escrita e leitura funcionam
 * contra o banco configurado (FR-006/AC-005).
 *
 * Motivo:
 * manter um schema "passthrough" puro, sem hooks, validadores
 * customizados ou índices declarados, para que a coleção
 * `health_check_pings` nunca produza efeitos colaterais além do próprio
 * ciclo de criação/leitura/remoção executado pelo script.
 */
const healthCheckPingSchema = new Schema(
  {
    marker: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'health_check_pings',
  },
);

export type HealthCheckPingDocument = InferSchemaType<
  typeof healthCheckPingSchema
>;

export const HealthCheckPingModel = model(
  'HealthCheckPing',
  healthCheckPingSchema,
);
