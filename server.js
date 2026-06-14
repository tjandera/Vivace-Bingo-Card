const express     = require('express');
const compression = require('compression');
const path        = require('path');
const routes      = require('./routes/index');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/', routes);

// Only bind to a port when run directly (not when imported by Vercel's serverless runtime)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`VIVACE 2026 Stamp Card → http://localhost:${PORT}`);
    });
}

module.exports = app;
