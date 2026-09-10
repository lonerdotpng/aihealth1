import express from "express";
import ejs from "ejs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// =====================================================
// ENVIRONMENT VARIABLES
// =====================================================

const MONGODB_URI = process.env.MONGODB_URI;

// Support both names so your existing Vercel variable
// GEMINI_AI_KEY will also work.
const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY || process.env.GEMINI_AI_KEY;

if (!MONGODB_URI) {
    console.error("ERROR: MONGODB_URI is not configured.");
}

if (!GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is not configured.");
}

// =====================================================
// MONGODB SETUP
// =====================================================

let client;
let db;
let visitorsCollection;
let chatCollection;
let dbConnectionPromise = null;

async function connectDB() {
    if (visitorsCollection && chatCollection) {
        return;
    }

    if (!MONGODB_URI) {
        throw new Error("MONGODB_URI environment variable is missing.");
    }

    // Prevent multiple simultaneous connections
    if (!dbConnectionPromise) {
        dbConnectionPromise = (async () => {
            client = new MongoClient(MONGODB_URI);

            await client.connect();

            console.log("MongoDB connected successfully");

            db = client.db("healthvisor");

            visitorsCollection = db.collection("visitors");
            chatCollection = db.collection("chat_history");

            return db;
        })().catch((error) => {
            dbConnectionPromise = null;
            throw error;
        });
    }

    await dbConnectionPromise;
}

async function getVisitorsDB() {
    await connectDB();
    return visitorsCollection;
}

async function getChatDB() {
    await connectDB();
    return chatCollection;
}

// =====================================================
// EXPRESS CONFIGURATION
// =====================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// EJS
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Static assets (serve files from /public at the web root, e.g., /assets/* -> public/assets/*)
app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// IP LOGGING MIDDLEWARE
// =====================================================

app.use(async (req, res, next) => {
    const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";

    // Don't log ping requests
    if (req.originalUrl === "/api/ping") {
        return next();
    }

    // Don't log API requests
    if (req.originalUrl.startsWith("/api")) {
        return next();
    }

    // Don't log static files
    const skipPatterns = [
        /^\/.*assets/,
        /^\/.*favicon\.ico$/,
        /^\/\.well-known/,
        /\.(png|jpg|jpeg|svg|gif|css|js|webp|json|txt|ico|woff|woff2|ttf)$/i
    ];

    if (skipPatterns.some((pattern) => pattern.test(req.originalUrl))) {
        return next();
    }

    try {
        const logsCollection = await getVisitorsDB();

        await logsCollection.insertOne({
            ip,
            path: `${req.method} ${req.originalUrl}`,
            userAgent: req.headers["user-agent"] || "unknown",
            timestamp: new Date()
        });

        console.log(
            `Logged: ${ip} | ${req.method} ${req.originalUrl}`
        );
    } catch (error) {
        // Don't crash the website if visitor logging fails
        console.error("Visitor logging error:", error);
    }

    next();
});

// =====================================================
// PAGES
// =====================================================

app.get("/", (req, res) => {
    res.render("index", {
        title: "homepage"
    });
});

app.get("/about", (req, res) => {
    res.render("about", {
        title: "about"
    });
});

app.get("/NEWS", (req, res) => {
    res.render("NEWS", {
        title: "NEWS"
    });
});

app.get("/Profile", (req, res) => {
    res.render("profile", {
        title: "profile"
    });
});

// =====================================================
// GEMINI HELPER
// =====================================================

async function callGemini(prompt, maxOutputTokens = 2048) {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key is not configured.");
    }

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Gemini API response:", data);

        throw new Error(
            data?.error?.message || "Gemini API request failed"
        );
    }

    return data;
}

// =====================================================
// HEALTH PLAN API
// =====================================================

app.post("/api/health-plan", async (req, res) => {
    try {
        const { disease, additionalInfo } = req.body;

        if (!disease) {
            return res.status(400).json({
                error: "Disease is required."
            });
        }

        // Ask the model to return a strict JSON object describing the plan
        const prompt = `
You are an assistant that outputs a JSON object (no extra text) describing a concise, evidence-based health management plan for a patient.

Input:
- Condition: ${disease}
${additionalInfo ? `- Additional context: ${additionalInfo}` : ''}

Requirements:
- Return ONLY a single JSON object. Do NOT include any explanatory text, code fences, or commentary.
- The JSON object MUST have the following keys:
  "overview": array of short strings (1-2 sentences) summarizing the plan,
  "diet_plan": array of short strings (diet recommendations),
  "exercise_recommendations": array of short strings,
  "lifestyle_advice": array of short strings,
  "important_considerations": array of short strings,
  "metrics": an object with "labels" (array of strings) and "values" (array of numbers) suitable for rendering a pie chart to show relative focus (values should sum to about 100),
  "summary": a single short string (optional).

Make each bullet concise (1-2 sentences). Ensure the metrics reflect realistic emphasis between diet, exercise, lifestyle, medication, or other relevant categories. Output the JSON only.
`;

        // If Gemini key is not configured, return a helpful demo plan so the UI can be previewed locally
        if (!GEMINI_API_KEY) {
            console.warn('GEMINI_API_KEY not set — returning demo plan');
            const demoPlan = {
                overview: [
                    'Short-term: stabilize blood sugar with diet and exercise',
                    'Long-term: weight reduction and regular monitoring to reduce complications'
                ],
                diet_plan: [
                    'Breakfast: Oatmeal with berries and a serving of protein (e.g., Greek yogurt)',
                    'Lunch: Grilled lean protein, large salad with mixed greens and olive oil dressing',
                    'Dinner: Steamed vegetables, small portion of whole grains, and lean protein',
                    'Limit sugary beverages and refined carbs; choose high-fiber foods'
                ],
                exercise_recommendations: [
                    'At least 150 minutes/week moderate aerobic activity (e.g., brisk walking)',
                    'Two sessions per week of resistance training focusing on major muscle groups',
                    'Include daily light activity breaks to reduce sedentary time'
                ],
                lifestyle_advice: [
                    'Aim for 7-9 hours of sleep nightly and maintain consistent sleep times',
                    'Manage stress with mindfulness or short breathing exercises',
                    'Stay hydrated and track food intake for awareness'
                ],
                important_considerations: [
                    'Monitor blood glucose as advised by your clinician',
                    'Discuss medication adjustments with your healthcare provider',
                    'Seek immediate care if experiencing symptoms of very high or very low blood sugar'
                ],
                metrics: {
                    labels: ['Diet', 'Exercise', 'Lifestyle', 'Medication'],
                    values: [40, 30, 20, 10]
                },
                summary: 'A balanced approach focusing on diet and regular activity will help control blood sugar and reduce long-term risks.'
            };

            return res.json({ plan: demoPlan });
        }

        const data = await callGemini(prompt, 2048);

        // Extract the text produced by Gemini
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return res.status(500).json({ error: 'No response from language model' });
        }

        // Try to parse JSON text
        try {
            const plan = JSON.parse(text);
            return res.json({ plan });
        } catch (parseError) {
            // If parsing fails, return raw text so client can fall back to previous formatter
            console.error('Failed to parse model output as JSON:', parseError);
            return res.json({ planText: text });
        }
    } catch (error) {
        console.error("Health plan API error:", error);

        res.status(500).json({
            error: error.message || "Failed to generate health plan."
        });
    }
});

// =====================================================
// CHAT API
// =====================================================

app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                error: "Message is required."
            });
        }

        const fullPrompt = `
You are a compassionate and supportive mental health assistant.

Your role is to:
- Listen empathetically.
- Provide emotional support.
- Suggest healthy coping strategies.
- Encourage professional help when appropriate.
- Never provide medical diagnoses.
- Be warm, understanding, and patient.
- Keep responses concise, around 2-4 sentences.
- Try to give practical solutions to the user's problem.

User:
${message}

Response:
`;

        const data = await callGemini(fullPrompt, 500);

        // Save chat history
        try {
            const chatDB = await getChatDB();

            await chatDB.insertOne({
                userMessage: message,
                botResponse: data,
                timestamp: new Date()
            });
        } catch (dbError) {
            // Don't prevent the user from receiving the AI response
            console.error("Chat history database error:", dbError);
        }

        res.json(data);
    } catch (error) {
        console.error("Chat API error:", error);

        res.status(500).json({
            error: error.message || "Failed to process chat."
        });
    }
});

// =====================================================
// CHAT HISTORY
// =====================================================

app.get("/api/chat-history", async (req, res) => {
    try {
        const chatDB = await getChatDB();

        const history = await chatDB
            .find({})
            .sort({ _id: -1 })
            .limit(50)
            .toArray();

        res.json(history);
    } catch (error) {
        console.error("History fetch error:", error);

        res.status(500).json({
            error: "Failed to fetch chat history."
        });
    }
});

// =====================================================
// PING
// =====================================================

app.get("/api/ping", (req, res) => {
    res.json({
        ok: true,
        message: "HealthVisor API is running"
    });
});

// Some clients issue POST to /api/ping (e.g., health checks). Accept POST too to avoid 404s.
app.post("/api/ping", (req, res) => {
    res.json({
        ok: true,
        message: "HealthVisor API is running"
    });
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
    console.error("Unhandled Express error:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        error: "Internal server error"
    });
});

// =====================================================
// LOCAL DEVELOPMENT
// =====================================================

// Vercel uses the exported Express app.
// Only start a local server when NOT running on Vercel.

if (process.env.VERCEL !== "1") {
    const port = process.env.PORT || 3000;

    app.listen(port, () => {
        console.log(`HealthVisor running at http://localhost:${port}`);
    });
}

// =====================================================
// VERCEL EXPORT
// =====================================================

export default app;