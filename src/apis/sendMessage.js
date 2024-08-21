import { appContext } from "../context.js";
import { API, Zalo } from "../index.js";
import { decodeAES, encodeAES, getClientMessageType, makeURL, request } from "../utils.js";
import { Message, GroupMessage, MessageType  } from "../models/Message.js";

function prepareQMSGAttach(quote) {
    const quoteData = quote.data;
    if (typeof quoteData.content === "string") return quoteData.propertyExt;
    if (quoteData.msgType === "chat.todo")
        return {
            properties: {
                color: 0,
                size: 0,
                type: 0,
                subType: 0,
                ext: '{"shouldParseLinkOrContact":0}',
            },
        };

    return {
        ...quoteData.content,
        thumbUrl: quoteData.content.thumb,
        oriUrl: quoteData.content.href,
        normalUrl: quoteData.content.href,
    };
}

function prepareQMSG(quote) {
    const quoteData = quote.data;
    if (quoteData.msgType === "chat.todo" && typeof quoteData.content !== "string") {
        return JSON.parse(quoteData.content.params).item.content;
    }

    return "";
}

export function sendMessageFactory(api) {
    const directMessageServiceURL = makeURL(`${api.zpwServiceMap.chat[0]}/api/message`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
        nretry: 0,
    });
    const groupMessageServiceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
        nretry: 0,
    });

    /**
     * Send a message to a thread
     *
     * @param {string} message Message content
     * @param {string} threadId Group or user ID
     * @param {number} [type=MessageType.DirectMessage] Message type (DirectMessage or GroupMessage)
     * @param {Message|GroupMessage} [quote] Message or GroupMessage instance (optional), used for quoting
     * @returns {Promise<string>} Response data
     */
    return async function sendMessage(
        message,
        threadId,
        type = MessageType.DirectMessage,
        quote
    ) {
        if (!appContext.secretKey) throw new Error("Secret key is not available");
        if (!appContext.imei) throw new Error("IMEI is not available");
        if (!appContext.cookie) throw new Error("Cookie is not available");
        if (!appContext.userAgent) throw new Error("User agent is not available");

        if (!message) throw new Error("Missing message");
        if (!threadId) throw new Error("Missing threadId");

        const isValidInstance = quote instanceof Message || quote instanceof GroupMessage;
        if (quote && !isValidInstance) throw new Error("Invalid quote message");
        const isGroupMessage = type === MessageType.GroupMessage;
        const quoteData = quote?.data;

        if (quoteData) {
            if (typeof quoteData.content !== "string" && quoteData.msgType === "webchat") {
                throw new Error("This kind of `webchat` quote type is not available");
            }

            if (quoteData.msgType === "group.poll") {
                throw new Error("The `group.poll` quote type is not available");
            }
        }

        const params = quote
            ? {
                  toid: isGroupMessage ? undefined : threadId,
                  grid: isGroupMessage ? threadId : undefined,
                  message: message,
                  clientId: Date.now(),
                  qmsgOwner: quoteData.uidFrom,
                  qmsgId: quoteData.msgId,
                  qmsgCliId: quoteData.cliMsgId,
                  qmsgType: getClientMessageType(quoteData.msgType),
                  qmsgTs: quoteData.ts,
                  qmsg: typeof quoteData.content === "string" ? quoteData.content : prepareQMSG(quote),
                  imei: isGroupMessage ? undefined : appContext.imei,
                  visibility: isGroupMessage ? 0 : undefined,
                  qmsgAttach: isGroupMessage ? JSON.stringify(prepareQMSGAttach(quote)) : undefined,
                  qmsgTTL: quoteData.ttl,
                  ttl: 0,
              }
            : {
                  message: message,
                  clientId: Date.now(),
                  imei: appContext.imei,
                  ttl: 0,
                  toid: isGroupMessage ? undefined : threadId,
                  grid: isGroupMessage ? threadId : undefined,
              };

        for (const key in params) {
            if (params[key] === undefined) delete params[key];
        }

        const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
        if (!encryptedParams) throw new Error("Failed to encrypt message");

        const finalServiceUrl = new URL(isGroupMessage ? groupMessageServiceURL : directMessageServiceURL);
        finalServiceUrl.pathname = finalServiceUrl.pathname + (quote ? "/quote" : `/${isGroupMessage ? "sendmsg" : "sms"}`);

        const response = await request(finalServiceUrl.toString(), {
            method: "POST",
            body: new URLSearchParams({
                params: encryptedParams,
            }),
        });

        if (!response.ok) throw new Error("Failed to send message: " + response.statusText);

        return decodeAES(appContext.secretKey, (await response.json()).data);
    };
}
