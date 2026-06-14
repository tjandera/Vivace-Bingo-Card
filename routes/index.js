const express        = require('express');
const router         = express.Router();
const bingoController = require('../controllers/bingoController');

router.get('/', bingoController.getStampCard);

module.exports = router;
