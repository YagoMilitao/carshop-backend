/**
 * Porta para verificação de conectividade com o banco de dados.
 *
 * Motivo:
 * permitir que o caso de uso de health-check dependa apenas de um
 * contrato do domínio, sem conhecer detalhes de Mongoose/infraestrutura.
 */
export interface DatabaseHealthCheckPort {
  isConnected(): boolean;
}
