import { appContext } from "../context.js";
import { decodeAES, encodeAES, makeURL, request } from "../utils.js";

/**
 * Get stickers by keyword
 *
 * @param {string} keyword Keyword to search for
 * @returns {Promise<number[]>} Sticker IDs
 */
export function getStickersFactory(serviceURL) {
    return async function getStickers(keyword) {
        if (!appContext.secretKey) throw new Error("Secret key is not available");
        if (!appContext.imei) throw new Error("IMEI is not available");
        if (!appContext.cookie) throw new Error("Cookie is not available");
        if (!appContext.userAgent) throw new Error("User agent is not available");

        if (!keyword) throw new Error("Missing keyword");

        const params = {
            keyword: keyword,
            gif: 1,
            guggy: 0,
            imei: appContext.imei,
        };

        const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
        if (!encryptedParams) throw new Error("Failed to encrypt message");

        const finalServiceUrl = new URL(serviceURL);
        finalServiceUrl.pathname = finalServiceUrl.pathname + "/suggest/stickers";

        const response = await request(
            makeURL(finalServiceUrl.toString(), {
                params: encryptedParams,
            }),
        );

        if (!response.ok) throw new Error("Failed to get stickers: " + response.statusText);

        const rawSuggestions = decodeAES(appContext.secretKey, (await response.json()).data);
        if (!rawSuggestions) throw new Error("Failed to decrypt message");

        const suggestions = JSON.parse(rawSuggestions).data;
        const stickerIds = [];

        // @TODO: Implement these
        // suggestions.sugg_guggy, suggestions.sugg_gif
        if (suggestions.sugg_sticker) {
            suggestions.sugg_sticker.forEach((sticker) => stickerIds.push(sticker.sticker_id));
        }

        return stickerIds;
    };
}
