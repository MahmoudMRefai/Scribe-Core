/**
 * Database Seed Script — creates the initial admin user.
 *
 * Run with: npm run db:seed  (or automatically via `prisma db seed`)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@scribe.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@Scribe2026';

  console.log('🌱 Seeding database...');

  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`✅ Admin user already exists: ${adminEmail}`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      name: 'Scribe Admin',
      role: 'ADMIN',
      phone: '+20-100-000-0000',
    },
  });

  // Create system accounts owned by admin
  await prisma.account.createMany({
    data: [
      {
        ownerId: admin.id,
        ownerType: 'SYSTEM',
        type: 'REVENUE',
        name: 'System Revenue',
      },
      {
        ownerId: admin.id,
        ownerType: 'SYSTEM',
        type: 'ASSET',
        name: 'System Cash',
      },
    ],
  });

  console.log(`✅ Admin user created: ${adminEmail}`);
  console.log(`✅ System accounts created (Revenue + Cash)`);
  console.log('🌱 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
