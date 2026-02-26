import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import { createAnthropic } from '@ai-sdk/anthropic';
import { Injectable, Logger } from '@nestjs/common';
import { stepCountIs, streamText, type ModelMessage, type UIMessage } from 'ai';
import { randomUUID } from 'node:crypto';

import { AgentMetricsService } from './agent-metrics.service';
import { createHoldingsLookupTool } from './tools/holdings.tool';
import { createMarketDataTool } from './tools/market-data.tool';
import { createPortfolioPerformanceTool } from './tools/performance.tool';
import { createPortfolioAnalysisTool } from './tools/portfolio.tool';
import { createSymbolSearchTool } from './tools/symbol-search.tool';
import { createTransactionHistoryTool } from './tools/transactions.tool';
import {
  checkHallucination,
  computeConfidence,
  validateOutput
} from './verification';

const SYSTEM_PROMPT = `You are a financial analysis assistant powered by Ghostfolio. You help users understand their investment portfolio through data-driven insights.

RULES:
- You are read-only. You cannot execute trades or modify the portfolio.
- Never provide investment advice. Always include "This is not financial advice" when making forward-looking statements.
- Only reference data returned by your tools. Never fabricate numbers or holdings.
- If a tool call fails, tell the user honestly rather than guessing.
- Be concise and data-focused. Use tables and bullet points for clarity.
- When presenting monetary values, use the user's base currency.
- When presenting percentages, round to 2 decimal places.

MARKET DATA LOOKUPS:
- For stocks and ETFs: use dataSource "YAHOO" with uppercase ticker symbols (e.g. "AAPL", "TSLA", "MSFT").
- For cryptocurrencies: use dataSource "COINGECKO" with the CoinGecko lowercase slug ID. Do NOT use ticker symbols like "BTC" or "STX" with CoinGecko — use the full lowercase slug.
- Well-known CoinGecko slugs you can use directly: "bitcoin", "ethereum", "solana".
- For ANY other cryptocurrency, use the symbol_search tool first to find the correct CoinGecko slug. CoinGecko slugs are often non-obvious (e.g. "blockstack" for Stacks, "avalanche-2" for Avalanche, "matic-network" for Polygon).
- If symbol_search returns multiple matches, present the options to the user and let them choose before calling market_data.
- If unsure whether something is a crypto or stock, use symbol_search to find out.`;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  public constructor(
    private readonly agentMetricsService: AgentMetricsService,
    private readonly dataProviderService: DataProviderService,
    private readonly orderService: OrderService,
    private readonly portfolioService: PortfolioService,
    private readonly userService: UserService
  ) {}

  public chat({
    messages,
    userId
  }: {
    messages: ModelMessage[] | UIMessage[];
    userId: string;
  }) {
    const requestId = randomUUID();
    const startTime = Date.now();

    this.logger.log(
      JSON.stringify({
        event: 'chat_start',
        requestId,
        userId,
        messageCount: messages.length
      })
    );

    const result = streamText({
      model: createAnthropic()('claude-sonnet-4-6'),
      system: SYSTEM_PROMPT,
      messages: messages as ModelMessage[],
      tools: {
        portfolio_analysis: createPortfolioAnalysisTool({
          portfolioService: this.portfolioService,
          userId
        }),
        portfolio_performance: createPortfolioPerformanceTool({
          portfolioService: this.portfolioService,
          userId
        }),
        holdings_lookup: createHoldingsLookupTool({
          portfolioService: this.portfolioService,
          userId
        }),
        market_data: createMarketDataTool({
          dataProviderService: this.dataProviderService
        }),
        symbol_search: createSymbolSearchTool({
          dataProviderService: this.dataProviderService,
          userService: this.userService,
          userId
        }),
        transaction_history: createTransactionHistoryTool({
          orderService: this.orderService,
          userService: this.userService,
          userId
        })
      },
      stopWhen: stepCountIs(6),
      onStepFinish: ({ toolCalls, usage, finishReason, stepNumber }) => {
        const toolNames = toolCalls.map((tc) => tc.toolName);
        this.logger.log(
          JSON.stringify({
            event: 'step_finish',
            requestId,
            userId,
            step: stepNumber,
            finishReason,
            toolsCalled: toolNames.length > 0 ? toolNames : undefined,
            tokens: usage
          })
        );
      },
      onError: (error) => {
        const latencyMs = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        this.logger.error(
          JSON.stringify({
            event: 'chat_error',
            requestId,
            userId,
            latencyMs,
            error: message
          })
        );

        this.agentMetricsService.record({
          requestId,
          userId,
          latencyMs,
          totalSteps: 0,
          toolsUsed: [],
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          errorOccurred: true,
          errorMessage: message,
          timestamp: Date.now()
        });
      },
      onFinish: ({ steps, usage, text }) => {
        const latencyMs = Date.now() - startTime;
        const allTools = steps.flatMap((s) =>
          s.toolCalls.map((tc) => tc.toolName)
        );
        const uniqueTools = [...new Set(allTools)];

        // Run verification
        const toolResults = steps.flatMap((s) =>
          s.toolResults.map((tr: any) => ({
            toolName: tr.toolName as string,
            result: tr.output
          }))
        );
        const toolErrors = steps.flatMap((s) =>
          s.toolResults.filter((tr: any) => {
            const out = tr.output;
            return out && typeof out === 'object' && 'error' in out;
          })
        );

        const validation = validateOutput({
          text,
          toolCalls: allTools
        });
        const hallucination = checkHallucination({
          text,
          toolResults
        });
        const confidence = computeConfidence({
          toolCallCount: allTools.length,
          toolErrorCount: toolErrors.length,
          stepCount: steps.length,
          maxSteps: 6,
          validation,
          hallucination
        });

        this.logger.log(
          JSON.stringify({
            event: 'verification',
            requestId,
            userId,
            confidence: confidence.score,
            validationIssues: validation.issues,
            hallucinationIssues: hallucination.issues
          })
        );

        this.logger.log(
          JSON.stringify({
            event: 'chat_complete',
            requestId,
            userId,
            latencyMs,
            totalSteps: steps.length,
            totalTokens: usage,
            toolsUsed: uniqueTools
          })
        );

        this.agentMetricsService.record({
          requestId,
          userId,
          latencyMs,
          totalSteps: steps.length,
          toolsUsed: uniqueTools,
          promptTokens:
            (usage as any).promptTokens ?? (usage as any).inputTokens ?? 0,
          completionTokens:
            (usage as any).completionTokens ?? (usage as any).outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          timestamp: Date.now(),
          verificationScore: confidence.score,
          verificationResult: {
            confidence: confidence.breakdown,
            validation: {
              valid: validation.valid,
              score: validation.score,
              issues: validation.issues
            },
            hallucination: {
              clean: hallucination.clean,
              score: hallucination.score,
              issues: hallucination.issues
            }
          }
        });
      }
    });

    return { result, requestId };
  }
}
