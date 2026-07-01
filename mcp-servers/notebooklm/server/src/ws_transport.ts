
import { JSONRPCMessage, JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { WebSocket, WebSocketServer } from "ws";

/**
 * Server transport for WebSocket: this will send/receive messages over a WebSocket connection.
 */
export class WebSocketServerTransport implements Transport {
    private _socket: WebSocket;

    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;

    constructor(socket: WebSocket) {
        this._socket = socket;

        this._socket.on("close", () => {
            this.onclose?.();
        });

        this._socket.on("error", (error) => {
            this.onerror?.(error);
        });

        this._socket.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                // Validate against schema, though we might trust it for perf or just simplistic check
                // Ideally use JSONRPCMessageSchema.safeParse(message)
                const parsed = JSONRPCMessageSchema.safeParse(message);
                if (parsed.success) {
                    this.onmessage?.(parsed.data);
                } else {
                    console.error("Invalid JSON-RPC message:", parsed.error);
                    this.onerror?.(new Error("Invalid JSON-RPC message"));
                }
            } catch (error) {
                console.error("Failed to parse message:", error);
                this.onerror?.(error as Error);
            }
        });
    }

    async start(): Promise<void> {
        // Already connected if passed a socket
    }

    async close(): Promise<void> {
        this._socket.close();
    }

    async send(message: JSONRPCMessage): Promise<void> {
        this._socket.send(JSON.stringify(message));
    }
}
