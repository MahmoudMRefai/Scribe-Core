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

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  let admin;
  if (existing) {
    console.log(`✅ Admin user already exists: ${adminEmail}`);
    admin = existing;
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'Scribe Admin',
        role: 'ADMIN',
        phone: '+20-100-000-0000',
      },
    });
    console.log(`✅ Admin user created: ${adminEmail}`);
  }

  // Create system accounts owned by admin
  const existingAccounts = await prisma.ledgerAccount.findMany({
    where: { ownerId: admin.id, ownerType: 'SYSTEM' }
  });

  if (existingAccounts.length === 0) {
    await prisma.ledgerAccount.createMany({
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
    console.log(`✅ System accounts created (Revenue + Cash)`);
  } else {
    console.log(`✅ System accounts already exist`);
  }

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
