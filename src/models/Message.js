import { appContext } from "../context.js";

// MessageType Enum
export const MessageType = {
    DirectMessage: 0,
    GroupMessage: 1,
};

// Message Class
export class Message {
    constructor(data) {
        this.type = MessageType.DirectMessage;
        this.data = data;
        this.threadId = data.uidFrom === "0" ? data.idTo : data.uidFrom;
        this.isSelf = data.uidFrom === "0";

        if (data.idTo === "0") data.idTo = appContext.uid;
        if (data.uidFrom === "0") data.uidFrom = appContext.uid;
    }
}

// GroupMessage Class
export class GroupMessage {
    constructor(data) {
        this.type = MessageType.GroupMessage;
        this.data = data;
        this.threadId = data.idTo;
        this.isSelf = data.uidFrom === "0";

        if (data.uidFrom === "0") data.uidFrom = appContext.uid;
    }
}
