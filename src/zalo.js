import { getOwnId } from "./apis/getOwnId.js";
import { ListenerBase } from "./apis/listen.js";
import { getServerInfo, login } from "./apis/login.js";
import { appContext } from "./context.js";
import { makeURL } from "./utils.js";

import { addReactionFactory } from "./apis/addReaction.js";
import { addUserToGroupFactory } from "./apis/addUserToGroup.js";
import { changeGroupAvatarFactory } from "./apis/changeGroupAvatar.js";
import { changeGroupNameFactory } from "./apis/changeGroupName.js";
import { createGroupFactory } from "./apis/createGroup.js";
import { findUserFactory } from "./apis/findUser.js";
import { getGroupInfoFactory } from "./apis/getGroupInfo.js";
import { getStickersFactory } from "./apis/getStickers.js";
import { getStickersDetailFactory } from "./apis/getStickersDetail.js";
import { removeUserFromGroupFactory } from "./apis/removeUserFromGroup.js";
import { sendMessageFactory } from "./apis/sendMessage.js";
import { sendMessageAttachmentFactory } from "./apis/sendMessageAttachment.js";
import { sendStickerFactory } from "./apis/sendSticker.js";
import { undoFactory } from "./apis/undo.js";
import { uploadAttachmentFactory } from "./apis/uploadAttachment.js";

export class Zalo {
    static API_TYPE = 30;
    static API_VERSION = 637;

    constructor(credentials, options) {
        this.enableEncryptParam = true;
        this.listenerOptions = options;

        this.validateParams(credentials);

        appContext.imei = credentials.imei;
        appContext.cookie = this.parseCookies(credentials.cookie);
        appContext.userAgent = credentials.userAgent;
        appContext.language = credentials.language || "vi";

        appContext.secretKey = null;
    }

    parseCookies(cookie) {
        if (typeof cookie === "string") return cookie;

        return cookie.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }

    validateParams(credentials) {
        if (!credentials.imei || !credentials.cookie || !credentials.userAgent) {
            throw new Error("Missing required params");
        }
    }

    async login() {
        const loginData = await login(this.enableEncryptParam);
        const serverInfo = await getServerInfo(this.enableEncryptParam);

        if (!loginData || !serverInfo) throw new Error("Failed to login");

        appContext.secretKey = loginData.data.zpw_enk;
        appContext.uid = loginData.data.uid;

        appContext.settings = serverInfo.setttings || serverInfo.settings;
        return new API(
            appContext.secretKey,
            loginData.data.zpw_service_map_v3,
            makeURL(`${loginData.data.zpw_ws[0]}`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
                t: Date.now(),
            }),
            this.listenerOptions
        );
    }
}

export class API {
    constructor(secretKey, zpwServiceMap, wsUrl, options) {
        this.secretKey = secretKey;
        this.zpwServiceMap = zpwServiceMap;
        this.listener = new ListenerBase(wsUrl, options);
        this.sendMessage = sendMessageFactory(this);
        this.addReaction = addReactionFactory(
            makeURL(`${zpwServiceMap.reaction[0]}/api/message/reaction`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
        this.getOwnId = getOwnId;
        this.getStickers = getStickersFactory(
            makeURL(`${zpwServiceMap.sticker}/api/message/sticker`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
        this.getStickersDetail = getStickersDetailFactory(
            makeURL(`${zpwServiceMap.sticker}/api/message/sticker`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
        this.sendSticker = sendStickerFactory(this);
        this.findUser = findUserFactory(
            makeURL(`${zpwServiceMap.friend[0]}/api/friend/profile/get`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
        this.uploadAttachment = uploadAttachmentFactory(`${zpwServiceMap.file[0]}/api`, this);
        this.sendMessageAttachment = sendMessageAttachmentFactory(`${zpwServiceMap.file[0]}/api`, this);
        this.undo = undoFactory();
        this.getGroupInfo = getGroupInfoFactory(
            makeURL(`${zpwServiceMap.group[0]}/api/group/getmg-v2`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
        this.createGroup = createGroupFactory(
            makeURL(`${zpwServiceMap.group[0]}/api/group/create/v2`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            }),
            this
        );
        this.changeGroupAvatar = changeGroupAvatarFactory(
            makeURL(`${zpwServiceMap.file[0]}/api/group/upavatar`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
        this.removeUserFromGroup = removeUserFromGroupFactory(
            makeURL(`${zpwServiceMap.group[0]}/api/group/kickout`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
        this.addUserToGroup = addUserToGroupFactory(
            makeURL(`${zpwServiceMap.group[0]}/api/group/invite/v2`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
        this.changeGroupName = changeGroupNameFactory(
            makeURL(`${zpwServiceMap.group[0]}/api/group/updateinfo`, {
                zpw_ver: Zalo.API_VERSION,
                zpw_type: Zalo.API_TYPE,
            })
        );
    }
}
