import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  expect,
  describe,
  it,
  beforeAll,
  beforeEach,
  afterAll,
} from '@jest/globals';
import { PortfolioWorkModel } from '../../../../src/data/models/portfolio-work';

describe('PortfolioWorkModel', () => {
  let mongoServer: MongoMemoryServer;

  /**
   * Antes de todos os testes:
   * sobe um MongoDB em memória e conecta o Mongoose nele.
   *
   * Motivo:
   * isolar os testes do banco real
   * e evitar mexer no Atlas durante o desenvolvimento.
   */
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri);
  });

  /**
   * Antes de cada teste:
   * limpa a collection para um teste não afetar o outro.
   */
  beforeEach(async () => {
    await PortfolioWorkModel.deleteMany({});
  });

  /**
   * Depois de todos os testes:
   * desconecta do banco em memória e encerra o servidor.
   */
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('deve criar um trabalho válido', async () => {
    const created = await PortfolioWorkModel.create({
      id: randomUUID(),
      slug: `reforma-banco-couro-civic-${Date.now()}`,
      title: 'Reforma de banco em couro do Civic',
      description: 'Troca completa do revestimento dos bancos.',
      category: 'bancos',
      tags: ['couro', 'honda', 'civic'],
      images: [
        {
          url: 'https://exemplo.com/capa.jpg',
          alt: 'Banco reformado',
          isCover: true,
        },
      ],
      metadata: {
        vehicleBrand: 'Honda',
        vehicleModel: 'Civic',
      },
      status: 'published',
    });

    expect(created).toBeDefined();
    expect(created.title).toBe('Reforma de banco em couro do Civic');
    expect(created.category).toBe('bancos');
    expect(created.status).toBe('published');
    expect(created.images).toHaveLength(1);
  });

  it('deve normalizar tags para minúsculo e sem espaços', async () => {
    const created = await PortfolioWorkModel.create({
      id: randomUUID(),
      slug: `tags-normalizadas-${Date.now()}`,
      title: 'Teste de tags',
      description: 'Descrição do teste',
      category: 'bancos',
      tags: [' Couro ', 'HONDA', ' civic '],
      images: [],
      metadata: {},
      status: 'draft',
    });

    expect(created.tags).toEqual(['couro', 'honda', 'civic']);
  });

  it('deve rejeitar mais de uma imagem de capa', async () => {
    await expect(
      PortfolioWorkModel.create({
        id: randomUUID(),
        slug: `duas-capas-${Date.now()}`,
        title: 'Teste duas capas',
        description: 'Descrição do teste',
        category: 'bancos',
        tags: ['teste'],
        images: [
          {
            url: 'https://exemplo.com/1.jpg',
            alt: 'Imagem 1',
            isCover: true,
          },
          {
            url: 'https://exemplo.com/2.jpg',
            alt: 'Imagem 2',
            isCover: true,
          },
        ],
        metadata: {},
        status: 'draft',
      }),
    ).rejects.toThrow('O trabalho pode ter no máximo uma imagem de capa.');
  });

  it('deve rejeitar status inválido', async () => {
    await expect(
      PortfolioWorkModel.create({
        id: randomUUID(),
        slug: `status-invalido-${Date.now()}`,
        title: 'Teste status inválido',
        description: 'Descrição do teste',
        category: 'bancos',
        tags: ['teste'],
        images: [],
        metadata: {},
        status: 'ativo',
      }),
    ).rejects.toThrow();
  });

  it('deve exigir campos obrigatórios', async () => {
    await expect(
      PortfolioWorkModel.create({
        id: randomUUID(),
        slug: `sem-titulo-${Date.now()}`,
        description: 'Descrição sem título',
        category: 'bancos',
        tags: ['teste'],
        images: [],
        metadata: {},
        status: 'draft',
      }),
    ).rejects.toThrow();
  });

  it('deve impedir slug duplicado', async () => {
    const duplicatedSlug = `slug-duplicado-${Date.now()}`;

    await PortfolioWorkModel.create({
      id: randomUUID(),
      slug: duplicatedSlug,
      title: 'Primeiro trabalho',
      description: 'Primeira descrição',
      category: 'bancos',
      tags: ['teste'],
      images: [],
      metadata: {},
      status: 'draft',
    });

    await expect(
      PortfolioWorkModel.create({
        id: randomUUID(),
        slug: duplicatedSlug,
        title: 'Segundo trabalho',
        description: 'Segunda descrição',
        category: 'bancos',
        tags: ['teste'],
        images: [],
        metadata: {},
        status: 'draft',
      }),
    ).rejects.toThrow();
  });
});
