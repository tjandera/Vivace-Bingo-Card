/* scripts/build.js
   Minify public/js/*.js → public/js/*.min.js at install/build time.
   server.js serves the .min.js versions in production and falls back to
   the readable source in dev, so nothing breaks locally.
   Idempotent — safe to run repeatedly. */

const fs   = require("fs");
const path = require("path");

// Terser is a devDependency.  If it's missing (e.g. someone ran
// `npm install --production`), skip the build cleanly instead of
// crashing npm install.
let minify;
try { minify = require("terser").minify; }
catch (e) {
    console.log("[build] terser not installed — skipping JS minification. " +
                "This is expected in production-only installs; the server " +
                "will serve the readable sources instead.");
    process.exit(0);
}

const JS_DIR = path.join(__dirname, "..", "public", "js");

const TERSER_OPTS = {
    compress: {
        // Keep console.warn/error for debugging in prod; strip .log/.debug.
        pure_funcs: ["console.log", "console.debug"],
    },
    // Mangle local variable names inside each IIFE.  Top-level names and
    // property accesses (window.Vivace, BOOTH_CODES etc.) are left alone,
    // so cross-file references keep working.
    mangle: true,
    format: {
        comments: false,
        ascii_only: true,
    },
};

async function main() {
    if (!fs.existsSync(JS_DIR)) {
        console.log("[build] no public/js dir — nothing to do");
        return;
    }
    const inputs = fs.readdirSync(JS_DIR)
        .filter(f => f.endsWith(".js") && !f.endsWith(".min.js"));

    let totalIn = 0, totalOut = 0;
    for (const f of inputs) {
        const src = fs.readFileSync(path.join(JS_DIR, f), "utf8");
        const result = await minify({ [f]: src }, TERSER_OPTS);
        if (result.error) {
            console.error("[build] failed on", f, "—", result.error);
            process.exit(1);
        }
        const outName = f.replace(/\.js$/, ".min.js");
        fs.writeFileSync(path.join(JS_DIR, outName), result.code);
        const inBytes  = Buffer.byteLength(src);
        const outBytes = Buffer.byteLength(result.code);
        totalIn += inBytes; totalOut += outBytes;
        console.log(
            "[build] " + f.padEnd(14) + " → " + outName.padEnd(18) +
            " " + inBytes.toString().padStart(6) + " → " +
            outBytes.toString().padStart(6) + " bytes  (" +
            Math.round((1 - outBytes / inBytes) * 100) + "% smaller)"
        );
    }
    if (inputs.length) {
        console.log("[build] total: " + totalIn + " → " + totalOut +
                    " bytes (" + Math.round((1 - totalOut / totalIn) * 100) + "% smaller)");
    }
}

main().catch(e => { console.error(e); process.exit(1); });
