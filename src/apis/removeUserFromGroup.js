import { appContext } from "../context.js";
import { encodeAES, request } from "../utils.js";

/**
 * Remove user from existing group
 *
 * @param {string} serviceURL URL of the service endpoint
 * @returns {Function} Function to remove users from the group
 */
export function removeUserFromGroupFactory(serviceURL) {
    /**
     * Remove user from existing group
     *
     * @param {string} groupId Group ID
     * @param {string|string[]} members User ID or list of user IDs to remove
     * @returns {Promise<Object>} Response data
     */
    return async function removeUserFromGroup(groupId, members) {
        if (!appContext.secretKey) throw new Error("Secret key is not available");
        if (!appContext.imei) throw new Error("IMEI is not available");
        if (!appContext.cookie) throw new Error("Cookie is not available");
        if (!appContext.userAgent) throw new Error("User agent is not available");

        if (!Array.isArray(members)) members = [members];

        const params = {
            grid: groupId,
            members: members,
            imei: appContext.imei,
        };

        const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
        if (!encryptedParams) throw new Error("Failed to encrypt params");

        const response = await request(serviceURL, {
            method: "POST",
            body: new URLSearchParams({
                params: encryptedParams,
            }),
        });

        if (!response.ok) throw new Error("Failed to remove user from group: " + response.statusText);

        return (await response.json()).data;
    };
}
