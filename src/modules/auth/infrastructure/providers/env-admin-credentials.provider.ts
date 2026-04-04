import type {
  AdminCredentials,
  AdminCredentialsProviderPort,
} from '../../domain/ports/admin-credentials-provider.port';

// Adapter que lê credenciais administrativas do ambiente da aplicação.
export class EnvAdminCredentialsProvider implements AdminCredentialsProviderPort {
  getAdminCredentials(): AdminCredentials | null {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) return null;

    return { email, password };
  }
}
