/**
 * Jest Global Setup — configure test environment.
 */
import dotenv from 'dotenv';

dotenv.config();

// Silence pino logging during tests
process.env.NODE_ENV = 'test';

// Force DATABASE_URL to use the test database
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
