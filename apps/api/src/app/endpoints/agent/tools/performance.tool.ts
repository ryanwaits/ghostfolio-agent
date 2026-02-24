import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import type { DateRange } from '@ghostfolio/common/types';

import { tool } from 'ai';
import { z } from 'zod';

export function createPortfolioPerformanceTool({
  portfolioService,
  userId
}: {
  portfolioService: PortfolioService;
  userId: string;
}) {
  return tool({
    description:
      'Get portfolio performance metrics over a time range: returns, net performance, chart data, and annualized performance. Use when the user asks about returns, how their portfolio is doing, or wants performance over a specific period.',
    inputSchema: z.object({
      dateRange: z
        .enum(['1d', '1y', '5y', 'max', 'mtd', 'wtd', 'ytd'])
        .optional()
        .describe('Time range. Defaults to max (all time).')
    }),
    execute: async ({ dateRange = 'max' }) => {
      try {
        const result = await portfolioService.getPerformance({
          dateRange: dateRange as DateRange,
          filters: undefined,
          impersonationId: undefined,
          userId
        });

        return {
          firstOrderDate: result.firstOrderDate,
          hasErrors: result.hasErrors,
          performance: result.performance,
          chartSummary: result.chart?.length
            ? {
                points: result.chart.length,
                first: result.chart[0],
                last: result.chart[result.chart.length - 1]
              }
            : null
        };
      } catch (error) {
        return { error: `Failed to fetch performance: ${error instanceof Error ? error.message : 'unknown error'}` };
      }
    }
  });
}
