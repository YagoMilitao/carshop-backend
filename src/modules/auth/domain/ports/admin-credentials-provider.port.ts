export interface AdminCredentials {
  email: string;
  password: string;
}

// Porta para obter credenciais administrativas de uma fonte externa (env, secret manager, etc.).
export interface AdminCredentialsProviderPort {
  getAdminCredentials(): AdminCredentials | null;
}
