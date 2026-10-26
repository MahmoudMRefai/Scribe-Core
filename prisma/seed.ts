/**
 * Database Seed Script — creates the initial admin user, system ledger accounts,
 * and (outside production) a demo courier + merchant matching the Postman collection.
 *
 * Run with: npm run db:seed  (or automatically via `prisma db seed`)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { normalizePhone } from '../src/shared/phone.util.js';

dotenv.config();

const prisma = new PrismaClient();

interface DemoUser {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: 'COURIER' | 'MERCHANT';
  businessName?: string;
  businessAddress?: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    email: 'courier1@scribe.local',
    password: 'Courier@2026',
    name: 'Mohamed Ali',
    phone: '+20-100-111-2222',
    role: 'COURIER',
  },
  {
    email: 'merchant1@scribe.local',
    password: 'Merchant@2026',
    name: 'Fatma Ibrahim',
    phone: '+20-100-333-4444',
    role: 'MERCHANT',
    businessName: 'Armant Electronics',
    businessAddress: '12 Sharia al-Corniche, Armant',
  },
];

async function seedDemoUser(demo: DemoUser) {
  const existing = await prisma.user.findUnique({ where: { email: demo.email } });
  if (existing) {
    console.log(`✅ Demo ${demo.role.toLowerCase()} already exists: ${demo.email}`);
    return;
  }

  const phone = normalizePhone(demo.phone);
  const passwordHash = await bcrypt.hash(demo.password, 12);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: demo.email, passwordHash, name: demo.name, phone, role: demo.role },
    });

    if (demo.role === 'MERCHANT') {
      await tx.merchant.create({
        data: {
          userId: user.id,
          businessName: demo.businessName ?? demo.name,
          address: demo.businessAddress,
          phone,
        },
      });
    } else {
      await tx.courier.create({ data: { userId: user.id, phone } });
    }

    await tx.ledgerAccount.create({
      data: {
        ownerId: user.id,
        ownerType: demo.role,
        type: 'ASSET',
        name: `${demo.role} Wallet — ${demo.name}`,
      },
    });
  });

  console.log(`✅ Demo ${demo.role.toLowerCase()} created: ${demo.email} / ${demo.password}`);
}

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
        phone: normalizePhone('+20-100-000-0000'),
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

  if (process.env.NODE_ENV !== 'production') {
    for (const demo of DEMO_USERS) {
      await seedDemoUser(demo);
    }
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
