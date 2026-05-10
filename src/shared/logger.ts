import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } } // stdout, pretty via pino-pretty if installed
      : undefined,
});
