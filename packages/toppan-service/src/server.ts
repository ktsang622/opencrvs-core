import Hapi from '@hapi/hapi';
import { routes } from './config/routes';
import { HOST, PORT } from './environment';

export const createServer = async (): Promise<Hapi.Server> => {
  const server = Hapi.server({
    port: PORT,
    host: HOST,
    routes: {
      cors: {
        origin: ['*'],
        credentials: true
      }
    }
  });

  // Register routes
  server.route(routes);

  return server;
};

export const startServer = async (): Promise<void> => {
  const server = await createServer();
  
  await server.start();
  console.log(`🚀 Toppan service running on ${server.info.uri}`);
};