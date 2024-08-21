import fs from "fs";
import { Zalo } from "../index.js";
import { MessageType } from "../models/Message.js";

// Read and parse the cookies from the JSON file
const cookies = JSON.parse(fs.readFileSync("./src/examples/cookies.json", "utf-8"));

const zalo = new Zalo({
    cookie: cookies,
    imei: "592dcc7b-4946-4066-a8f0-a9d619e5c5e2-f529a32073a22388a8370c39e9b93c86", // Replace with your actual IMEI
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36", // Replace with your actual User-Agent string
});

async function main() {
    try {
        // Log in to the Zalo API
        const api = await zalo.login();
        const { listener } = api;

        // Listen for incoming messages
        listener.on("message", (message) => {
            const isDirectMessage = message.type === MessageType.DirectMessage;
            // Handle direct messages that are not from the bot itself
            if (isDirectMessage && !message.isSelf && typeof message.data.content === "string") {
                const scriptions = {
                    "xin chào": "Ezpics xin chào bạn!",
                    "bạn tên là gì": "Tôi là chatbot Ezpics!"
                }

                const defaultMessage = "Tôi có thể giúp gì được cho bạn";

                // Kiểm tra xem tin nhắn có nằm trong scriptions hay không
                const response = scriptions[message.data.content] || defaultMessage;
                console.log(`Tin nhắn từ ${message.data.dName}: ${message.data.content}`);
                api.sendMessage(response, message.threadId, message.type, message);
            }
        });

        // Log when the listener is connected
        listener.onConnected(() => {
            console.log("Kết nối thành công đến Zalo");
        });

        // Log when the listener is closed
        listener.onClosed(() => {
            console.log("Closed");
        });

        // Handle any errors
        listener.onError((error) => {
            console.error("Error:", error);
        });

        // Start the listener
        listener.start();
    } catch (error) {
        console.error("Failed to initialize Zalo bot:", error);
    }
}

// Execute the main function
main();
