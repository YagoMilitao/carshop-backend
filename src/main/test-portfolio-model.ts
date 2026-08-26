import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../infra/config/env';
import { PortfolioWorkModel } from '../data/models/portfolio-work';
import {
  connectDatabase,
  disconnectDatabase,
} from '../infra/database/mongoose';

async function run(): Promise<void> {
  try {
    await connectDatabase(env.mongoUri);

    console.log('Database conectado:', mongoose.connection.name);
    console.log('Host conectado:', mongoose.connection.host);
    console.log('Collection do model:', PortfolioWorkModel.collection.name);

    const uniqueSlug = `reforma-banco-couro-civic-${Date.now()}`;

    const createdWork = await PortfolioWorkModel.create({
      id: randomUUID(),
      slug: uniqueSlug,
      title: 'Reforma de banco em couro do Civic',
      description:
        'Troca completa do revestimento dos bancos com acabamento premium.',
      category: 'bancos',
      tags: ['Couro', 'Honda', 'Civic'],
      images: [
        {
          url: 'https://exemplo.com/imagem-capa.jpg',
          alt: 'Banco em couro reformado do Honda Civic',
          isCover: true,
        },
      ],
      metadata: {
        vehicleBrand: 'Honda',
        vehicleModel: 'Civic',
      },
      status: 'published',
    });

    console.log('Criado com _id:', createdWork._id);
    console.log('Criado com slug:', createdWork.slug);

    const total = await PortfolioWorkModel.countDocuments();
    console.log('Total de documentos na collection:', total);

    const foundWork = await PortfolioWorkModel.findOne({
      slug: uniqueSlug,
    }).lean();

    console.log('Encontrado no banco?', Boolean(foundWork));
    console.log(foundWork);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Erro ao testar model:', error.message);
    } else {
      console.error('Erro desconhecido ao testar model.');
    }
  } finally {
    await disconnectDatabase();
  }
}

void run();
