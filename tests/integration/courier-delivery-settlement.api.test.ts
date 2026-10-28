import request from 'supertest';
import Decimal from 'decimal.js';
import { Role, ParcelStatus, ServiceTier, AccountOwnerType, AccountType, WalletTransactionType } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { generateTestToken } from '../helpers';
import { LedgerService } from '../../src/modules/ledger/ledger.service';

const SKIP = !process.env.DATABASE_URL_TEST;

(SKIP ? describe.skip : describe)('Courier Delivery Completion & Commission Settlement Engine', () => {
  const adminUserId = '10000000-0000-4000-8000-000000000010';
  const courierUserId = '20000000-0000-4000-8000-000000000020';
  const merchantUserId = '30000000-0000-4000-8000-000000000030';
  const merchantProfileId = '31000000-0000-4000-8000-000000000031';
  const courierProfileId = '21000000-0000-4000-8000-000000000021';

  const adminToken = generateTestToken(adminUserId, 'ADMIN');
  const courierToken = generateTestToken(courierUserId, 'COURIER');
  const merchantToken = generateTestToken(merchantUserId, 'MERCHANT');

  beforeAll(async () => {
    // 0. Clean up leftovers from previous runs using TRUNCATE CASCADE (bypasses row delete trigger)
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "WalletTransaction", "CourierWallet", "Settlement", "JournalLine", "JournalEntry", "AuditLog", "Parcel", "LedgerAccount", "Courier", "Merchant", "User" CASCADE;',
    );

    // 1. Create Admin User
    await prisma.user.upsert({
      where: { id: adminUserId },
      update: {},
      create: {
        id: adminUserId,
        email: 'admin-engine@scribe.local',
        passwordHash: 'hash',
        name: 'Admin Engine',
        role: Role.ADMIN,
        isActive: true,
      },
    });

    // 2. Create Merchant User & Merchant Profile
    await prisma.user.upsert({
      where: { id: merchantUserId },
      update: {},
      create: {
        id: merchantUserId,
        email: 'merchant-engine@scribe.local',
        passwordHash: 'hash',
        name: 'Merchant Engine',
        role: Role.MERCHANT,
        isActive: true,
      },
    });

    await prisma.merchant.upsert({
      where: { id: merchantProfileId },
      update: {},
      create: {
        id: merchantProfileId,
        userId: merchantUserId,
        businessName: 'Engine Store',
        flatDeliveryFee: 25.00,
        isActive: true,
      },
    });

    // 3. Create Courier User & Courier Profile
    await prisma.user.upsert({
      where: { id: courierUserId },
      update: {},
      create: {
        id: courierUserId,
        email: 'courier-engine@scribe.local',
        passwordHash: 'hash',
        name: 'Courier Engine',
        role: Role.COURIER,
        isActive: true,
      },
    });

    await prisma.courier.upsert({
      where: { id: courierProfileId },
      update: {},
      create: {
        id: courierProfileId,
        userId: courierUserId,
        phone: '+201011112222',
        isActive: true,
      },
    });

    // 4. Create initial ledger accounts
    await prisma.ledgerAccount.upsert({
      where: {
        ownerId_ownerType_type: {
          ownerId: courierUserId,
          ownerType: AccountOwnerType.COURIER,
          type: AccountType.ASSET,
        },
      },
      update: {},
      create: {
        ownerId: courierUserId,
        ownerType: AccountOwnerType.COURIER,
        type: AccountType.ASSET,
        name: 'COURIER Wallet — Courier Engine',
        balance: 0,
      },
    });

    await prisma.ledgerAccount.upsert({
      where: {
        ownerId_ownerType_type: {
          ownerId: merchantUserId,
          ownerType: AccountOwnerType.MERCHANT,
          type: AccountType.ASSET,
        },
      },
      update: {},
      create: {
        ownerId: merchantUserId,
        ownerType: AccountOwnerType.MERCHANT,
        type: AccountType.ASSET,
        name: 'MERCHANT Wallet — Engine Store',
        balance: 0,
      },
    });

    await prisma.ledgerAccount.upsert({
      where: {
        ownerId_ownerType_type: {
          ownerId: adminUserId,
          ownerType: AccountOwnerType.SYSTEM,
          type: AccountType.REVENUE,
        },
      },
      update: {},
      create: {
        ownerId: adminUserId,
        ownerType: AccountOwnerType.SYSTEM,
        type: AccountType.REVENUE,
        name: 'System Revenue',
        balance: 0,
      },
    });
  });

  describe('1. Delivery Settlement & Commission Engine Happy Path', () => {
    let parcelId: string;

    it('should create a parcel with serviceTier: LOCAL and lock commission at assignment', async () => {
      // Create parcel as Admin/Merchant
      const createRes = await request(app)
        .post('/api/parcels')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          merchantId: merchantProfileId,
          codAmount: 200,
          serviceTier: 'LOCAL',
          recipientName: 'Recipient 1',
          recipientPhone: '+20-100-111-2222',
          recipientAddress: 'Armant Sharq, Luxor',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      parcelId = createRes.body.data.id;
      expect(createRes.body.data.serviceTier).toBe('LOCAL');
      expect(createRes.body.data.status).toBe('PENDING');

      // Assign courier
      const assignRes = await request(app)
        .patch(`/api/parcels/${parcelId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ courierId: courierUserId });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.status).toBe('PICKED_UP');
      expect(assignRes.body.data.courierId).toBe(courierUserId);
      // Local commission is 15 EGP
      expect(Number(assignRes.body.data.courierCommission)).toBe(15);
    });

    it('should transition parcel through AT_HUB -> OUT_FOR_DELIVERY', async () => {
      // Admin / Courier moves to AT_HUB
      const atHubRes = await request(app)
        .patch(`/api/parcels/${parcelId}/status`)
        .set('Authorization', `Bearer ${courierToken}`)
        .send({ status: 'AT_HUB' });
      expect(atHubRes.status).toBe(200);
      expect(atHubRes.body.data.status).toBe('AT_HUB');

      // Move to OUT_FOR_DELIVERY
      const outRes = await request(app)
        .patch(`/api/parcels/${parcelId}/status`)
        .set('Authorization', `Bearer ${courierToken}`)
        .send({ status: 'OUT_FOR_DELIVERY' });
      expect(outRes.status).toBe(200);
      expect(outRes.body.data.status).toBe('OUT_FOR_DELIVERY');
    });

    it('should atomically mark parcel DELIVERED, credit commission, and record COD cash in hand', async () => {
      const deliveredRes = await request(app)
        .patch(`/api/parcels/${parcelId}/status`)
        .set('Authorization', `Bearer ${courierToken}`)
        .send({
          status: 'DELIVERED',
          deliveryNote: 'Delivered to recipient safely',
        });

      expect(deliveredRes.status).toBe(200);
      expect(deliveredRes.body.data.status).toBe('DELIVERED');
      expect(deliveredRes.body.data.deliveredAt).toBeTruthy();

      // Check CourierWallet
      const wallet = await prisma.courierWallet.findUnique({
        where: { courierId: courierProfileId },
        include: { transactions: true },
      });

      expect(wallet).not.toBeNull();
      // currentBalance = 15.00 (commission earned)
      expect(new Decimal(wallet!.currentBalance.toString()).toNumber()).toBe(15.00);
      // cashInHandBalance = 200.00 (COD collected)
      expect(new Decimal(wallet!.cashInHandBalance.toString()).toNumber()).toBe(200.00);

      // Check transactions
      const commissionTx = wallet!.transactions.find((t) => t.type === WalletTransactionType.COMMISSION_EARNED);
      const cashTx = wallet!.transactions.find((t) => t.type === WalletTransactionType.CASH_COLLECTED);

      expect(commissionTx).toBeDefined();
      expect(Number(commissionTx!.amount)).toBe(15.00);
      expect(commissionTx!.referenceId).toBe(parcelId);

      expect(cashTx).toBeDefined();
      expect(Number(cashTx!.amount)).toBe(200.00);
      expect(cashTx!.referenceId).toBe(parcelId);

      // Check Ledger Accounts
      const courierAccount = await prisma.ledgerAccount.findFirst({
        where: { ownerId: courierUserId, ownerType: AccountOwnerType.COURIER, type: AccountType.ASSET },
      });
      expect(Number(courierAccount!.balance)).toBe(200.00);

      const merchantAccount = await prisma.ledgerAccount.findFirst({
        where: { ownerId: merchantUserId, ownerType: AccountOwnerType.MERCHANT, type: AccountType.ASSET },
      });
      // 200 - 25 fee = 175
      expect(Number(merchantAccount!.balance)).toBe(175.00);

      const systemRev = await prisma.ledgerAccount.findFirst({
        where: { ownerType: AccountOwnerType.SYSTEM, type: AccountType.REVENUE },
      });
      expect(Number(systemRev!.balance)).toBe(25.00);

      const commissionPayable = await prisma.ledgerAccount.findFirst({
        where: { ownerId: courierUserId, ownerType: AccountOwnerType.COURIER, type: AccountType.LIABILITY },
      });
      expect(Number(commissionPayable!.balance)).toBe(15.00);
    });

    it('should fetch courier wallet via GET /api/v1/courier/wallet and GET /api/couriers/me/wallet', async () => {
      // Primary route
      const resV1 = await request(app)
        .get('/api/v1/courier/wallet')
        .set('Authorization', `Bearer ${courierToken}`);

      expect(resV1.status).toBe(200);
      expect(resV1.body.success).toBe(true);
      expect(resV1.body.data.totalEarnings).toBe('15.00');
      expect(resV1.body.data.pendingPayout).toBe('15.00');
      expect(resV1.body.data.cashInHand).toBe('200.00');
      expect(resV1.body.data.transactions).toHaveLength(2);

      // Alias route
      const resMe = await request(app)
        .get('/api/couriers/me/wallet')
        .set('Authorization', `Bearer ${courierToken}`);

      expect(resMe.status).toBe(200);
      expect(resMe.body.data).toEqual(resV1.body.data);
    });
  });

  describe('2. Concurrency Safety (Prevent Duplicate Delivery & Commission)', () => {
    let secondParcelId: string;

    beforeAll(async () => {
      // Create second parcel with EXPRESS tier (commission = 30 EGP)
      const p = await prisma.parcel.create({
        data: {
          trackingId: `ARM-CONCURRENCY-${Date.now()}`,
          merchantId: merchantProfileId,
          courierId: courierUserId,
          status: ParcelStatus.OUT_FOR_DELIVERY,
          codAmount: 100.00,
          serviceTier: ServiceTier.EXPRESS,
          courierCommission: 30.00,
          recipientName: 'Recipient Concurrent',
          recipientPhone: '+201000000000',
          recipientAddress: 'Armant',
        },
      });
      secondParcelId = p.id;
    });

    it('should allow only one concurrent request to deliver the parcel', async () => {
      // Fire 2 simultaneous delivery requests
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/parcels/${secondParcelId}/status`)
          .set('Authorization', `Bearer ${courierToken}`)
          .send({ status: 'DELIVERED' }),
        request(app)
          .patch(`/api/parcels/${secondParcelId}/status`)
          .set('Authorization', `Bearer ${courierToken}`)
          .send({ status: 'DELIVERED' }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Verify wallet commission increased by exactly 30 (15 from test 1 + 30 = 45)
      const wallet = await prisma.courierWallet.findUnique({
        where: { courierId: courierProfileId },
        include: { transactions: true },
      });

      expect(Number(wallet!.currentBalance)).toBe(45.00);
      expect(Number(wallet!.cashInHandBalance)).toBe(300.00); // 200 + 100

      // Only 1 COMMISSION_EARNED for secondParcelId
      const expressTxs = wallet!.transactions.filter(
        (t) => t.referenceId === secondParcelId && t.type === WalletTransactionType.COMMISSION_EARNED,
      );
      expect(expressTxs).toHaveLength(1);
    });
  });

  describe('3. Transactional Isolation & Rollback Verification', () => {
    let thirdParcelId: string;

    beforeAll(async () => {
      const p = await prisma.parcel.create({
        data: {
          trackingId: `ARM-ROLLBACK-${Date.now()}`,
          merchantId: merchantProfileId,
          courierId: courierUserId,
          status: ParcelStatus.OUT_FOR_DELIVERY,
          codAmount: 80.00,
          serviceTier: ServiceTier.INTERCITY,
          courierCommission: 22.00,
          recipientName: 'Recipient Rollback',
          recipientPhone: '+201000000000',
          recipientAddress: 'Luxor',
        },
      });
      thirdParcelId = p.id;
    });

    it('should roll back parcel status and wallet transactions if ledger fails', async () => {
      // Spy on LedgerService.recordCourierCommission to simulate failure midway
      const spy = jest
        .spyOn(LedgerService, 'recordCourierCommission')
        .mockRejectedValueOnce(new Error('Simulated Database Ledger Failure'));

      const initialWallet = await prisma.courierWallet.findUnique({
        where: { courierId: courierProfileId },
      });

      const res = await request(app)
        .patch(`/api/parcels/${thirdParcelId}/status`)
        .set('Authorization', `Bearer ${courierToken}`)
        .send({ status: 'DELIVERED' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);

      // Verify Parcel is STILL OUT_FOR_DELIVERY (not marked DELIVERED)
      const parcelAfter = await prisma.parcel.findUnique({ where: { id: thirdParcelId } });
      expect(parcelAfter!.status).toBe(ParcelStatus.OUT_FOR_DELIVERY);
      expect(parcelAfter!.deliveredAt).toBeNull();

      // Verify no WalletTransaction was persisted for this parcel
      const orphanTx = await prisma.walletTransaction.findFirst({
        where: { referenceId: thirdParcelId },
      });
      expect(orphanTx).toBeNull();

      // Verify wallet balance remained completely unchanged
      const walletAfter = await prisma.courierWallet.findUnique({
        where: { courierId: courierProfileId },
      });
      expect(Number(walletAfter!.currentBalance)).toBe(Number(initialWallet!.currentBalance));
      expect(Number(walletAfter!.cashInHandBalance)).toBe(Number(initialWallet!.cashInHandBalance));

      spy.mockRestore();
    });
  });

  describe('4. Settlement Confirmation (Cash Deposit Handover)', () => {
    it('should reduce cashInHandBalance when settlement is confirmed by admin', async () => {
      // Courier initiates a settlement for 150 EGP of cash in hand
      const initRes = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${courierToken}`)
        .send({
          courierId: courierUserId,
          amount: 150.00,
          notes: 'End of day cash deposit',
        });

      expect(initRes.status).toBe(201);
      const settlementId = initRes.body.data.id;

      // Admin confirms cash receipt
      const confirmRes = await request(app)
        .patch(`/api/settlements/${settlementId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Cash counted and verified at Armant Hub' });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.status).toBe('CONFIRMED');

      // Check courier wallet: cashInHandBalance was 300, - 150 = 150
      const walletRes = await request(app)
        .get('/api/v1/courier/wallet')
        .set('Authorization', `Bearer ${courierToken}`);

      expect(walletRes.status).toBe(200);
      expect(walletRes.body.data.cashInHand).toBe('150.00');

      // A CASH_DEPOSITED transaction exists
      const depositTx = walletRes.body.data.transactions.find(
        (t: any) => t.type === 'CASH_DEPOSITED' && t.referenceId === settlementId,
      );
      expect(depositTx).toBeDefined();
      expect(depositTx.amount).toBe('-150.00');
    });
  });
});
