import { Injectable } from '@angular/core';
import { Observable, from, Observer } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';
import axios from 'axios';

export interface Message {
  messageId: string;
  groupId: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: string;
  timestampMessageId?: string;
  readBy?: { [userId: string]: string };
  reactions?: { [userId: string]: string };
}

export interface MessageConnection {
  items: Message[];
  nextToken?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private endpoint = environment.graphqlEndpoint;
  private wsConnections: Map<string, WebSocket> = new Map();

  constructor(private authService: AuthService) {}

  private parseMessage(message: any): Message {
    console.log('[ChatService.parseMessage] Raw message:', JSON.stringify(message, null, 2));

    // Ensure readBy and reactions are objects (handle both Map and JSON string formats)
    if (!message.readBy || typeof message.readBy === 'string') {
      try {
        message.readBy = typeof message.readBy === 'string' ? JSON.parse(message.readBy) : {};
      } catch (e) {
        message.readBy = {};
      }
    }
    if (!message.reactions || typeof message.reactions === 'string') {
      try {
        message.reactions = typeof message.reactions === 'string' ? JSON.parse(message.reactions) : {};
      } catch (e) {
        message.reactions = {};
      }
    }

    console.log('[ChatService.parseMessage] Parsed message:', JSON.stringify(message, null, 2));
    return message as Message;
  }

  private createAppSyncWebSocket(query: string, variables: any): Observable<any> {
    return new Observable((observer: Observer<any>) => {
      const token = this.authService.getIdToken();
      if (!token) {
        observer.error(new Error('No authentication token available'));
        return;
      }

      // Create WebSocket connection to AppSync realtime endpoint
      const realtimeUrl = this.endpoint
        .replace('https://', 'wss://')
        .replace('appsync-api', 'appsync-realtime-api');

      const header = {
        host: new URL(this.endpoint).host,
        Authorization: token
      };

      const encodedHeader = btoa(JSON.stringify(header));
      const payload = btoa(JSON.stringify({}));

      const wsUrl = `${realtimeUrl}?header=${encodedHeader}&payload=${payload}`;
      const ws = new WebSocket(wsUrl, ['graphql-ws']);

      const subscriptionId = Math.random().toString(36).substring(7);
      let connectionInitialized = false;

      ws.onopen = () => {
        console.log('[ChatService] WebSocket connected');
        // Send connection init message
        ws.send(JSON.stringify({ type: 'connection_init' }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'connection_ack') {
          console.log('[ChatService] Connection acknowledged');
          connectionInitialized = true;

          // Start subscription
          ws.send(JSON.stringify({
            id: subscriptionId,
            type: 'start',
            payload: {
              data: JSON.stringify({ query, variables }),
              extensions: {
                authorization: {
                  host: new URL(this.endpoint).host,
                  Authorization: token
                }
              }
            }
          }));
        } else if (message.type === 'data' && message.id === subscriptionId) {
          observer.next(message.payload);
        } else if (message.type === 'error') {
          console.error('[ChatService] WebSocket error:', message);
          console.error('[ChatService] Error payload:', JSON.stringify(message.payload, null, 2));
          observer.error(message);
        } else if (message.type === 'complete') {
          observer.complete();
        }
      };

      ws.onerror = (error) => {
        console.error('[ChatService] WebSocket error:', error);
        observer.error(error);
      };

      ws.onclose = () => {
        console.log('[ChatService] WebSocket closed');
        observer.complete();
      };

      // Cleanup function
      return () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            id: subscriptionId,
            type: 'stop'
          }));
          ws.close();
        }
      };
    });
  }

  private async graphqlRequest(query: string, variables: any): Promise<any> {
    const token = this.authService.getIdToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    console.log('[ChatService] GraphQL Request Query:', query);
    console.log('[ChatService] GraphQL Request Variables:', variables);

    const response = await axios.post(
      this.endpoint,
      { query, variables },
      {
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      console.error('[ChatService] GraphQL errors:', response.data.errors);
      throw new Error(response.data.errors[0].message);
    }

    return response.data.data;
  }

  /* ============================================================
   * QUERIES
   * ============================================================ */

  getMessages(groupId: string, limit: number = 50, nextToken?: string): Observable<MessageConnection> {
    const query =
      'query GetMessages($groupId: ID!, $limit: Int, $nextToken: String) {' +
      '  getMessages(groupId: $groupId, limit: $limit, nextToken: $nextToken) {' +
      '    items {' +
      '      messageId' +
      '      groupId' +
      '      userId' +
      '      userName' +
      '      message' +
      '      createdAt' +
      '      timestampMessageId' +
      '      readBy' +
      '      reactions' +
      '    }' +
      '    nextToken' +
      '  }' +
      '}';

    return from(
      this.graphqlRequest(query, { groupId, limit, nextToken })
        .then(data => {
          const connection = data.getMessages as MessageConnection;
          // Parse readBy and reactions for each message
          connection.items = connection.items.map(msg => this.parseMessage(msg));
          return connection;
        })
    );
  }

  /* ============================================================
   * MUTATIONS
   * ============================================================ */

  sendMessage(groupId: string, message: string): Observable<Message> {
    const mutation =
      'mutation SendMessage($groupId: ID!, $message: String!) {' +
      '  sendMessage(groupId: $groupId, message: $message) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return from(
      this.graphqlRequest(mutation, { groupId, message })
        .then(data => this.parseMessage(data.sendMessage))
    );
  }

  markMessageRead(messageId: string, groupId: string, timestampMessageId: string): Observable<Message> {
    const mutation =
      'mutation MarkMessageRead($messageId: ID!, $groupId: ID!, $timestampMessageId: String!) {' +
      '  markMessageRead(messageId: $messageId, groupId: $groupId, timestampMessageId: $timestampMessageId) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return from(
      this.graphqlRequest(mutation, { messageId, groupId, timestampMessageId })
        .then(data => this.parseMessage(data.markMessageRead))
    );
  }

  addReaction(messageId: string, groupId: string, timestampMessageId: string, emoji: string): Observable<Message> {
    const mutation =
      'mutation AddReaction($messageId: ID!, $groupId: ID!, $timestampMessageId: String!, $emoji: String!) {' +
      '  addReaction(messageId: $messageId, groupId: $groupId, timestampMessageId: $timestampMessageId, emoji: $emoji) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return from(
      this.graphqlRequest(mutation, { messageId, groupId, timestampMessageId, emoji })
        .then(data => this.parseMessage(data.addReaction))
    );
  }

  removeReaction(messageId: string, groupId: string, timestampMessageId: string): Observable<Message> {
    const mutation =
      'mutation RemoveReaction($messageId: ID!, $groupId: ID!, $timestampMessageId: String!) {' +
      '  removeReaction(messageId: $messageId, groupId: $groupId, timestampMessageId: $timestampMessageId) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return from(
      this.graphqlRequest(mutation, { messageId, groupId, timestampMessageId })
        .then(data => this.parseMessage(data.removeReaction))
    );
  }

  deleteMessage(groupId: string, timestampMessageId: string): Observable<Message> {
    const mutation =
      'mutation DeleteMessage($groupId: ID!, $timestampMessageId: String!) {' +
      '  deleteMessage(groupId: $groupId, timestampMessageId: $timestampMessageId) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return from(
      this.graphqlRequest(mutation, { groupId, timestampMessageId })
        .then(data => this.parseMessage(data.deleteMessage))
    );
  }

  /* ============================================================
   * SUBSCRIPTIONS
   * ============================================================ */

  subscribeToMessages(groupId: string): Observable<Message> {
    const subscription =
      'subscription OnMessageSent($groupId: ID!) {' +
      '  onMessageSent(groupId: $groupId) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return new Observable<Message>((observer: Observer<Message>) => {
      const sub = this.createAppSyncWebSocket(subscription, { groupId }).subscribe({
        next: (payload: any) => {
          if (payload.data?.onMessageSent) {
            observer.next(this.parseMessage(payload.data.onMessageSent));
          }
        },
        error: (err: any) => {
          console.error('[ChatService] Message subscription error:', err);
          observer.error(err);
        },
        complete: () => {
          observer.complete();
        }
      });

      return () => {
        sub.unsubscribe();
      };
    });
  }

  subscribeToReadReceipts(groupId: string): Observable<Message> {
    const subscription =
      'subscription OnMessageRead($groupId: ID!) {' +
      '  onMessageRead(groupId: $groupId) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return new Observable<Message>((observer: Observer<Message>) => {
      const sub = this.createAppSyncWebSocket(subscription, { groupId }).subscribe({
        next: (payload: any) => {
          if (payload.data?.onMessageRead) {
            observer.next(this.parseMessage(payload.data.onMessageRead));
          }
        },
        error: (err: any) => {
          console.error('[ChatService] Read receipt subscription error:', err);
          observer.error(err);
        },
        complete: () => {
          observer.complete();
        }
      });

      return () => {
        sub.unsubscribe();
      };
    });
  }

  subscribeToReactions(groupId: string): Observable<Message> {
    const subscription =
      'subscription OnReactionChanged($groupId: ID!) {' +
      '  onReactionChanged(groupId: $groupId) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return new Observable<Message>((observer: Observer<Message>) => {
      const sub = this.createAppSyncWebSocket(subscription, { groupId }).subscribe({
        next: (payload: any) => {
          if (payload.data?.onReactionChanged) {
            observer.next(this.parseMessage(payload.data.onReactionChanged));
          }
        },
        error: (err: any) => {
          console.error('[ChatService] Reaction subscription error:', err);
          observer.error(err);
        },
        complete: () => {
          observer.complete();
        }
      });

      return () => {
        sub.unsubscribe();
      };
    });
  }

  subscribeToDeletedMessages(groupId: string): Observable<Message> {
    const subscription =
      'subscription OnMessageDeleted($groupId: ID!) {' +
      '  onMessageDeleted(groupId: $groupId) {' +
      '    messageId' +
      '    groupId' +
      '    userId' +
      '    userName' +
      '    message' +
      '    createdAt' +
      '    timestampMessageId' +
      '    readBy' +
      '    reactions' +
      '  }' +
      '}';

    return new Observable<Message>((observer: Observer<Message>) => {
      const sub = this.createAppSyncWebSocket(subscription, { groupId }).subscribe({
        next: (payload: any) => {
          if (payload.data?.onMessageDeleted) {
            observer.next(this.parseMessage(payload.data.onMessageDeleted));
          }
        },
        error: (err: any) => {
          console.error('[ChatService] Delete subscription error:', err);
          observer.error(err);
        },
        complete: () => {
          observer.complete();
        }
      });

      return () => {
        sub.unsubscribe();
      };
    });
  }
}
