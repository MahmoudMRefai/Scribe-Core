/**
 * Server entry point — starts the HTTP server.
 * Separated from app.ts to allow Supertest to import the app without binding a port.
 */
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Scribe Smart Hub running on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`   Health check: http://localhost:${env.PORT}/health`);
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
