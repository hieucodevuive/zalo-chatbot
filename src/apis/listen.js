import EventEmitter from "events";
import WebSocket from "ws";
import { appContext } from "../context.js";
import { GroupMessage, Message } from "../models/Message.js";
import { decodeEventData } from "../utils.js";

class ListenerBase extends EventEmitter {
    constructor(url, options = { selfListen: false }) {
        super();
        if (!appContext.cookie) throw new Error("Cookie is not available");
        if (!appContext.userAgent) throw new Error("User agent is not available");

        this.options = options;
        this.url = url;
        this.cookie = appContext.cookie;
        this.userAgent = appContext.userAgent;

        this.onConnectedCallback = () => {};
        this.onClosedCallback = () => {};
        this.onErrorCallback = () => {};
        this.onMessageCallback = () => {};
    }

    onConnected(cb) {
        this.onConnectedCallback = cb;
    }

    onClosed(cb) {
        this.onClosedCallback = cb;
    }

    onError(cb) {
        this.onErrorCallback = cb;
    }

    onMessage(cb) {
        this.onMessageCallback = cb;
    }

    start() {
        const ws = new WebSocket(this.url, {
            headers: {
                "accept-encoding": "gzip, deflate, br, zstd",
                "accept-language": "en-US,en;q=0.9",
                "cache-control": "no-cache",
                connection: "Upgrade",
                host: new URL(this.url).host,
                origin: "https://chat.zalo.me",
                prgama: "no-cache",
                "sec-websocket-extensions": "permessage-deflate; client_max_window_bits",
                "sec-websocket-version": "13",
                upgrade: "websocket",
                "user-agent": this.userAgent,
                cookie: this.cookie,
            },
        });

        ws.onopen = () => {
            this.onConnectedCallback();
            this.emit("connected");
        };

        ws.onclose = () => {
            this.onClosedCallback();
            this.emit("closed");
        };

        ws.onmessage = async (event) => {
            const { data } = event;
            if (!(data instanceof Buffer)) return;

            const encodedHeader = data.subarray(0, 4);
            const [n, cmd, s] = getHeader(encodedHeader); // n, cmd, s are header values

            try {
                const dataToDecode = data.subarray(4);
                const decodedData = new TextDecoder("utf-8").decode(dataToDecode);
                if (decodedData.length === 0) return;

                const parsed = JSON.parse(decodedData);

                if (n === 1 && cmd === 1 && s === 1 && parsed.hasOwnProperty("key")) {
                    this.cipherKey = parsed.key;
                }

                if (n === 1 && cmd === 501 && s === 0) {
                    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
                    const { msgs } = parsedData;
                    for (const msg of msgs) {
                        const messageObject = new Message(msg);
                        if (messageObject.isSelf && !this.options.selfListen) continue;
                        this.onMessageCallback(messageObject);
                        this.emit("message", messageObject);
                    }
                }

                if (n === 1 && cmd === 521 && s === 0) {
                    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
                    const { groupMsgs } = parsedData;
                    for (const msg of groupMsgs) {
                        const messageObject = new GroupMessage(msg);
                        if (messageObject.isSelf && !this.options.selfListen) continue;
                        this.onMessageCallback(messageObject);
                        this.emit("message", messageObject);
                    }
                }

                if (n === 1 && cmd === 601 && s === 0) {
                    const parsedData = (await decodeEventData(parsed, this.cipherKey)).data;
                    const { controls } = parsedData;
                    for (const control of controls) {
                        const data = {
                            fileUrl: control.content.data.url,
                            fileId: control.content.fileId,
                        };

                        const uploadCallback = appContext.uploadCallbacks.get(String(control.content.fileId));
                        if (uploadCallback) uploadCallback(data);
                        appContext.uploadCallbacks.delete(String(control.content.fileId));

                        this.emit("upload_attachment", data);
                    }
                }
            } catch (error) {
                this.onErrorCallback(error);
                this.emit("error", error);
            }
        };
    }
}

function getHeader(buffer) {
    if (buffer.byteLength < 4) {
        throw new Error("Invalid header");
    }

    return [buffer[0], buffer.readUInt16LE(1), buffer[3]];
}

export { ListenerBase };
