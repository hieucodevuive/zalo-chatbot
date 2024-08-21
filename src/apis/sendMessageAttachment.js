import FormData from "form-data";
import fs from "fs";
import sharp from "sharp";
import { appContext } from "../context.js";
import { API, Zalo } from "../index.js";
import { MessageType } from "../models/Message.js";
import {
    decodeAES,
    encodeAES,
    getFileExtension,
    getFileName,
    getGifMetaData,
    getMd5LargeFileObject,
    makeURL,
    removeUndefinedKeys,
    request,
} from "../utils.js";

const urlType = {
    image: "photo_original/send?",
    gif: "gif?",
    video: "asyncfile/msg?",
    others: "asyncfile/msg?",
};

async function upthumb(filePath, url) {
    let formData = new FormData();
    let buffer = await sharp(filePath).png().toBuffer();
    formData.append("fileContent", buffer, {
        filename: "blob",
        contentType: "image/png",
    });

    const params = {
        clientId: Date.now(),
        imei: appContext.imei,
    };

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new Error("Failed to encrypt message");

    let response = await request(
        makeURL(url + "upthumb?", {
            zpw_ver: Zalo.API_VERSION,
            zpw_type: Zalo.API_TYPE,
            params: encryptedParams,
        }),
        {
            method: "POST",
            headers: formData.getHeaders(),
            body: formData.getBuffer(),
        }
    );

    if (!response.ok) throw new Error("Failed to upload thumbnail: " + response.statusText);
    let resDecode = decodeAES(appContext.secretKey, (await response.json()).data);
    if (!resDecode) throw new Error("Failed to decode thumbnail");
    if (!JSON.parse(resDecode).data) {
        throw new Error("Failed to upload file");
    }

    return JSON.parse(resDecode).data;
}

export function sendMessageAttachmentFactory(serviceURL, api) {
    const url = {
        [MessageType.GroupMessage]: `${serviceURL}/group/`,
        [MessageType.DirectMessage]: `${serviceURL}/message/`,
    };

    function getGroupLayoutId() {
        return Date.now();
    }

    /**
     * Send a message with attachments
     *
     * @param {string} message Message content
     * @param {string[]} filePaths Paths to the files
     * @param {string} threadId Group ID or user ID
     * @param {number} [type=MessageType.DirectMessage] Message type (DirectMessage or GroupMessage)
     */
    return async function sendMessageAttachment(
        message,
        filePaths,
        threadId,
        type = MessageType.DirectMessage
    ) {
        if (!appContext.secretKey) throw new Error("Secret key is not available");
        if (!appContext.imei) throw new Error("IMEI is not available");
        if (!appContext.cookie) throw new Error("Cookie is not available");
        if (!appContext.userAgent) throw new Error("User agent is not available");

        if (!message) throw new Error("Missing message");
        if (!filePaths || filePaths.length === 0) throw new Error("Missing file paths");
        if (!threadId) throw new Error("Missing threadId");

        const firstExtFile = getFileExtension(filePaths[0]);
        const isMutilFileType = filePaths.some(e => getFileExtension(e) !== firstExtFile);
        const isGroupMessage = type === MessageType.GroupMessage;

        if (isMutilFileType || firstExtFile === "gif") {
            await api.sendMessage(message, threadId, type);
            message = "";
        }

        const gifFiles = filePaths.filter(e => getFileExtension(e) === "gif");
        filePaths = filePaths.filter(e => getFileExtension(e) !== "gif");

        const uploadAttachment = await api.uploadAttachment(filePaths, threadId, type);

        const attachmentsData = [];
        let indexInGroupLayout = uploadAttachment.length - 1;

        const groupLayoutId = getGroupLayoutId();

        const isMultiFile = filePaths.length > 1;
        let clientId = Date.now();
        for (const attachment of uploadAttachment) {
            let data;
            switch (attachment.fileType) {
                case "image": {
                    data = {
                        fileType: attachment.fileType,
                        params: {
                            photoId: attachment.photoId,
                            clientId: (clientId++).toString(),
                            desc: message,
                            width: attachment.width,
                            height: attachment.height,
                            toid: isGroupMessage ? undefined : String(threadId),
                            grid: isGroupMessage ? String(threadId) : undefined,
                            rawUrl: attachment.normalUrl,
                            hdUrl: attachment.hdUrl,
                            thumbUrl: attachment.thumbUrl,
                            oriUrl: isGroupMessage ? attachment.normalUrl : undefined,
                            normalUrl: isGroupMessage ? undefined : attachment.normalUrl,
                            thumbSize: "9815",
                            fileSize: String(attachment.totalSize),
                            hdSize: String(attachment.totalSize),
                            zsource: -1,
                            ttl: 0,

                            groupLayoutId: isMultiFile ? groupLayoutId : undefined,
                            isGroupLayout: isMultiFile ? 1 : undefined,
                            idInGroup: isMultiFile ? indexInGroupLayout-- : undefined,
                            totalItemInGroup: isMultiFile ? uploadAttachment.length : undefined,
                        },
                        body: new URLSearchParams(),
                    };
                    break;
                }

                case "video": {
                    data = {
                        fileType: attachment.fileType,
                        params: {
                            fileId: attachment.fileId,
                            checksum: attachment.checksum,
                            checksumSha: "",
                            extention: getFileExtension(attachment.fileName),
                            totalSize: attachment.totalSize,
                            fileName: attachment.fileName,
                            clientId: attachment.clientFileId,
                            fType: 1,
                            fileCount: 0,
                            fdata: "{}",
                            toid: isGroupMessage ? undefined : String(threadId),
                            grid: isGroupMessage ? String(threadId) : undefined,
                            fileUrl: attachment.fileUrl,
                            zsource: -1,
                            ttl: 0,
                        },
                        body: new URLSearchParams(),
                    };
                    break;
                }

                case "others": {
                    data = {
                        fileType: attachment.fileType,
                        params: {
                            fileId: attachment.fileId,
                            checksum: attachment.checksum,
                            checksumSha: "",
                            extention: getFileExtension(attachment.fileName),
                            totalSize: attachment.totalSize,
                            fileName: attachment.fileName,
                            clientId: attachment.clientFileId,
                            fType: 1,
                            fileCount: 0,
                            fdata: "{}",
                            toid: isGroupMessage ? undefined : String(threadId),
                            grid: isGroupMessage ? String(threadId) : undefined,
                            fileUrl: attachment.fileUrl,
                            zsource: -1,
                            ttl: 0,
                        },
                        body: new URLSearchParams(),
                    };
                    break;
                }
            }

            removeUndefinedKeys(data.params);
            const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(data.params));
            if (!encryptedParams) throw new Error("Failed to encrypt message");

            data.body.append("params", encryptedParams);
            attachmentsData.push(data);
        }

        for (const gif of gifFiles) {
            const _upthumb = await upthumb(gif, url[MessageType.DirectMessage]);
            const gifData = await getGifMetaData(gif);

            const formData = new FormData();
            formData.append("chunkContent", await fs.promises.readFile(gif), {
                filename: getFileName(gif),
                contentType: "application/octet-stream",
            });

            const params = {
                clientId: Date.now().toString(),
                fileName: gifData.fileName,
                totalSize: gifData.totalSize,
                width: gifData.width,
                height: gifData.height,
                msg: message,
                type: 1,
                ttl: 0,
                visibility: isGroupMessage ? 0 : undefined,
                toid: isGroupMessage ? undefined : threadId,
                grid: isGroupMessage ? threadId : undefined,
                thumb: _upthumb.url,
                checksum: (await getMd5LargeFileObject(gif, gifData.totalSize)).data,
                totalChunk: 1,
                chunkId: 1,
            };

            removeUndefinedKeys(params);
            const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
            if (!encryptedParams) throw new Error("Failed to encrypt message");

            attachmentsData.push({
                query: {
                    params: encryptedParams,
                    type: "1",
                },
                body: formData.getBuffer(),
                headers: formData.getHeaders(),
                fileType: "gif",
            });
        }

        let requests = [];
        let results = [];

        for (const data of attachmentsData) {
            const requestOptions = {
                method: "POST",
                body: data.body,
                headers: data.fileType === "gif" ? data.headers : {},
            };

            requests.push(
                request(
                    makeURL(
                        url[type] + urlType[data.fileType],
                        Object.assign(
                            {
                                zpw_ver: Zalo.API_VERSION,
                                zpw_type: Zalo.API_TYPE,
                                nretry: "0",
                            },
                            data.query || {}
                        )
                    ),
                    requestOptions
                ).then(async (response) => {
                    if (!response.ok) throw new Error("Failed to send message: " + response.statusText);

                    let resDecode = decodeAES(appContext.secretKey, (await response.json()).data);
                    if (!resDecode) throw new Error("Failed to decode message");
                    results.push(JSON.parse(resDecode));
                })
            );
        }

        await Promise.all(requests);

        return results;
    };
}
