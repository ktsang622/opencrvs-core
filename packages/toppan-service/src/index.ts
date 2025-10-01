import { startServer } from './server';

const start = async (): Promise<void> => {
  try {
    console.log('🔧 Environment variables:');
    console.log('OSHOST:', process.env.OSHOST);
    console.log('OPENSEARCH_HOST:', process.env.OPENSEARCH_HOST);
    console.log('PORT:', process.env.PORT);
    console.log('TOPPAN_DB_HOST:', process.env.TOPPAN_DB_HOST);
    console.log('TOPPAN_DB_PORT:', process.env.TOPPAN_DB_PORT);

    await startServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

start();