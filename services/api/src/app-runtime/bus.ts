/**
 * In-process event bus for CDC + topics (FULLSTACK_RUNTIME Phase 1).
 * Interface-stable for a later Redis Streams backend (DOABLE_APP_BUS).
 */

import { EventEmitter } from "node:events";
import type { ChangeEvent } from "./types.js";

type Handler = (payload: unknown) => void;

class AppRuntimeBus {
  private ee = new EventEmitter();

  constructor() {
    this.ee.setMaxListeners(200);
  }

  cdcChannel(projectId: string): string {
    return `proj:${projectId}:cdc`;
  }

  topicChannel(projectId: string, topic: string): string {
    return `proj:${projectId}:topic:${topic}`;
  }

  publish(channel: string, payload: unknown): void {
    this.ee.emit(channel, payload);
  }

  subscribe(channel: string, handler: Handler): () => void {
    this.ee.on(channel, handler);
    return () => this.ee.off(channel, handler);
  }

  publishCdc(event: ChangeEvent): void {
    this.publish(this.cdcChannel(event.projectId), event);
  }

  publishTopic(projectId: string, topic: string, payload: unknown): void {
    this.publish(this.topicChannel(projectId, topic), {
      topic,
      payload,
      ts: new Date().toISOString(),
    });
  }

  /** Test helper — wipe listeners. */
  __reset(): void {
    this.ee.removeAllListeners();
  }
}

export const appBus = new AppRuntimeBus();
