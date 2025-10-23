import express from "express";
import ejs from "ejs";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use('/assets', express.static('assets'));

app.get('/', (_, res) => {
  res.send("/home to view the homepage");
})

app.get('/home', (_, res) => {
  ejs.renderFile('views/index.ejs', { 
    title: 'homepage',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY 
  }, (err, str) => {
    if (err) {
      res.status(500).send('Error rendering template');
    } else {
      res.send(str);
    }
  });
});

app.get('/about', (_, res) => {
  ejs.renderFile('views/about.ejs', { title: 'about' }, (err, str) => {
    if (err) {
      res.status(500).send('Error rendering template');
    } else {
      res.send(str);
    }
  });
});

app.get('/:slug', (req, res) => {
  ejs.renderFile('views/404.ejs', {}, (err, str) => {
    if (err) {
      res.status(500).send('Error ');
    } else {
      res.status(404).send(str);
    }
  });
});

app.listen(port, () => {
  console.log(`local app listening on port ${port}`);
});
