import { appContext } from "../context.js";
import { decodeAES, encodeAES, request } from "../utils.js";

export function getGroupInfoFactory(serviceURL) {
    /**
     * Get group information
     *
     * @param {string|string[]} groupId Group ID or list of group IDs
     */
    return async function getGroupInfo(groupId) {
        if (!appContext.secretKey) throw new Error("Secret key is not available");
        if (!appContext.imei) throw new Error("IMEI is not available");
        if (!appContext.cookie) throw new Error("Cookie is not available");
        if (!appContext.userAgent) throw new Error("User agent is not available");

        if (!Array.isArray(groupId)) groupId = [groupId];

        let params = {
            gridVerMap: {},
        };

        for (const id of groupId) {
            params.gridVerMap[id] = 0;
        }

        params.gridVerMap = JSON.stringify(params.gridVerMap);

        const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
        if (!encryptedParams) throw new Error("Failed to encrypt message");

        const response = await request(serviceURL, {
            method: "POST",
            body: new URLSearchParams({
                params: encryptedParams,
            }),
        });

        if (!response.ok) throw new Error("Failed to send message: " + response.statusText);

        const decoded = decodeAES(appContext.secretKey, (await response.json()).data);

        if (!decoded) throw new Error("Failed to decode message");

        return JSON.parse(decoded).data;
    };
}
