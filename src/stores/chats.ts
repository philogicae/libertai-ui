import { v4 as uuidv4 } from 'uuid';
import { defineStore } from 'pinia';
import { chatTag } from 'src/utils/chat';
import idb from 'src/utils/idb';
import { chatsMigrations } from 'src/utils/migrations/chats';
import { Chat, ChatMigration, MessageAttachment, MinimalChat, UIMessage } from 'src/types/chats';
import { UIPersona } from 'src/types/personas';
import { LocalForage } from 'src/types/utils';

const CHATS_STORE_NAME = 'chats-store';
const CHATS_STORE_PINIA_KEY = 'chats-store-pinia-key';

/**
 * Representation of an attachment:
 * interface Attachment {
 *   // File type
 *   type: string;  // eg 'application/pdf', 'text/plain', etc.
 *   // File name
 *   name: string;
 *   // Document id within the embedding store, if stored there
 *   documentId: string?;
 *   // The content of the attachment, if stored inlined
 *   content: string?;
 * }
 */

// TODO: Search results are not yet implemented
/**
 * Representation of a search result:
 * interface SearchResult {
 *  // embedding document id
 *  documentId: string;
 *  // embedding content
 *  content: string;
 * }
 */

type ChatsStoreState = {
  version: number;
  chatsStore: ChatsStore;
  chats: MinimalChat[];
};

export const useChatsStore = defineStore(CHATS_STORE_PINIA_KEY, {
  state: (): ChatsStoreState => ({
    // Current version of the migrations
    version: 0, //  /!\ DO NOT UPDATE /!\, it should be done automatically when running migrations

    // Interface for our ChatsStore
    chatsStore: new ChatsStore(),
    // List of partials chats
    chats: [],
  }),
  persist: {
    paths: ['version'],
  },
  actions: {
    async load() {
      // Get the partial chats
      this.chats = await this.chatsStore.readChats();

      try {
        // Running migrations if needed
        if (this.version < chatsMigrations.length) {
          // Removing migrations already ran
          const migrationsToRun = chatsMigrations.slice(this.version);
          for (const migration of migrationsToRun) {
            await this.chatsStore.runMigration(migration);
          }
        }
        this.version = chatsMigrations.length;
      } catch (error) {
        console.error(`Chats: Running migrations starting from version ${this.version} failed: ${error}`);
      }
    },

    async readChat(id: string) {
      return await this.chatsStore.readChat(id);
    },

    async createChat(title: string, username: string, modelId: string, persona: UIPersona): Promise<Chat> {
      const chat = await this.chatsStore.createChat(title, username, [], modelId, persona);
      const tag = chatTag(chat.id);
      await this.chatsStore.pushChatTag(chat.id, tag);
      this.chats.push(chat);
      return chat;
    },

    async updateChatTitle(chatId: string, title: string) {
      await this.chatsStore.updateChat(chatId, { title });
      // Update the partial chats
      this.chats = this.chats.map((chat) => {
        if (chat.id === chatId) {
          chat.title = title;
        }
        return chat;
      });
    },

    async updateChatMessageContent(chatId: string, messageIndex: number, content: string) {
      const chat = await this.chatsStore.readChat(chatId);
      const messages = chat.messages;
      messages[messageIndex].content = content;
      await this.chatsStore.updateChat(chatId, { messages });
    },

    async popChatMessages(chatId: string) {
      return await this.chatsStore.popChatMessages(chatId);
    },

    async appendUserMessage(chatId: string, message: string, attachments?: MessageAttachment[]) {
      return await this.chatsStore.appendUserMessage(chatId, message, attachments);
    },

    async appendModelResponse(chatId: string, response: string, searchResults: any) {
      return await this.chatsStore.appendModelResponse(chatId, response, searchResults);
    },

    async deleteChat(chatId: string) {
      await this.chatsStore.deleteChat(chatId);
      this.chats = this.chats.filter((c) => c.id !== chatId);
    },
  },
});

class ChatsStore {
  private readonly store: LocalForage;

  constructor() {
    // Initialize the localforage store
    this.store = idb.createStore(CHATS_STORE_NAME);
  }

  async runMigration(migration: ChatMigration) {
    const updatedChats: Promise<Chat>[] = [];

    await this.store.iterate((currentChat: Chat) => {
      const newChat = migration(currentChat);
      updatedChats.push(idb.put(currentChat.id, newChat, this.store));
    });

    await Promise.all(updatedChats);
  }

  async createChat(title: string, username: string, tags: string[], modelId: string, persona: UIPersona) {
    const id = uuidv4();
    const chat: Chat = {
      id,
      title,
      tags,
      username,
      modelId,
      persona,
      messages: [],
      createdAt: new Date(),
    };
    return idb.put<Chat>(chat.id, chat, this.store);
  }

  async readChats(): Promise<MinimalChat[]> {
    const result: MinimalChat[] = [];
    await this.store.iterate((value: Chat) => {
      const chat = value;
      const partialChat = {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
      };
      result.push(partialChat);
    });
    // Sort the chats by creation date (descending)
    result.sort((a, b) => a.createdAt.valueOf() - b.createdAt.valueOf());
    return result;
  }

  async readChat(id: string): Promise<Chat> {
    const chat = await idb.get<Chat>(id, this.store);
    if (!chat) {
      throw new Error('Chat not found');
    }
    return chat;
  }

  async pushChatTag(chatId: string, tag: string) {
    const chat = await this.readChat(chatId);
    if (chat.tags.includes(tag)) {
      throw new Error('Tag already in chat');
    }
    chat.tags.push(tag);
    await idb.put(chatId, chat, this.store);
  }

  async updateChat(chatId: string, chat: Partial<Chat>) {
    const fullChat = await this.readChat(chatId);
    const updatedChat = { ...fullChat, ...chat };
    await idb.put(chatId, updatedChat, this.store);
  }

  async popChatMessages(chatId: string) {
    const chat = await this.readChat(chatId);
    chat.messages.pop();
    await idb.put(chatId, chat, this.store);
  }

  async appendUserMessage(chatId: string, messageContent: string, attachments?: MessageAttachment[]) {
    const chat = await this.readChat(chatId);
    const message: UIMessage = {
      author: 'user',
      role: chat.username,
      content: messageContent,
      timestamp: new Date(),
      attachments,
    };
    chat.messages.push(message);
    await idb.put(chatId, chat, this.store);
    return message;
  }

  async appendModelResponse(chatId: string, responseContent: string, searchResults: any) {
    const chat = await this.readChat(chatId);
    const message: UIMessage = {
      author: 'ai',
      role: chat.persona.role,
      content: responseContent,
      timestamp: new Date(),
      searchResults,
    };
    chat.messages.push(message);
    await idb.put(chatId, chat, this.store);
    return message;
  }

  async deleteChat(id: string) {
    await idb.rm(id, this.store);
  }
}
