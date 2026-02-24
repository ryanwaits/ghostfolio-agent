import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import { Injectable, Logger } from '@nestjs/common';
import { createAnthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText, type ModelMessage, type UIMessage } from 'ai';
import { randomUUID } from 'node:crypto';

import { AgentMetricsService } from './agent-metrics.service';
import { createHoldingsLookupTool } from './tools/holdings.tool';
import { createMarketDataTool } from './tools/market-data.tool';
import { createPortfolioPerformanceTool } from './tools/performance.tool';
import { createPortfolioAnalysisTool } from './tools/portfolio.tool';
import { createTransactionHistoryTool } from './tools/transactions.tool';

const SYSTEM_PROMPT = `You are a financial analysis assistant powered by Ghostfolio. You help users understand their investment portfolio through data-driven insights.

RULES:
- You are read-only. You cannot execute trades or modify the portfolio.
- Never provide investment advice. Always include "This is not financial advice" when making forward-looking statements.
- Only reference data returned by your tools. Never fabricate numbers or holdings.
- If a tool call fails, tell the user honestly rather than guessing.
- Be concise and data-focused. Use tables and bullet points for clarity.
- When presenting monetary values, use the user's base currency.
- When presenting percentages, round to 2 decimal places.`;

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

    return streamText({
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
        transaction_history: createTransactionHistoryTool({
          orderService: this.orderService,
          userService: this.userService,
          userId
        })
      },
      stopWhen: stepCountIs(5),
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
      onFinish: ({ steps, usage }) => {
        const latencyMs = Date.now() - startTime;
        const allTools = steps.flatMap((s) =>
          s.toolCalls.map((tc) => tc.toolName)
        );
        const uniqueTools = [...new Set(allTools)];

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
          promptTokens: (usage as any).promptTokens ?? (usage as any).inputTokens ?? 0,
          completionTokens: (usage as any).completionTokens ?? (usage as any).outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          timestamp: Date.now()
        });
      }
    });
  }
}
