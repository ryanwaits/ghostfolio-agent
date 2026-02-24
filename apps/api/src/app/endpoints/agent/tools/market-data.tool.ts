import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import { DataSource } from '@prisma/client';
import { tool } from 'ai';
import { z } from 'zod';

export function createMarketDataTool({
  dataProviderService
}: {
  dataProviderService: DataProviderService;
}) {
  return tool({
    description:
      'Get current market price and quote data for one or more symbols. Use when the user asks about current prices, market status, or wants to look up a ticker.',
    inputSchema: z.object({
      symbols: z
        .array(
          z.object({
            symbol: z
              .string()
              .describe('Ticker symbol (e.g. AAPL, MSFT, BTC-USD)'),
            dataSource: z
              .enum([
                'ALPHA_VANTAGE',
                'COINGECKO',
                'EOD_HISTORICAL_DATA',
                'FINANCIAL_MODELING_PREP',
                'GHOSTFOLIO',
                'GOOGLE_SHEETS',
                'MANUAL',
                'RAPID_API',
                'YAHOO'
              ])
              .optional()
              .default('YAHOO')
              .describe('Data source. Defaults to YAHOO.')
          })
        )
        .min(1)
        .max(10)
        .describe('Array of symbols to look up (max 10)')
    }),
    execute: async ({ symbols }) => {
      try {
        const items = symbols.map(({ symbol, dataSource = 'YAHOO' }) => ({
          dataSource: dataSource as DataSource,
          symbol: symbol.toUpperCase()
        }));

        const quotes = await dataProviderService.getQuotes({ items });

        return Object.entries(quotes).map(([symbol, data]) => ({
          symbol,
          currency: data.currency,
          marketPrice: data.marketPrice,
          marketState: data.marketState,
          dataSource: data.dataSource
        }));
      } catch (error) {
        return { error: `Failed to fetch market data: ${error instanceof Error ? error.message : 'unknown error'}` };
      }
    }
  });
}
