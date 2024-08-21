import FormData from "form-data";
import fs from "fs";
import path from "path";
import { appContext } from "../context.js";
import { API, Zalo } from "../index.js";
import { MessageType } from "../models/Message.js";
import {
    decodeAES,
    encodeAES,
    getFileSize,
    getImageMetaData,
    getMd5LargeFileObject,
    makeURL,
    request,
} from "../utils.js";

const urlType = {
    image: "photo_original/upload",
    video: "asyncfile/upload",
    others: "asyncfile/upload",
};

/**
 * Upload an attachment to a thread
 *
 * @param {string[]} filePaths Path to the file
 * @param {string} threadId Group or user ID
 * @param {MessageType} [type=MessageType.DirectMessage] Message type (DirectMessage or GroupMessage)
 * @returns {Promise<UploadAttachmentType[]>} Uploaded attachment details
 */
export function uploadAttachmentFactory(serviceURL, api) {
    return async function uploadAttachment(filePaths, threadId, type = MessageType.DirectMessage) {
        if (!appContext.secretKey) throw new Error("Secret key is not available");
        if (!appContext.imei) throw new Error("IMEI is not available");
        if (!appContext.cookie) throw new Error("Cookie is not available");
        if (!appContext.userAgent) throw new Error("User agent is not available");

        if (!filePaths || filePaths.length === 0) throw new Error("Missing filePaths");
        if (!threadId) throw new Error("Missing threadId");

        const chunkSize = appContext.settings.features.sharefile.chunk_size_file;
        const isGroupMessage = type === MessageType.GroupMessage;
        let attachmentsData = [];
        let url = `${serviceURL}/${isGroupMessage ? "group" : "message"}/`;
        const query = {
            zpw_ver: Zalo.API_VERSION,
            zpw_type: Zalo.API_TYPE,
            type: isGroupMessage ? "11" : "2",
        };

        let clientId = Date.now();
        for (const filePath of filePaths) {
            if (!fs.existsSync(filePath)) throw new Error("File not found");

            const extFile = path.extname(filePath).slice(1);
            const fileName = path.basename(filePath);

            const data = {
                filePath,
                chunkContent: [],
                params: {},
            };

            if (isGroupMessage) data.params.grid = threadId;
            else data.params.toid = threadId;

            switch (extFile) {
                case "jpg":
                case "jpeg":
                case "png":
                case "webp":
                    let imageData = await getImageMetaData(filePath);

                    data.fileData = imageData;
                    data.fileType = "image";

                    data.params.totalChunk = Math.ceil(data.fileData.totalSize / chunkSize);
                    data.params.fileName = fileName;
                    data.params.clientId = clientId++;
                    data.params.totalSize = imageData.totalSize;
                    data.params.imei = appContext.imei;
                    data.params.isE2EE = 0;
                    data.params.jxl = 0;
                    data.params.chunkId = 1;

                    break;
                case "mp4":
                    let videoSize = await getFileSize(filePath);

                    data.fileType = "video";
                    data.fileData = {
                        fileName,
                        totalSize: videoSize,
                    };

                    data.params.totalChunk = Math.ceil(data.fileData.totalSize / chunkSize);
                    data.params.fileName = fileName;
                    data.params.clientId = clientId++;
                    data.params.totalSize = videoSize;
                    data.params.imei = appContext.imei;
                    data.params.isE2EE = 0;
                    data.params.jxl = 0;
                    data.params.chunkId = 1;

                    break;
                default:
                    const fileSize = await getFileSize(filePath);

                    data.fileType = "others";
                    data.fileData = {
                        fileName,
                        totalSize: fileSize,
                    };

                    data.params.totalChunk = Math.ceil(data.fileData.totalSize / chunkSize);
                    data.params.fileName = fileName;
                    data.params.clientId = clientId++;
                    data.params.totalSize = fileSize;
                    data.params.imei = appContext.imei;
                    data.params.isE2EE = 0;
                    data.params.jxl = 0;
                    data.params.chunkId = 1;

                    break;
            }

            const fileBuffer = await fs.promises.readFile(filePath);
            for (let i = 0; i < data.params.totalChunk; i++) {
                const formData = new FormData();
                const slicedBuffer = fileBuffer.slice(i * chunkSize, (i + 1) * chunkSize);
                formData.append("chunkContent", slicedBuffer, {
                    filename: fileName,
                    contentType: "application/octet-stream",
                });

                data.chunkContent[i] = formData;
            }
            attachmentsData.push(data);
        }

        const requests = [];
        const results = [];

        for (const data of attachmentsData) {
            for (let i = 0; i < data.params.totalChunk; i++) {
                const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(data.params));
                if (!encryptedParams) throw new Error("Failed to encrypt message");

                requests.push(
                    request(makeURL(url + urlType[data.fileType], Object.assign(query, { params: encryptedParams })), {
                        method: "POST",
                        headers: data.chunkContent[i].getHeaders(),
                        body: data.chunkContent[i].getBuffer(),
                    }).then(async (response) => {
                        if (!response.ok) throw new Error("Failed to send message: " + response.statusText);

                        let resDecode = decodeAES(appContext.secretKey, (await response.json()).data);
                        if (!resDecode) throw new Error("Failed to decode message");
                        const resData = JSON.parse(resDecode);
                        if (!resData.data) throw new Error("Failed to upload attachment: " + resData.error);

                        if (resData.data.fileId !== -1) {
                            await new Promise((resolve) => {
                                if (data.fileType === "video" || data.fileType === "others") {
                                    const uploadCallback = async (wsData) => {
                                        let result = {
                                            fileType: data.fileType,
                                            ...JSON.parse(resDecode).data,
                                            ...wsData,
                                            totalSize: data.fileData.totalSize,
                                            fileName: data.fileData.fileName,
                                            checksum: (
                                                await getMd5LargeFileObject(data.filePath, data.fileData.totalSize)
                                            ).data,
                                        };
                                        results.push(result);
                                        resolve();
                                    };

                                    appContext.uploadCallbacks.set(resData.data.fileId, uploadCallback);
                                }

                                if (data.fileType === "image") {
                                    let result = {
                                        fileType: "image",
                                        width: data.fileData.width,
                                        height: data.fileData.height,
                                        totalSize: data.fileData.totalSize,
                                        hdSize: data.fileData.totalSize,
                                        ...JSON.parse(resDecode).data,
                                    };
                                    results.push(result);
                                    resolve();
                                }
                            });
                        }
                    }),
                );
                data.params.chunkId++;
            }
        }

        await Promise.all(requests);

        return results;
    };
}
