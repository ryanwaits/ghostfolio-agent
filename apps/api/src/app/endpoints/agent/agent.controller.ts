import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
  Res,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { UIMessage } from 'ai';
import type { Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AgentMetricsService } from './agent-metrics.service';
import { AgentService } from './agent.service';

const chatHtml = readFileSync(join(__dirname, 'assets', 'chat.html'), 'utf-8');

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  public constructor(
    private readonly agentMetricsService: AgentMetricsService,
    private readonly agentService: AgentService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Get('ui')
  @Header('Content-Type', 'text/html')
  public getUi() {
    return chatHtml;
  }

  @Post('chat')
  @HasPermission(permissions.readAiPrompt)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async chat(
    @Body() body: { messages: UIMessage[] },
    @Res() res: Response
  ) {
    try {
      const result = this.agentService.chat({
        messages: body.messages,
        userId: this.request.user.id
      });

      result.pipeUIMessageStreamToResponse(res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Chat failed: ${message}`,
        error instanceof Error ? error.stack : undefined
      );

      this.agentMetricsService.record({
        requestId: 'error-' + Date.now(),
        userId: this.request.user.id,
        latencyMs: 0,
        totalSteps: 0,
        toolsUsed: [],
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        errorOccurred: true,
        errorMessage: message,
        timestamp: Date.now()
      });

      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Agent chat failed'
        });
      }
    }
  }

  @Get('metrics')
  @HasPermission(permissions.readAiPrompt)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public getMetrics(@Query('since') since?: string) {
    const sinceMs = since ? parseDuration(since) : undefined;

    return {
      summary: this.agentMetricsService.getSummary(sinceMs),
      recent: this.agentMetricsService.getRecent(10)
    };
  }
}

function parseDuration(input: string): number | undefined {
  const match = /^(\d+)(m|h|d)$/.exec(input);

  if (!match) return undefined;

  const [, value, unit] = match;
  const multipliers: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return Number(value) * multipliers[unit];
}
