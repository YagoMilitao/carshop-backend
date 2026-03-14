import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService:
 * - centraliza o PrismaClient para usar DI (injeção de dependência) do Nest
 * - conecta ao banco quando o módulo inicia
 * - desconecta quando a aplicação encerra
 *
 * Por que estender PrismaClient?
 * - permite usar `this.prisma.<model>` diretamente onde injetar PrismaService
 * - evita instanciar PrismaClient em vários lugares
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
