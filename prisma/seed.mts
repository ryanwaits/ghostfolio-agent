import { createHmac } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DEMO_ACCOUNT_ID = '11111111-2222-3333-4444-555555555555';
const DEMO_ACCESS_TOKEN_PLAIN = 'demo-token-2026';
const ACCESS_TOKEN_SALT = process.env.ACCESS_TOKEN_SALT ?? 'agentforge-dev-salt-2026';

function hashToken(plain: string): string {
  return createHmac('sha512', ACCESS_TOKEN_SALT).update(plain).digest('hex');
}

async function main() {
  // Tags
  await prisma.tag.createMany({
    data: [
      { id: '4452656d-9fa4-4bd0-ba38-70492e31d180', name: 'EMERGENCY_FUND' },
      { id: 'f2e868af-8333-459f-b161-cbc6544c24bd', name: 'EXCLUDE_FROM_ANALYSIS' }
    ],
    skipDuplicates: true
  });

  // Demo user
  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: {
      id: DEMO_USER_ID,
      accessToken: hashToken(DEMO_ACCESS_TOKEN_PLAIN),
      provider: 'ANONYMOUS',
      role: 'ADMIN'
    }
  });

  // Demo account
  await prisma.account.upsert({
    where: { id_userId: { id: DEMO_ACCOUNT_ID, userId: DEMO_USER_ID } },
    update: {},
    create: {
      id: DEMO_ACCOUNT_ID,
      userId: DEMO_USER_ID,
      name: 'Main Brokerage',
      balance: 5000,
      currency: 'USD',
      isExcluded: false
    }
  });

  // Symbol profiles (YAHOO for stocks/ETFs)
  const symbols = [
    { id: 'sp-aapl', symbol: 'AAPL', name: 'Apple Inc.', currency: 'USD', dataSource: 'YAHOO' as const, assetClass: 'EQUITY' as const, assetSubClass: 'STOCK' as const },
    { id: 'sp-msft', symbol: 'MSFT', name: 'Microsoft Corporation', currency: 'USD', dataSource: 'YAHOO' as const, assetClass: 'EQUITY' as const, assetSubClass: 'STOCK' as const },
    { id: 'sp-voo', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', currency: 'USD', dataSource: 'YAHOO' as const, assetClass: 'EQUITY' as const, assetSubClass: 'ETF' as const },
    { id: 'sp-googl', symbol: 'GOOGL', name: 'Alphabet Inc.', currency: 'USD', dataSource: 'YAHOO' as const, assetClass: 'EQUITY' as const, assetSubClass: 'STOCK' as const },
    { id: 'sp-btc', symbol: 'bitcoin', name: 'Bitcoin', currency: 'USD', dataSource: 'COINGECKO' as const, assetClass: 'ALTERNATIVE_INVESTMENT' as const, assetSubClass: 'CRYPTOCURRENCY' as const },
  ];

  for (const sp of symbols) {
    await prisma.symbolProfile.upsert({
      where: { dataSource_symbol: { dataSource: sp.dataSource, symbol: sp.symbol } },
      update: {},
      create: {
        id: sp.id,
        symbol: sp.symbol,
        name: sp.name,
        currency: sp.currency,
        dataSource: sp.dataSource,
        assetClass: sp.assetClass,
        assetSubClass: sp.assetSubClass
      }
    });
  }

  // Orders (buy transactions with realistic dates/prices)
  const orders = [
    { id: 'ord-1', symbolProfileId: 'sp-aapl', type: 'BUY' as const, quantity: 15, unitPrice: 178.50, fee: 0, date: new Date('2024-03-15'), currency: 'USD' },
    { id: 'ord-2', symbolProfileId: 'sp-msft', type: 'BUY' as const, quantity: 10, unitPrice: 420.00, fee: 0, date: new Date('2024-04-01'), currency: 'USD' },
    { id: 'ord-3', symbolProfileId: 'sp-voo', type: 'BUY' as const, quantity: 20, unitPrice: 480.00, fee: 0, date: new Date('2024-01-10'), currency: 'USD' },
    { id: 'ord-4', symbolProfileId: 'sp-googl', type: 'BUY' as const, quantity: 8, unitPrice: 155.00, fee: 0, date: new Date('2024-06-20'), currency: 'USD' },
    { id: 'ord-5', symbolProfileId: 'sp-btc', type: 'BUY' as const, quantity: 0.5, unitPrice: 43000.00, fee: 0, date: new Date('2024-02-01'), currency: 'USD' },
    { id: 'ord-6', symbolProfileId: 'sp-aapl', type: 'BUY' as const, quantity: 5, unitPrice: 195.00, fee: 0, date: new Date('2024-09-15'), currency: 'USD' },
    { id: 'ord-7', symbolProfileId: 'sp-voo', type: 'DIVIDEND' as const, quantity: 0, unitPrice: 1.78, fee: 0, date: new Date('2024-12-20'), currency: 'USD' },
    { id: 'ord-8', symbolProfileId: 'sp-msft', type: 'SELL' as const, quantity: 3, unitPrice: 450.00, fee: 0, date: new Date('2025-01-10'), currency: 'USD' },
  ];

  for (const ord of orders) {
    await prisma.order.upsert({
      where: { id: ord.id },
      update: {},
      create: {
        id: ord.id,
        userId: DEMO_USER_ID,
        accountId: DEMO_ACCOUNT_ID,
        accountUserId: DEMO_USER_ID,
        symbolProfileId: ord.symbolProfileId,
        type: ord.type,
        quantity: ord.quantity,
        unitPrice: ord.unitPrice,
        fee: ord.fee,
        date: ord.date,
        currency: ord.currency
      }
    });
  }

  console.log('🌱  Seeded demo user, account, symbols, and orders.');
  console.log(`    Login token: ${DEMO_ACCESS_TOKEN_PLAIN}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
