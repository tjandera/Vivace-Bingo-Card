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
const fs          = require("fs");
const routes      = require("./routes/index");
const { requireSecret } = require("./utils/token");

// Fail loudly at boot if the voucher-signing secret is missing.  Better
// than silently issuing unverifiable vouchers all weekend.
requireSecret();

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

// --- JSON body parser -------------------------------------------------
// Only used by the /api/verify-code and /api/redeem endpoints.  4 KB is
// plenty for a stamp code or a codes map with 12 entries, and small
// enough to blunt trivial abuse.
server.use(express.json({ limit: "4kb" }));

// --- Debug pages (dev only) -------------------------------------------
// /test-logos.html is a designer tool for auditing CCA logo classification.
// It's a static file, so this guard has to sit BEFORE express.static.
if (process.env.NODE_ENV === "production") {
    server.get("/test-logos.html", (_req, res) => {
        res.status(404).type("text").send("404 · Not Found");
    });
}

// --- Minified-JS rewrite (production only) ----------------------------
// scripts/build.js emits public/js/<name>.min.js next to each source.
// In production we serve the minified copy transparently — the template
// still references /js/state.js etc., no per-file URL changes needed.
// Dev keeps serving the readable source so debugging isn't painful.
if (process.env.NODE_ENV === "production") {
    const jsDir = path.join(__dirname, "public", "js");
    const minAvailable = new Set();
    try {
        for (const f of fs.readdirSync(jsDir)) {
            if (f.endsWith(".min.js")) minAvailable.add(f.replace(".min.js", ".js"));
        }
    } catch (e) { /* no public/js on disk — skip rewrite */ }
    if (minAvailable.size) {
        server.use((req, res, next) => {
            if (req.method === "GET" && req.path.startsWith("/js/") &&
                req.path.endsWith(".js") && !req.path.endsWith(".min.js")) {
                const bare = req.path.slice(4);
                if (minAvailable.has(bare)) {
                    req.url = "/js/" + bare.replace(/\.js$/, ".min.js") +
                              (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
                }
            }
            next();
        });
    }
}

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
