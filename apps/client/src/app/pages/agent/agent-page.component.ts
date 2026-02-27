import { TokenStorageService } from '@ghostfolio/client/services/token-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { User } from '@ghostfolio/common/interfaces';

import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { ChartInitializer } from './rendering/chart-initializer';
import { configureMarked } from './rendering/configure-marked';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  alertCircleOutline,
  analyticsOutline,
  chatbubbleEllipsesOutline,
  chatbubbleOutline,
  copyOutline,
  createOutline,
  ellipsisHorizontalOutline,
  ellipsisVerticalOutline,
  linkOutline,
  pieChartOutline,
  pinOutline,
  sendOutline,
  swapHorizontalOutline,
  thumbsDownOutline,
  thumbsUpOutline,
  trashOutline
} from 'ionicons/icons';
import { Subject, takeUntil } from 'rxjs';


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  html?: SafeHtml;
  isStreaming?: boolean;
  activeTools?: string[];
  requestId?: string;
  feedbackRating?: number;
  latencyMs?: number;
  verificationData?: any;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  pinned?: boolean;
}

interface PromptCard {
  iconName: string;
  title: string;
  subtitle: string;
  message: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-agent-page',
  styleUrls: ['./agent-page.scss'],
  templateUrl: './agent-page.html'
})
export class GfAgentPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer: ElementRef;
  @ViewChild('messageInput')
  private messageInput: ElementRef<HTMLTextAreaElement>;

  public conversations: Conversation[] = [];
  public activeConversation: Conversation | null = null;
  public inputValue = '';
  public isLoading = false;
  public user: User;
  public openMenuId: string | null = null;
  public renamingId: string | null = null;
  public renameValue = '';

  public promptCards: PromptCard[] = [
    {
      iconName: 'analytics-outline',
      title: 'Analyze performance',
      subtitle: 'Year to date overview',
      message: 'How is my portfolio performing?'
    },
    {
      iconName: 'alert-circle-outline',
      title: 'Check volatility',
      subtitle: 'Risk assessment',
      message: 'What is the risk profile of my portfolio?'
    },
    {
      iconName: 'pie-chart-outline',
      title: 'Asset allocation',
      subtitle: 'Current breakdown',
      message: 'Show my asset allocation breakdown'
    },
    {
      iconName: 'swap-horizontal-outline',
      title: 'Recent activity',
      subtitle: 'Transaction history',
      message: 'Summarize my recent transactions'
    }
  ];

  private static readonly STORAGE_KEY = 'agent-conversations';
  private static readonly MAX_CONVERSATIONS = 50;

  private chartInitializer = new ChartInitializer();
  private marked: typeof import('marked') | null = null;
  private remend: ((md: string) => string) | null = null;
  private renderInterval: ReturnType<typeof setInterval> | null = null;
  private renderDirty = false;
  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
    private tokenStorageService: TokenStorageService,
    private userService: UserService
  ) {
    addIcons({
      addOutline,
      alertCircleOutline,
      analyticsOutline,
      chatbubbleEllipsesOutline,
      chatbubbleOutline,
      copyOutline,
      createOutline,
      ellipsisHorizontalOutline,
      ellipsisVerticalOutline,
      linkOutline,
      pieChartOutline,
      pinOutline,
      sendOutline,
      swapHorizontalOutline,
      thumbsDownOutline,
      thumbsUpOutline,
      trashOutline
    });
  }

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;
          this.changeDetectorRef.markForCheck();
        }
      });

    this.loadMarked().then(() => {
      this.restoreConversations();
      this.focusInput();
      this.ensureChartObserver();
    });
  }

  public ngAfterViewInit() {
    this.ensureChartObserver();
  }

  public ngOnDestroy() {
    this.chartInitializer.detach();
    this.clearRenderInterval();
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  @HostListener('document:click')
  public onDocumentClick() {
    if (this.openMenuId) {
      this.openMenuId = null;
      this.changeDetectorRef.markForCheck();
    }
  }

  public onNewChat() {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date()
    };
    this.conversations.unshift(conversation);
    this.sortConversations();
    this.activeConversation = conversation;
    this.persistConversations();
    this.changeDetectorRef.markForCheck();
    this.focusInput();
  }

  public toggleMenu(event: Event, id: string) {
    event.stopPropagation();
    this.openMenuId = this.openMenuId === id ? null : id;
    this.changeDetectorRef.markForCheck();
  }

  public startRename(event: Event, conversation: Conversation) {
    event.stopPropagation();
    this.openMenuId = null;
    this.renamingId = conversation.id;
    this.renameValue = conversation.title;
    this.changeDetectorRef.markForCheck();
  }

  public confirmRename(conversation: Conversation) {
    const trimmed = this.renameValue.trim();
    if (trimmed) {
      conversation.title = trimmed;
    }
    this.renamingId = null;
    this.persistConversations();
    this.changeDetectorRef.markForCheck();
  }

  public onRenameKeydown(event: KeyboardEvent, conversation: Conversation) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.confirmRename(conversation);
    } else if (event.key === 'Escape') {
      this.renamingId = null;
      this.changeDetectorRef.markForCheck();
    }
  }

  public togglePin(event: Event, conversation: Conversation) {
    event.stopPropagation();
    this.openMenuId = null;
    conversation.pinned = !conversation.pinned;
    this.sortConversations();
    this.persistConversations();
    this.changeDetectorRef.markForCheck();
  }

  public deleteConversation(event: Event, conversation: Conversation) {
    event.stopPropagation();
    this.openMenuId = null;
    this.conversations = this.conversations.filter(
      (c) => c.id !== conversation.id
    );
    if (this.activeConversation?.id === conversation.id) {
      this.activeConversation = null;
    }
    this.persistConversations();
    this.changeDetectorRef.markForCheck();
  }

  public onSelectConversation(conversation: Conversation) {
    this.activeConversation = conversation;
    this.changeDetectorRef.markForCheck();
    this.focusInput();
    this.ensureChartObserver();
  }

  public onPromptCardClick(card: PromptCard) {
    this.sendMessageDirect(card.message);
  }

  public onMarkdownClick(event: MouseEvent) {
    const suggest = (event.target as HTMLElement).closest('.c-suggest') as HTMLElement;
    if (suggest) {
      event.preventDefault();
      // Strip the arrow prefix from textContent
      const text = suggest.textContent.replace(/^\u21B3\s*/, '').trim();
      if (text) {
        this.sendMessageDirect(text);
      }
    }
  }

  public onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  public onInputChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    this.inputValue = textarea.value;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  public sendMessage() {
    const text = this.inputValue.trim();
    if (!text || this.isLoading) {
      return;
    }

    this.inputValue = '';

    if (this.messageInput?.nativeElement) {
      this.messageInput.nativeElement.style.height = 'auto';
    }

    this.streamMessage(text);
  }

  public async sendFeedback(message: ChatMessage, rating: number) {
    if (message.feedbackRating || !message.requestId) {
      return;
    }

    message.feedbackRating = rating;
    this.persistConversations();
    this.changeDetectorRef.markForCheck();

    const token = this.tokenStorageService.getToken();

    try {
      await fetch('/api/v1/agent/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId: message.requestId,
          rating
        })
      });
    } catch {
      // Silently fail
    }
  }

  public async copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      // Clipboard unavailable
    }
  }

  public async shareMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      // Clipboard unavailable
    }
  }

  public formatLatency(ms: number): string {
    return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';
  }

  public formatTools(tools: string[] | undefined): string {
    return tools?.join(', ') || 'none';
  }

  public buildVerificationTooltip(message: ChatMessage): string {
    const row = (label: string, value: string | number) =>
      `<span class="vt-row"><span class="vt-label">${label}</span><span class="vt-value">${value}</span></span>`;

    const d = message.verificationData;

    if (d) {
      return [
        row('Latency', d.latencyMs + 'ms'),
        row('Steps', d.totalSteps),
        row('Tools', this.formatTools(d.toolsUsed)),
        row('Tokens', d.totalTokens),
        row('Confidence', d.verificationScore ?? 'n/a')
      ].join('');
    }

    return row('Response time', message.latencyMs + 'ms');
  }

  public async prefetchVerification(message: ChatMessage) {
    if (message.verificationData || !message.requestId) {
      return;
    }

    const token = this.tokenStorageService.getToken();

    try {
      const res = await fetch(
        `/api/v1/agent/verification/${message.requestId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.ok) {
        message.verificationData = await res.json();
        this.changeDetectorRef.markForCheck();
      }
    } catch {
      // Silently fail
    }
  }

  private sendMessageDirect(text: string) {
    if (!text || this.isLoading) {
      return;
    }

    this.inputValue = '';
    this.streamMessage(text);
  }

  private async streamMessage(text: string) {
    if (!this.activeConversation) {
      this.onNewChat();
    }

    this.isLoading = true;

    const userMessage: ChatMessage = { role: 'user', content: text };
    this.activeConversation.messages.push(userMessage);

    if (
      this.activeConversation.messages.filter((m) => m.role === 'user')
        .length === 1
    ) {
      this.activeConversation.title =
        text.slice(0, 40) + (text.length > 40 ? '...' : '');
    }

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      isStreaming: true
    };
    this.activeConversation.messages.push(assistantMessage);
    this.changeDetectorRef.markForCheck();
    this.scrollToBottom();
    this.ensureChartObserver();

    let fullText = '';

    // Start render interval — batches token deltas at ~12fps
    this.renderDirty = false;
    this.renderInterval = setInterval(() => {
      if (!this.renderDirty) {
        return;
      }
      this.renderDirty = false;

      if (this.marked && this.remend) {
        const streamSafe = this.stripTrailingFencedBlock(fullText);
        assistantMessage.html = this.toSafeHtml(
          this.marked.parse(this.normalizeMarkdown(this.remend(streamSafe))) as string
        );
      }

      this.changeDetectorRef.markForCheck();
      this.scrollToBottom();
    }, 80);

    const streamStart = Date.now();

    try {
      const token = this.tokenStorageService.getToken();
      const conversationMessages = this.activeConversation.messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }));
      const toolHistory = [
        ...new Set(
          this.activeConversation.messages.flatMap((m) => m.activeTools || [])
        )
      ];

      const response = await fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: conversationMessages,
          toolHistory: toolHistory.length > 0 ? toolHistory : undefined
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) {
            continue;
          }

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            continue;
          }

          try {
            const evt = JSON.parse(data);

            if (evt.toolName && typeof evt.toolName === 'string') {
              if (!assistantMessage.activeTools) {
                assistantMessage.activeTools = [];
              }
              if (!assistantMessage.activeTools.includes(evt.toolName)) {
                assistantMessage.activeTools.push(evt.toolName);
                this.changeDetectorRef.markForCheck();
              }
            }

            if (evt.type === 'text-delta') {
              fullText += evt.delta;
              assistantMessage.content = fullText;
              this.renderDirty = true;
            } else if (
              (evt.type === 'finish' || evt.type === 'message-metadata') &&
              evt.messageMetadata?.requestId
            ) {
              assistantMessage.requestId = evt.messageMetadata.requestId;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data !== '[DONE]') {
            try {
              const evt = JSON.parse(data);
              if (evt.type === 'text-delta') {
                fullText += evt.delta;
                assistantMessage.content = fullText;
              } else if (
                (evt.type === 'finish' || evt.type === 'message-metadata') &&
                evt.messageMetadata?.requestId
              ) {
                assistantMessage.requestId = evt.messageMetadata.requestId;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Final render — no remend needed, text is complete
      this.clearRenderInterval();
      if (fullText && this.marked) {
        assistantMessage.html = this.toSafeHtml(
          this.marked.parse(this.normalizeMarkdown(fullText)) as string
        );
      }

      // Re-scan for chart canvases after final innerHTML update
      setTimeout(() => this.chartInitializer.scan());
    } catch (err) {
      this.clearRenderInterval();
      assistantMessage.content = `Error: ${err.message}`;
    }

    assistantMessage.latencyMs = Date.now() - streamStart;
    assistantMessage.isStreaming = false;
    this.isLoading = false;
    this.persistConversations();
    this.changeDetectorRef.markForCheck();
    this.scrollToBottom();
    this.focusInput();
  }

  private sortConversations() {
    this.conversations.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  private persistConversations() {
    try {
      const toStore = this.conversations
        .slice(0, GfAgentPageComponent.MAX_CONVERSATIONS)
        .map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          pinned: c.pinned || false,
          messages: c.messages.map((m) => ({
            role: m.role,
            content: m.content,
            activeTools: m.activeTools,
            requestId: m.requestId,
            feedbackRating: m.feedbackRating,
            latencyMs: m.latencyMs
          }))
        }));

      localStorage.setItem(
        GfAgentPageComponent.STORAGE_KEY,
        JSON.stringify({ activeId: this.activeConversation?.id, conversations: toStore })
      );
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }

  private restoreConversations() {
    try {
      const raw = localStorage.getItem(GfAgentPageComponent.STORAGE_KEY);

      if (!raw) {
        return;
      }

      const { activeId, conversations } = JSON.parse(raw);

      this.conversations = (conversations || []).map(
        (c: { id: string; title: string; createdAt: string; pinned?: boolean; messages: ChatMessage[] }) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          pinned: c.pinned || false,
          messages: c.messages.map((m: ChatMessage) => ({
            ...m,
            html:
              m.role === 'assistant' && m.content && this.marked
                ? this.toSafeHtml(this.marked.parse(this.normalizeMarkdown(m.content)) as string)
                : undefined
          }))
        })
      );

      this.sortConversations();

      if (activeId) {
        this.activeConversation =
          this.conversations.find((c) => c.id === activeId) || null;
      }

      this.changeDetectorRef.markForCheck();
    } catch {
      // Corrupt storage — start fresh
    }
  }

  private async loadMarked() {
    const [markedModule, remendModule] = await Promise.all([
      import('marked'),
      import('remend')
    ]);
    this.marked = markedModule;
    this.remend = remendModule.default;
    configureMarked(markedModule.marked);
  }

  private toSafeHtml(raw: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.postProcess(raw));
  }

  private normalizeMarkdown(text: string): string {
    // Ensure headings always have a blank line before them
    return text.replace(/([^\n])(#{1,6}\s)/g, '$1\n\n$2');
  }

  private postProcess(html: string): string {
    // Positive percentages → green
    html = html.replace(
      /(\+\d+(?:,\d{3})*(?:\.\d+)?%)/g,
      '<span class="value-positive">$1</span>'
    );
    // Negative percentages → red
    html = html.replace(
      /(-\d+(?:,\d{3})*(?:\.\d+)?%)/g,
      '<span class="value-negative">$1</span>'
    );
    return html;
  }

  private clearRenderInterval() {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
  }

  private ensureChartObserver() {
    setTimeout(() => {
      if (this.messagesContainer?.nativeElement) {
        this.chartInitializer.attach(this.messagesContainer.nativeElement);
      }
    });
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.messagesContainer?.nativeElement) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    });
  }

  /**
   * Strip any trailing ```suggestions block during streaming so it
   * only renders in the final pass (avoids flicker from partial tokens).
   */
  private stripTrailingFencedBlock(text: string): string {
    const idx = text.lastIndexOf('```suggestions');
    if (idx === -1) {
      return text;
    }
    return text.slice(0, idx).trimEnd();
  }

  private focusInput() {
    setTimeout(() => {
      this.messageInput?.nativeElement?.focus();
    });
  }
}
