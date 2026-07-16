/* routes/index.js
   Maps URLs to controller functions.  Add new routes here as the app grows. */

const express         = require("express");
const router          = express.Router();
const bingoController = require("../controllers/bingoController");

// GET /  → render the stamp card page
router.get("/", bingoController.getStampCard);

// GET /api/catalog  → JSON of all CCAs (id, name, logo, accent) — used by
// /test-logos.html for visual inspection.  Codes/hashes are NOT included.
router.get("/api/catalog", bingoController.getCatalog);

module.exports = router;
