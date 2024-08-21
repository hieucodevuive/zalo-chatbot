import cryptojs from "crypto-js";
import crypto from "crypto";
import { appContext } from "./context.js";
import fs from "node:fs";
import sharp from "sharp";
import pako from "pako";
import SparkMD5 from "spark-md5";
import path from "path";

export function getSignKey(type, params) {
    const n = [];
    for (const s in params) {
        if (params.hasOwnProperty(s)) {
            n.push(s);
        }
    }

    n.sort();
    let a = "zsecure" + type;
    for (let s = 0; s < n.length; s++) a += params[n[s]];
    return cryptojs.MD5(a).toString();
}

export function makeURL(baseURL, params) {
    const url = new URL(baseURL);
    for (const key in params) {
        if (params.hasOwnProperty(key)) {
            url.searchParams.append(key, params[key]);
        }
    }
    return url.toString();
}

export class ParamsEncryptor {
    constructor({ type, imei, firstLaunchTime }) {
        this.enc_ver = "v2";
        this.zcid = null;
        this.encryptKey = null;

        this.createZcid(type, imei, firstLaunchTime);
        this.zcid_ext = ParamsEncryptor.randomString();
        this.createEncryptKey();
    }

    getEncryptKey() {
        if (!this.encryptKey) throw new Error("getEncryptKey: didn't create encryptKey yet");
        return this.encryptKey;
    }

    createZcid(type, imei, firstLaunchTime) {
        if (!type || !imei || !firstLaunchTime) throw new Error("createZcid: missing params");
        const msg = `${type},${imei},${firstLaunchTime}`;
        const s = ParamsEncryptor.encodeAES("3FC4F0D2AB50057BCE0D90D9187A22B1", msg, "hex", true);
        this.zcid = s;
    }

    createEncryptKey(e = 0) {
        const t = (e, t) => {
            const { even: n } = ParamsEncryptor.processStr(e);
            const { even: a, odd: s } = ParamsEncryptor.processStr(t);
            if (!n || !a || !s) return false;
            const i = n.slice(0, 8).join("") + a.slice(0, 12).join("") + s.reverse().slice(0, 12).join("");
            this.encryptKey = i;
            return true;
        };

        if (!this.zcid || !this.zcid_ext) throw new Error("createEncryptKey: zcid or zcid_ext is null");
        try {
            let n = cryptojs.MD5(this.zcid_ext).toString().toUpperCase();
            if (t(n, this.zcid) || e >= 3) return false;
            this.createEncryptKey(e + 1);
        } catch {
            if (e < 3) this.createEncryptKey(e + 1);
        }
        return true;
    }

    getParams() {
        return this.zcid
            ? {
                  zcid: this.zcid,
                  zcid_ext: this.zcid_ext,
                  enc_ver: this.enc_ver,
              }
            : null;
    }

    static processStr(e) {
        if (!e || typeof e !== "string") {
            return {
                even: null,
                odd: null,
            };
        }
        const [t, n] = [...e].reduce((e, t, n) => (e[n % 2].push(t), e), [[], []]);
        return {
            even: t,
            odd: n,
        };
    }

    static randomString(e = 6, t) {
        const n = e;
        const a = t && e && t > e ? t : 12;
        let s = Math.floor(Math.random() * (a - n + 1)) + n;
        if (s > 12) {
            let result = "";
            while (s > 0) {
                result += Math.random().toString(16).substr(2, s > 12 ? 12 : s);
                s -= 12;
            }
            return result;
        }
        return Math.random().toString(16).substr(2, s);
    }

    static encodeAES(e, message, type, uppercase, s = 0) {
        if (!message) return null;
        try {
            const encoder = type === "hex" ? cryptojs.enc.Hex : cryptojs.enc.Base64;
            const key = cryptojs.enc.Utf8.parse(e);

            const cfg = {
                words: [0, 0, 0, 0],
                sigBytes: 16,
            };
            const encrypted = cryptojs.AES.encrypt(message, key, {
                iv: cfg,
                mode: cryptojs.mode.CBC,
                padding: cryptojs.pad.Pkcs7,
            }).ciphertext.toString(encoder);

            return uppercase ? encrypted.toUpperCase() : encrypted;
        } catch {
            return s < 3 ? ParamsEncryptor.encodeAES(e, message, type, uppercase, s + 1) : null;
        }
    }
}

export function decryptResp(key, data) {
    let n = null;
    try {
        n = decodeRespAES(key, data);
        const parsed = JSON.parse(n);
        return parsed;
    } catch (error) {
        return n;
    }
}

function decodeRespAES(key, data) {
    data = decodeURIComponent(data);
    const parsedKey = cryptojs.enc.Utf8.parse(key);
    const n = {
        words: [0, 0, 0, 0],
        sigBytes: 16,
    };

    return cryptojs.AES.decrypt(
        {
            ciphertext: cryptojs.enc.Base64.parse(data),
        },
        parsedKey,
        {
            iv: n,
            mode: cryptojs.mode.CBC,
            padding: cryptojs.pad.Pkcs7,
        }
    ).toString(cryptojs.enc.Utf8);
}

export function decodeBase64ToBuffer(data) {
    return Buffer.from(data, "base64");
}

export function decodeUint8Array(data) {
    try {
        return new TextDecoder().decode(data);
    } catch (error) {
        return null;
    }
}

export function encodeAES(secretKey, data, t = 0) {
    try {
        const key = cryptojs.enc.Base64.parse(secretKey);
        return cryptojs.AES.encrypt(data, key, {
            iv: cryptojs.enc.Hex.parse("00000000000000000000000000000000"),
            mode: cryptojs.mode.CBC,
            padding: cryptojs.pad.Pkcs7,
        }).ciphertext.toString(cryptojs.enc.Base64);
    } catch (n) {
        return t < 3 ? encodeAES(secretKey, data, t + 1) : null;
    }
}

export function decodeAES(secretKey, data, t = 0) {
    try {
        data = decodeURIComponent(data);
        const key = cryptojs.enc.Base64.parse(secretKey);
        return cryptojs.AES.decrypt(
            {
                ciphertext: cryptojs.enc.Base64.parse(data),
            },
            key,
            {
                iv: cryptojs.enc.Hex.parse("00000000000000000000000000000000"),
                mode: cryptojs.mode.CBC,
                padding: cryptojs.pad.Pkcs7,
            }
        ).toString(cryptojs.enc.Utf8);
    } catch (n) {
        return t < 3 ? decodeAES(secretKey, data, t + 1) : null;
    }
}

function updateCookie(input) {
    if (!appContext.cookie) throw new Error("Cookie is not available");
    if (typeof input !== "string" && !Array.isArray(input)) return null;

    const cookieMap = new Map();
    const cookie = appContext.cookie;
    cookie.split(";").forEach((cookie) => {
        const [key, value] = cookie.split("=");
        cookieMap.set(key.trim(), value.trim());
    });

    let newCookie;
    if (Array.isArray(input)) {
        newCookie = input.map((cookie) => cookie.split(";")[0]).join("; ");
    } else {
        newCookie = input;
    }

    newCookie.split(";").forEach((cookie) => {
        // Kiểm tra nếu cookie chứa dấu "="
        if (cookie.includes("=")) {
            const [key, value] = cookie.split("=");
            cookieMap.set(key.trim(), value.trim());
        } else {
        }
    });
    

    return Array.from(cookieMap.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
}


export function getDefaultHeaders() {
    if (!appContext.cookie) throw new Error("Cookie is not available");
    if (!appContext.userAgent) throw new Error("User agent is not available");

    return {
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        "content-type": "application/x-www-form-urlencoded",
        Cookie: appContext.cookie,
        Origin: "https://chat.zalo.me",
        Referer: "https://chat.zalo.me/",
        "User-Agent": appContext.userAgent,
    };
}

export async function request(url, options) {
    if (options) options.headers = mergeHeaders(options.headers || {}, getDefaultHeaders());
    else options = { headers: getDefaultHeaders() };

    const response = await fetch(url, options);
    if (response.headers.has("set-cookie")) {
        const newCookie = updateCookie(response.headers.get("set-cookie"));
        if (newCookie) appContext.cookie = newCookie;
    }

    return response;
}

function mergeHeaders(headers, defaultHeaders) {
    return {
        ...defaultHeaders,
        ...headers,
    };
}

export async function getImageMetaData(filePath) {
    const fileData = await fs.promises.readFile(filePath);
    const imageData = await sharp(fileData).metadata();
    const fileName = path.basename(filePath);

    return {
        fileName,
        totalSize: imageData.size,
        width: imageData.width,
        height: imageData.height,
    };
}

export async function getFileSize(filePath) {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
}

export async function getGifMetaData(filePath) {
    const fileData = await fs.promises.readFile(filePath);
    const gifData = await sharp(fileData).metadata();
    const fileName = path.basename(filePath);

    return {
        fileName,
        totalSize: gifData.size,
        width: gifData.width,
        height: gifData.height,
    };
}

export async function decodeEventData(parsed, cipherKey) {
    if (!cipherKey) return;

    const eventData = parsed.data;
    const decodedEventDataBuffer = decodeBase64ToBuffer(decodeURIComponent(eventData));

    if (decodedEventDataBuffer.length >= 48) {
        const algorithm = {
            name: "AES-GCM",
            iv: decodedEventDataBuffer.subarray(0, 16),
            tagLength: 128,
            additionalData: decodedEventDataBuffer.subarray(16, 32),
        };
        const dataSource = decodedEventDataBuffer.subarray(32);

        const cryptoKey = await crypto.subtle.importKey("raw", decodeBase64ToBuffer(cipherKey), algorithm, false, [
            "decrypt",
        ]);
        const decryptedData = await crypto.subtle.decrypt(algorithm, cryptoKey, dataSource);
        const decompressedData = pako.inflate(decryptedData);
        const decodedData = decodeUint8Array(decompressedData);

        if (!decodedData) return;
        return JSON.parse(decodedData);
    }
}

export function getMd5LargeFileObject(filePath, fileSize) {
    return new Promise(async (resolve, reject) => {
        let chunkSize = 2097152, // Read in chunks of 2MB
            chunks = Math.ceil(fileSize / chunkSize),
            currentChunk = 0,
            spark = new SparkMD5.ArrayBuffer(),
            buffer = await fs.promises.readFile(filePath);

        function loadNext() {
            let start = currentChunk * chunkSize,
                end = start + chunkSize >= fileSize ? fileSize : start + chunkSize;

            spark.append(buffer.slice(start, end));
            currentChunk++;

            if (currentChunk < chunks) {
                loadNext();
            } else {
                resolve({
                    currentChunk,
                    data: spark.end(),
                });
            }
        }

        loadNext();
    });
}

export const logger = {
    verbose: (...args) => {
        console.log("\x1b[2mVERBOSE\x1b[0m", ...args);
    },
    info: (...args) => {
        console.log("\x1b[34mINFO\x1b[0m", ...args);
    },
    warn: (...args) => {
        console.log("\x1b[33mWARN\x1b[0m", ...args);
    },
    error: (...args) => {
        console.log("\x1b[31mERROR\x1b[0m", ...args);
    },
};

export function getClientMessageType(msgType) {
    if (msgType === "webchat") return 1;
    if (msgType === "chat.voice") return 31;
    if (msgType === "chat.photo") return 32;
    if (msgType === "chat.sticker") return 36;
    if (msgType === "chat.doodle") return 37;
    if (msgType === "chat.recommended") return 38;

    if (msgType === "chat.link") return 1; // don't know
    if (msgType === "chat.video.msg") return 44; // not sure

    if (msgType === "share.file") return 46;
    if (msgType === "chat.gif") return 49;
    if (msgType === "chat.location.new") return 43;

    return 1;
}

export function strPadLeft(e, t, n) {
    const a = (e = "" + e).length;
    return a === n ? e : a > n ? e.slice(-n) : t.repeat(n - a) + e;
}

export function getFullTimeFromMilisecond(ms) {
    let date = new Date(ms);
    return (
        strPadLeft(date.getHours(), "0", 2) +
        ":" +
        strPadLeft(date.getMinutes(), "0", 2) +
        " " +
        strPadLeft(date.getDate(), "0", 2) +
        "/" +
        strPadLeft(date.getMonth() + 1, "0", 2) +
        "/" +
        date.getFullYear()
    );
}

// Function to get the file extension from a file path
export function getFileExtension(filePath) {
    return path.extname(filePath).slice(1);
}

// Function to get the file name from a file path
export function getFileName(filePath) {
    return path.basename(filePath);
}

// Function to remove undefined keys from an object
export function removeUndefinedKeys(obj) {
    for (let key in obj) {
        if (obj[key] === undefined) {
            delete obj[key];
        }
    }
    return obj;
}
