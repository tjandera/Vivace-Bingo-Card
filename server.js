/* =========================================================================
   server.js — Express entry point (MVC).
     · routes/         URL → controller mapping
     · controllers/    request handlers (business logic)
     · models/         data (booths, prizes)
     · views/          EJS templates rendered to HTML
     · public/         static assets (CSS, JS, images)
   To add a new page:   create a controller, register a route, add a view.
   ========================================================================= */

// Load .env for local dev (Vercel injects env vars natively in prod).
// Uses Node 20.6+'s built-in loader so we don't need the dotenv package.
try { process.loadEnvFile(); } catch (e) { /* no .env file — using shell env */ }

const express     = require("express");
const compression = require("compression");
const path        = require("path");
const routes      = require("./routes/index");

const server   = express();
const hostname = "localhost";
// Default port 8000.  Overridable via env, e.g. `PORT=4000 npm run dev`.
// Avoid 3000/3001 — VS Code reserves them for Copilot/language servers on macOS.
const port     = process.env.PORT || 8000;

// --- View engine ------------------------------------------------------
// EJS templates live in views/ by default; no need to set the path.
server.set("view engine", "ejs");

// --- Compression ------------------------------------------------------
// gzip HTML/JSON/CSS/JS on the wire.  Cuts the pre-gzip 88 KB of client
// assets to ~25 KB, which shows up on phones tethered to conference wifi.
// Mount BEFORE express.static so static responses go through it too.
server.use(compression());

// --- Static assets ----------------------------------------------------
// Serves everything in public/ at the URL root, e.g. /css/card.css.
// CSS/JS carry a ?v=<assetVersion> query string so a redeploy busts the
// browser cache; image URLs are stable and are safe to cache longer.
server.use(express.static(path.join(__dirname, "public"), {
    maxAge: "1d",
    etag:   true,
}));

// --- Routes -----------------------------------------------------------
server.use("/", routes);

// --- 404 fallback -----------------------------------------------------
// Any URL not handled above lands here.  Swap in a rendered view if you
// want a styled 404 page.
server.use((req, res) => {
    res.status(404).type("text").send("404 · Not Found");
});

// --- Start ------------------------------------------------------------
// Only bind a port when run directly (`node server.js`).  When Vercel's
// serverless runtime imports this file, we skip listen() and just export
// the app below — Vercel handles the request/response wiring itself.
if (require.main === module) {
    const listener = server.listen(port, hostname, () => {
        console.log("");
        console.log("   VIVACE 2026 Stamp Card");
        console.log("   → http://" + hostname + ":" + port + "/");
        console.log("");
    });

    // Friendly error if the port is already in use (usually a leftover
    // process or a VS Code helper).  Beats hanging silently.
    listener.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error("");
            console.error("   ✗ Port " + port + " is already in use.");
            console.error("     Try a different port:  PORT=8001 npm run dev");
            console.error("     Or kill leftovers:     npm run kill");
            console.error("");
            process.exit(1);
        }
        throw err;
    });
}

module.exports = server;
