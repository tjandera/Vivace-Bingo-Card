/* routes/index.js
   Maps URLs to controller functions.  Add new routes here as the app grows. */

const express         = require("express");
const router          = express.Router();
const bingoController = require("../controllers/bingoController");

// GET /  → render the stamp card page
router.get("/", bingoController.getStampCard);

module.exports = router;
