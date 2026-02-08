const express = require('express');
const axios = require('axios');
const config = require('../config');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const response = await axios.get(config.linkedinApiUrl, {
      headers: { 'User-Agent': 'SalesDashboard/1.0' },
      timeout: 15000
    });
    res.set('Cache-Control', 'no-cache');
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
