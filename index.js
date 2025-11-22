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
const port = process.env.PORT || 3000;




// ------------------ MONGODB SETUP ------------------
const client = new MongoClient(process.env.MONGODB_URI);

let visitorsCollection = null;
let chatCollection = null;

async function connectDB() {
    if (visitorsCollection && chatCollection) return;

    try {
        await client.connect();
        console.log("MongoDB connected on Vercel");

        const db = client.db("healthvisor");

        visitorsCollection = db.collection("visitors");
        chatCollection = db.collection("chat_history");

    } catch (err) {
        console.error("MongoDB connection error:", err);
        throw err;
    }
}

async function getVisitorsDB() {
    await connectDB();
    return visitorsCollection;
}

async function getChatDB() {
    await connectDB();
    return chatCollection;
}









// ------------------ IP LOGGING MIDDLEWARE ------------------
app.use(async (req, res, next) => {
    const ip =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress;

    // hide ping
    if (req.originalUrl === "/api/ping") return next();

    // hide all API routes
    if (req.originalUrl.startsWith("/api")) return next();

    // hide static assets
    const skipPatterns = [
        /^\/assets/,
        /^\/favicon\.ico$/,
        /^\/\.well-known/,
        /\.(png|jpg|jpeg|svg|gif|css|js|webp|json|txt)$/i
    ];
    if (skipPatterns.some(p => p.test(req.originalUrl))) return next();

    try {
        const logsCollection = await getVisitorsDB();

        await logsCollection.insertOne({
            ip,
            path: `${req.method} ${req.originalUrl}`,
            userAgent: req.headers["user-agent"],
            timestamp: new Date().toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata"
            })
        });

        console.log(`Logged: ${ip} | ${req.method} ${req.originalUrl}`);
    } catch (err) {
        console.error("DB Insert Error:", err);
    }

    next();
});



// ------------------ EXPRESS CONFIG ------------------

app.use(express.json());

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// ------------------ ROUTES ------------------

app.get("/", (_, res) => {
    res.render("index", { title: "homepage" });
});

app.get("/about", (_, res) => {
    res.render("about", { title: "about" });
});

app.get("/NEWS", (_, res) => {
    res.render("NEWS", { title: "NEWS" });
});

app.get("/Profile", (_, res) => {
    res.render("profile", { title: "profile" });
});

// -------------- API ENDPOINTS ------------------

app.post("/api/health-plan", async (req, res) => {
    try {
        const { disease, additionalInfo } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        const prompt = `Please provide a comprehensive health management plan for someone with ${disease} and make the output short and crisp.
${additionalInfo ? `Additional context: ${additionalInfo}` : ''}

IMPORTANT: Use bullet points with asterisks for all items under each section. Add as many bullet points as necessary to thoroughly cover the topic.

Structure your response EXACTLY like this (no intro text, start directly):

Overview
* First point about the overview
* Second point about overview
* Continue adding more points as needed for comprehensive coverage

Diet Plan
* First dietary recommendation
* Second dietary recommendation
* Third dietary recommendation
* Continue adding more points as needed

Exercise Recommendations
* First exercise suggestion
* Second exercise suggestion
* Third exercise suggestion
* Continue adding more points as needed

Lifestyle Advice
* First lifestyle recommendation
* Second lifestyle recommendation
* Third lifestyle recommendation
* Continue adding more points as needed

Important Considerations
* First important point
* Second important point
* Third important point
* Continue adding more points as needed

Rules:
- Use ONLY asterisk (*) for bullet points, not dashes or dots
- Keep each bullet point concise (1-2 sentences max)
- Add as many bullet points as necessary but keep the output short - no limit, be thorough
- NO paragraphs, ONLY bullet lists under each section
- NO intro text at the beginning`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error("Gemini API request failed");
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Health plan API error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        const fullPrompt = `You are a compassionate and supportive mental health assistant. Your role is to listen empathetically, provide emotional support, suggest healthy coping strategies, and encourage professional help when needed. Never provide medical diagnoses. Be warm, understanding, and patient. Keep responses concise (2-4 sentences) and supportive and try to give solution to the problems given.

User: ${message}

Response:`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 500
                    }
                })
            }
        );

        if (!response.ok) throw new Error("Gemini API error");

        const data = await response.json();
      


  const chatDB = await getChatDB();
        await chatDB.insertOne({
            userMessage: message,
            botResponse: data,
            timestamp: new Date()
        });


    
        res.json(data);

    } catch (error) {
        console.error("Chat API error:", error);
        res.status(500).json({ error: error.message });
    }
});


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
        res.status(500).json({ error: "Failed to fetch chat history" });
    }
});



app.post("/api/ping", (req, res) => {
    res.json({ ok: true });
});




// ------------------ START SERVER ------------------

app.listen(port, () => {
    console.log(`local app listening on port ${port}`);
});
