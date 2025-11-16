import express from "express";
import ejs from "ejs";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

//  parse JSON
app.use(express.json());

app.use((req, res, next) => {
    const ip =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress;

    console.log(`Visitor IP: ${ip} | Path: ${req.method} ${req.originalUrl}`);
    next();
});

// Serve static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


app.get('/', (_, res) => {
    try {
        res.render('index', {
            title: 'homepage'

        });
    } catch (err) {
        console.error('Rendering error:', err);
        res.status(500).send('Error rendering template');
    }
});

app.get('/about', (_, res) => {
    try {
        res.render('about', { title: 'about' });
    } catch (err) {
        console.error('Rendering error:', err);
        res.status(500).send('Error rendering template');
    }
});

app.get('/NEWS', (_, res) => {
    try {
        res.render('NEWS', {
            title: 'NEWS'

        });
    } catch (err) {
        console.error('Rendering error:', err);
        res.status(500).send('Error rendering template');
    }
});

app.get('/Profile', (_, res) => {
    try {
        res.render('profile', {
            title: 'profile'

        });
    } catch (err) {
        console.error('Rendering error:', err);
        res.status(500).send('Error rendering template');
    }
});



app.post('/api/health-plan', async (req, res) => {
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
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            const errorData = await response.json();
            console.error('Gemini API Error Status:', response.status);
            console.error('Gemini API Error Details:', JSON.stringify(errorData, null, 2));
            throw new Error(`Gemini API failed: ${response.status} - ${JSON.stringify(errorData)}`);
        }


        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Health plan API error:', error);
        res.status(500).json({ error: error.message });
    }
});



app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        const fullPrompt = `You are a compassionate and supportive mental health assistant. Your role is to listen empathetically, provide emotional support, suggest healthy coping strategies, and encourage professional help when needed. Never provide medical diagnoses. Be warm, understanding, and patient. Keep responses concise (2-4 sentences) and supportive and try to give solution to the problems given.

User: ${message}

Response:`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    generationConfig: { temperature: 0.8, maxOutputTokens: 500 }
                })
            }
        );

        if (!response.ok) {
            throw new Error('Gemini API request failed');
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Chat API error:', error);
        res.status(500).json({ error: error.message });
    }
});


app.post("/api/ping", (req, res) => {
    const { visitorId } = req.body;

    const ip =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress;

   console.log(`
Visitor IP: ${ip}
Method: ${req.method}
Path: ${req.originalUrl}
User-Agent: ${req.headers["user-agent"]}
Time: ${new Date().toLocaleString()}
---------------------------
`);


    res.json({ logged: true });
});

app.listen(port, () => {
    console.log(`local app listening on port ${port}`);
});
