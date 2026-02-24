import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';

import type { Type as ActivityType } from '@prisma/client';
import { tool } from 'ai';
import { z } from 'zod';

export function createTransactionHistoryTool({
  orderService,
  userService,
  userId
}: {
  orderService: OrderService;
  userService: UserService;
  userId: string;
}) {
  return tool({
    description:
      'Get transaction/activity history: buys, sells, dividends, fees. Use when the user asks about their trades, transaction history, or activity log.',
    inputSchema: z.object({
      types: z
        .array(z.enum(['BUY', 'SELL', 'DIVIDEND', 'FEE', 'INTEREST', 'LIABILITY']))
        .optional()
        .describe(
          'Filter by activity type. Omit to get all types.'
        ),
      take: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe('Number of results to return (max 100). Defaults to 50.'),
      sortDirection: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Sort by date. Defaults to desc (newest first).')
    }),
    execute: async ({ types, take = 50, sortDirection = 'desc' }) => {
      try {
        const user = await userService.user({ id: userId });
        const userCurrency =
          user?.settings?.settings?.baseCurrency ?? 'USD';

        const { activities, count } = await orderService.getOrders({
          sortDirection,
          take,
          types: types as ActivityType[],
          userCurrency,
          userId
        });

        return {
          count,
          activities: activities.map((a) => ({
            date: a.date,
            type: a.type,
            symbol: a.SymbolProfile?.symbol,
            name: a.SymbolProfile?.name,
            quantity: a.quantity,
            unitPrice: a.unitPrice,
            currency: a.currency,
            fee: a.fee,
            value: a.value,
            valueInBaseCurrency: a.valueInBaseCurrency,
            account: a.account?.name
          }))
        };
      } catch (error) {
        return { error: `Failed to fetch transactions: ${error instanceof Error ? error.message : 'unknown error'}` };
      }
    }
  });
}
