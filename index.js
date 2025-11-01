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

// Serve static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');



app.get('/', (_, res) => {
    try {
        res.render('index', {
            title: 'homepage',
            GEMINI_API_KEY: process.env.GEMINI_API_KEY
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
            title: 'NEWS',

            NEWS_API_KEY: process.env.NEWS_API_KEY
        });
    } catch (err) {
        console.error('Rendering error:', err);
        res.status(500).send('Error rendering template');
    }
});

app.listen(port, () => {
    console.log(`local app listening on port ${port}`);
});
