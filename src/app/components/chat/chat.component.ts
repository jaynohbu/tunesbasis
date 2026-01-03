import { Component, OnInit, Input, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ChatService, Message } from 'src/app/services/chat.service';
import { AuthService } from 'src/app/services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, OnDestroy {
  @Input() groupId!: string;
  @ViewChild('messageContainer') messageContainer!: ElementRef;

  /* ================= STATE ================= */
  messages: Message[] = [];
  newMessage = '';
  loading = false;
  currentUserId = '';

  /* ================= EMOJI PICKER ================= */
  showEmojiPicker = false;
  selectedMessageId: string | null = null;
  commonEmojis = ['👍', '❤️', '😊', '😂', '🎵', '🔥', '👏', '🎉'];

  /* ================= SUBSCRIPTIONS ================= */
  private subscriptions: Subscription[] = [];

  constructor(
    private chatService: ChatService,
    private authService: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUserId = await this.authService.getCurrentUserId();

    if (this.groupId) {
      await this.loadMessages();
      this.subscribeToUpdates();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /* ============================================================
   * LOAD MESSAGES
   * ============================================================ */
  private async loadMessages(): Promise<void> {
    try {
      this.loading = true;
      const response = await this.chatService.getMessages(this.groupId).toPromise();

      if (response) {
        // Messages come in reverse chronological order, so reverse them
        this.messages = response.items.reverse();

        // Mark messages as read
        setTimeout(() => this.markVisibleMessagesAsRead(), 1000);

        // Scroll to bottom
        setTimeout(() => this.scrollToBottom(), 100);
      }
    } catch (error) {
      console.error('[ChatComponent] Failed to load messages:', error);
    } finally {
      this.loading = false;
    }
  }

  /* ============================================================
   * SEND MESSAGE
   * ============================================================ */
  async onSendMessage(): Promise<void> {
    if (!this.newMessage.trim()) return;

    const messageText = this.newMessage.trim();
    this.newMessage = '';

    try {
      await this.chatService.sendMessage(this.groupId, messageText).toPromise();
      // Message will be added via subscription
      setTimeout(() => this.scrollToBottom(), 100);
    } catch (error) {
      console.error('[ChatComponent] Failed to send message:', error);
      this.newMessage = messageText; // Restore message on error
    }
  }

  /* ============================================================
   * READ RECEIPTS
   * ============================================================ */
  private markVisibleMessagesAsRead(): void {
    const unreadMessages = this.messages.filter(msg =>
      msg.userId !== this.currentUserId &&
      (!msg.readBy || !msg.readBy[this.currentUserId])
    );

    unreadMessages.forEach(msg => {
      if (msg.timestampMessageId) {
        this.chatService.markMessageRead(msg.messageId, this.groupId, msg.timestampMessageId)
          .subscribe({
            error: (error) => console.error('[ChatComponent] Failed to mark message as read:', error)
          });
      }
    });
  }

  getReadByCount(message: Message): number {
    if (!message.readBy) return 0;
    // Exclude the message sender from the read count
    const readers = Object.keys(message.readBy).filter(userId => userId !== message.userId);
    return readers.length;
  }

  getReadByUsernames(message: Message): string {
    if (!message.readBy) return '';
    // Exclude the message sender from the read count
    const readers = Object.keys(message.readBy).filter(userId => userId !== message.userId);
    const count = readers.length;
    return count > 0 ? `Read by ${count} ${count === 1 ? 'person' : 'people'}` : '';
  }

  /* ============================================================
   * EMOJI REACTIONS
   * ============================================================ */
  async onToggleReaction(message: Message, emoji: string): Promise<void> {
    if (!message.timestampMessageId) return;

    try {
      // Check if user already reacted with this emoji
      const currentReaction = message.reactions?.[this.currentUserId];

      if (currentReaction === emoji) {
        // Remove reaction (clicking same emoji)
        await this.chatService.removeReaction(message.messageId, this.groupId, message.timestampMessageId).toPromise();
      } else {
        // Add/change reaction (clicking different emoji)
        await this.chatService.addReaction(message.messageId, this.groupId, message.timestampMessageId, emoji).toPromise();
      }
    } catch (error) {
      console.error('[ChatComponent] Failed to toggle reaction:', error);
    }
  }

  getUserReaction(message: Message): string | null {
    return message.reactions?.[this.currentUserId] || null;
  }

  getReactionSummary(message: Message): { emoji: string; count: number }[] {
    if (!message.reactions) return [];

    const reactionCounts = new Map<string, number>();
    Object.values(message.reactions).forEach(emoji => {
      reactionCounts.set(emoji, (reactionCounts.get(emoji) || 0) + 1);
    });

    return Array.from(reactionCounts.entries()).map(([emoji, count]) => ({ emoji, count }));
  }

  /* ============================================================
   * DELETE MESSAGE
   * ============================================================ */
  async onDeleteMessage(message: Message): Promise<void> {
    if (!message.timestampMessageId) return;

    try {
      await this.chatService.deleteMessage(this.groupId, message.timestampMessageId).toPromise();
      // Message will be removed via subscription
    } catch (error) {
      console.error('[ChatComponent] Failed to delete message:', error);
    }
  }

  /* ============================================================
   * SUBSCRIPTIONS
   * ============================================================ */
  private subscribeToUpdates(): void {
    // Subscribe to new messages
    const messagesSub = this.chatService.subscribeToMessages(this.groupId).subscribe({
      next: (message) => {
        console.log('[ChatComponent] New message received:', message);

        // Check if message already exists
        const exists = this.messages.find(m => m.messageId === message.messageId);
        if (!exists) {
          this.messages.push(message);
          setTimeout(() => this.scrollToBottom(), 100);

          // Mark as read if not sent by current user
          if (message.userId !== this.currentUserId && message.timestampMessageId) {
            setTimeout(() => {
              this.chatService.markMessageRead(message.messageId, this.groupId, message.timestampMessageId!)
                .subscribe({
                  error: (error) => console.error('[ChatComponent] Failed to mark message as read:', error)
                });
            }, 1000);
          }
        }
      },
      error: (error) => console.error('[ChatComponent] Messages subscription error:', error)
    });

    // Subscribe to read receipts
    const readSub = this.chatService.subscribeToReadReceipts(this.groupId).subscribe({
      next: (updatedMessage) => {
        console.log('[ChatComponent] Read receipt received:', updatedMessage);
        const msg = this.messages.find(m => m.messageId === updatedMessage.messageId);
        if (msg) {
          msg.readBy = updatedMessage.readBy;
        }
      },
      error: (error) => console.error('[ChatComponent] Read receipts subscription error:', error)
    });

    // Subscribe to reactions
    const reactionsSub = this.chatService.subscribeToReactions(this.groupId).subscribe({
      next: (updatedMessage) => {
        console.log('[ChatComponent] Reaction update received:', updatedMessage);
        const msg = this.messages.find(m => m.messageId === updatedMessage.messageId);
        if (msg) {
          msg.reactions = updatedMessage.reactions;
        }
      },
      error: (error) => console.error('[ChatComponent] Reactions subscription error:', error)
    });

    // Subscribe to deleted messages
    const deleteSub = this.chatService.subscribeToDeletedMessages(this.groupId).subscribe({
      next: (deletedMessage) => {
        console.log('[ChatComponent] Message deleted:', deletedMessage);
        const index = this.messages.findIndex(m => m.messageId === deletedMessage.messageId);
        if (index !== -1) {
          this.messages.splice(index, 1);
        }
      },
      error: (error) => console.error('[ChatComponent] Delete subscription error:', error)
    });

    this.subscriptions.push(messagesSub, readSub, reactionsSub, deleteSub);
  }

  /* ============================================================
   * UTILITIES
   * ============================================================ */
  private scrollToBottom(): void {
    if (this.messageContainer?.nativeElement) {
      this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
    }
  }

  isOwnMessage(message: Message): boolean {
    return message.userId === this.currentUserId;
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
}
