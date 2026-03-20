// ─── Iframe Bridge ─────────────────────────────────────────
// Parent-side bridge API for communicating with the visual edit
// script running inside the preview iframe via postMessage.
//
// The in-iframe script is injected by the API server's preview proxy
// (see services/api/src/visual-edit-bridge-inline.ts). This module
// provides the **parent-side** helpers that the React hook (useVisualEdit)
// and other editor components use to send commands to the iframe and
// listen for events coming back.

import type {
  IframeToBridgeMessage,
  BridgeToParentMessage,
  SelectedElement,
} from "./types";

// ─── Types ──────────────────────────────────────────────────

export type ElementSelectedCallback = (element: SelectedElement) => void;
export type ElementHoveredCallback = (element: SelectedElement | null) => void;
export type ElementDeselectedCallback = () => void;
export type BridgeReadyCallback = () => void;
export type ParentSelectedCallback = (element: SelectedElement) => void;

export interface IframeBridgeCallbacks {
  onReady?: BridgeReadyCallback;
  onElementSelected?: ElementSelectedCallback;
  onElementHovered?: ElementHoveredCallback;
  onElementDeselected?: ElementDeselectedCallback;
  onParentSelected?: ParentSelectedCallback;
}

// ─── Bridge Class ───────────────────────────────────────────

export class IframeBridge {
  private iframe: HTMLIFrameElement | null = null;
  private callbacks: IframeBridgeCallbacks = {};
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private _ready = false;

  get ready(): boolean {
    return this._ready;
  }

  /** Attach to an iframe and start listening for messages. */
  attach(iframe: HTMLIFrameElement, callbacks: IframeBridgeCallbacks): void {
    this.detach(); // Clean up any previous attachment

    this.iframe = iframe;
    this.callbacks = callbacks;

    this.messageHandler = (event: MessageEvent) => {
      const msg = event.data as BridgeToParentMessage;
      if (!msg || !msg.type || !msg.type.startsWith("visual-edit:")) return;

      switch (msg.type) {
        case "visual-edit:ready":
          this._ready = true;
          this.callbacks.onReady?.();
          break;
        case "visual-edit:element-selected":
          this.callbacks.onElementSelected?.(msg.element);
          break;
        case "visual-edit:element-hovered":
          this.callbacks.onElementHovered?.(msg.element);
          break;
        case "visual-edit:element-deselected":
          this.callbacks.onElementDeselected?.();
          break;
        case "visual-edit:parent-selected":
          this.callbacks.onParentSelected?.(msg.element);
          break;
      }
    };

    window.addEventListener("message", this.messageHandler);
  }

  /** Detach from the iframe and stop listening. */
  detach(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.iframe = null;
    this.callbacks = {};
    this._ready = false;
  }

  // ─── Commands sent to the iframe ──────────────────────────

  private send(message: IframeToBridgeMessage): void {
    if (!this.iframe?.contentWindow) return;
    this.iframe.contentWindow.postMessage(message, "*");
  }

  /** Enable visual selection mode in the iframe. */
  enableSelection(): void {
    this.send({ type: "visual-edit:enable-selection" });
  }

  /** Disable visual selection mode in the iframe. */
  disableSelection(): void {
    this.send({ type: "visual-edit:disable-selection" });
  }

  /** Navigate selection to the parent of the currently selected element. */
  selectParent(): void {
    this.send({ type: "visual-edit:select-parent" });
  }

  /** Deselect the currently selected element. */
  deselect(): void {
    this.send({ type: "visual-edit:deselect" });
  }

  /** Apply a live CSS style change to the selected element in the iframe. */
  applyStyleChange(property: string, value: string): void {
    this.send({ type: "visual-edit:apply-style", property, value });
  }

  /** Apply a live text content change to the selected element in the iframe. */
  applyTextChange(text: string): void {
    this.send({ type: "visual-edit:apply-text", text });
  }

  /** Revert all pending live changes in the iframe to their original values. */
  revertChanges(): void {
    this.send({ type: "visual-edit:revert-changes" });
  }

  /**
   * Highlight and select an element by CSS selector.
   * The in-iframe bridge script will find the element by querySelector,
   * show the selection overlay, and send back element-selected info.
   */
  highlightElement(selector: string): void {
    this.send({ type: "visual-edit:highlight-element", selector });
  }

  // ─── Convenience callbacks ────────────────────────────────

  /** Register a callback for element selection events. */
  onElementSelected(callback: ElementSelectedCallback): void {
    this.callbacks.onElementSelected = callback;
  }

  /** Register a callback for element hover events. */
  onElementHovered(callback: ElementHoveredCallback): void {
    this.callbacks.onElementHovered = callback;
  }
}

// ─── Singleton ──────────────────────────────────────────────

/** Shared bridge instance for the editor. */
export const iframeBridge = new IframeBridge();
