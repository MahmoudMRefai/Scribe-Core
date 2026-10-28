import request from 'supertest';
import { Role } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { generateTestToken } from '../helpers';

const SKIP = !process.env.DATABASE_URL_TEST;

(SKIP ? describe.skip : describe)('Payouts & Withdrawals Workflow', () => {
  const adminId = '10000000-0000-4000-8000-000000000099';
  const courierUserId = '20000000-0000-4000-8000-000000000099';
  const courierProfileId = '21000000-0000-4000-8000-000000000099';

  const adminToken = generateTestToken(adminId, 'ADMIN');
  const courierToken = generateTestToken(courierUserId, 'COURIER');

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Payout", "WalletTransaction", "CourierWallet", "Settlement", "JournalLine", "JournalEntry", "AuditLog", "Parcel", "LedgerAccount", "Courier", "Merchant", "User" CASCADE;',
    );

    await prisma.user.create({
      data: { id: adminId, email: 'admin-payout@scribe.local', passwordHash: 'hash', name: 'Admin', role: Role.ADMIN },
    });

    await prisma.user.create({
      data: { id: courierUserId, email: 'courier-payout@scribe.local', passwordHash: 'hash', name: 'Courier Payout', role: Role.COURIER },
    });

    await prisma.courier.create({
      data: { id: courierProfileId, userId: courierUserId },
    });

    await prisma.courierWallet.create({
      data: {
        courierId: courierProfileId,
        currentBalance: 500.00,
        cashInHandBalance: 0.00,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should complete full payout flow: request -> disburse -> confirm', async () => {
    // 1. Courier requests payout of 200 EGP
    const reqRes = await request(app)
      .post('/api/payouts')
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ amount: 200.00, notes: 'Vodafone Cash 01012345678' });

    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.status).toBe('PENDING');
    const payoutId = reqRes.body.data.id;

    // 2. Admin disburses the payout
    const disburseRes = await request(app)
      .patch(`/api/payouts/${payoutId}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Transfer sent ref #VF98765' });

    expect(disburseRes.status).toBe(200);
    expect(disburseRes.body.data.status).toBe('DISBURSED');

    // 3. Courier confirms receipt of funds
    const confirmRes = await request(app)
      .patch(`/api/payouts/${payoutId}/confirm`)
      .set('Authorization', `Bearer ${courierToken}`);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('CONFIRMED');

    // 4. Verify wallet balance was updated (500 - 200 = 300)
    const wallet = await prisma.courierWallet.findUnique({
      where: { courierId: courierProfileId },
    });
    expect(Number(wallet!.currentBalance)).toBe(300.00);
  });

  it('should allow admin to send direct payout without request and courier to reject or confirm', async () => {
    // 1. Admin sends 100 EGP directly to courier
    const sendRes = await request(app)
      .post('/api/payouts/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        recipientId: courierUserId,
        amount: 100.00,
        notes: 'Cash handed at hub',
      });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.data.status).toBe('DISBURSED');
    const directPayoutId = sendRes.body.data.id;

    // 2. Courier rejects the payout (e.g., did not receive it)
    const rejectRes = await request(app)
      .patch(`/api/payouts/${directPayoutId}/reject`)
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ reason: 'Did not receive cash' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');

    // Wallet balance remains untouched at 300
    const walletAfterReject = await prisma.courierWallet.findUnique({
      where: { courierId: courierProfileId },
    });
    expect(Number(walletAfterReject!.currentBalance)).toBe(300.00);

    // 3. Admin sends full remaining 300 EGP directly and courier confirms
    const sendFullRes = await request(app)
      .post('/api/payouts/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        recipientId: courierUserId,
        amount: 300.00,
        notes: 'Full balance settlement',
      });

    expect(sendFullRes.status).toBe(201);
    const fullPayoutId = sendFullRes.body.data.id;

    const confirmFullRes = await request(app)
      .patch(`/api/payouts/${fullPayoutId}/confirm`)
      .set('Authorization', `Bearer ${courierToken}`);

    expect(confirmFullRes.status).toBe(200);
    expect(confirmFullRes.body.data.status).toBe('CONFIRMED');

    const walletAfterFull = await prisma.courierWallet.findUnique({
      where: { courierId: courierProfileId },
    });
    expect(Number(walletAfterFull!.currentBalance)).toBe(0.00);
  });
});

