import { appContext } from "../context.js";
import { API } from "../index.js";
import { decodeAES, encodeAES, request } from "../utils.js";

export function createGroupFactory(serviceURL, api) {
    /**
     * Create a new group
     *
     * @param {Object} options Group options
     * @param {string} [options.name] Group name
     * @param {string[]} options.members User IDs to add to the group
     * @param {string} [options.avatarPath] Path to the avatar image file
     */
    return async function createGroup(options) {
        if (!appContext.secretKey) throw new Error("Secret key is not available");
        if (!appContext.imei) throw new Error("IMEI is not available");
        if (!appContext.cookie) throw new Error("Cookie is not available");
        if (!appContext.userAgent) throw new Error("User agent is not available");

        if (options.members.length === 0) throw new Error("Group must have at least one member");

        const params = {
            clientId: Date.now(),
            gname: String(Date.now()),
            gdesc: null,
            members: options.members,
            membersTypes: options.members.map(() => -1),
            nameChanged: 0,
            createLink: 1,
            clientLang: appContext.language,
            imei: appContext.imei,
            zsource: 601,
        };

        if (options.name && options.name.length > 0) {
            params.gname = options.name;
            params.nameChanged = 1;
        }

        const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
        if (!encryptedParams) throw new Error("Failed to encrypt params");

        const response = await request(serviceURL + `&params=${encodeURIComponent(encryptedParams)}`, {
            method: "POST",
        });

        if (!response.ok) throw new Error("Failed to create group: " + response.statusText);

        const decoded = decodeAES(appContext.secretKey, (await response.json()).data);

        if (!decoded) throw new Error("Failed to decode message");

        let data = JSON.parse(decoded).data;

        if (options.avatarPath) await api.changeGroupAvatar(data.groupId, options.avatarPath);

        return data;
    };
}
