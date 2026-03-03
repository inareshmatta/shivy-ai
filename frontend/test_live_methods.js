import { GoogleGenAI } from "@google/genai";
import fs from "fs";

async function run() {
    try {
        const env = fs.readFileSync("../backend/.env", "utf8");
        const match = env.match(/GEMINI_API_KEY=(.+)/);
        const apiKey = match ? match[1].trim() : "";
        if (!apiKey) throw new Error("No API key");

        const ai = new GoogleGenAI({ apiKey: apiKey });

        // Use a dummy callback to store the session once it connects
        let sessionObj = null;

        const geminiSession = await ai.live.connect({
            model: "gemini-2.0-flash-exp",
            callbacks: {
                onopen: function () {
                    console.log("Connected.");
                    // In the callback, if we have sessionObj mapped or 'this'
                    setTimeout(() => {
                        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(geminiSession)).filter(p => typeof geminiSession[p] === 'function');
                        console.log("METHODS:", methods);
                        process.exit(0);
                    }, 500);
                },
                onerror: (e) => {
                    console.log("Error:", e);
                    process.exit(1);
                }
            }
        });
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
