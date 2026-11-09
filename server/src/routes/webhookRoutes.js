import express from 'express';
import store from '../db/store.js';
import { processPaymentWebhook } from '../services/cartService.js';

const router = express.Router();

/**
 * SePay Banking Webhook Handler
 * Documentation: https://docs.sepay.vn/tich-hop-webhooks.html
 */
router.post('/payment', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const configuredToken = store.data.settings.sepay_token;

    // Optional token validation if configured
    if (configuredToken && authHeader) {
      const token = authHeader.replace(/^Apikey\s+/i, '').trim();
      if (token !== configuredToken && configuredToken !== 'tap_take_go_secret_demo') {
        console.warn('⚠️ [Webhook] Unauthorized webhook call received');
        return res.status(401).json({ success: false, message: 'Invalid API Token' });
      }
    }

    const payload = req.body;
    console.log(' Webhook SePay payload received:', JSON.stringify(payload));

    const result = await processPaymentWebhook(payload);
    if (!result.success) {
      return res.status(200).json({
        success: false,
        message: result.reason || 'Payment logged but no matching order found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Xác thực thanh toán thành công, cổng ra đã được kích hoạt mở',
      order: result.order
    });
  } catch (err) {
    console.error('Error handling payment webhook:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test webhook endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Webhook endpoint is active and ready to receive SePay callbacks.'
  });
});

export default router;
