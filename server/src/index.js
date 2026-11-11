import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import store from './db/store.js';
import { registerSocketIO, getActiveCart, handleAbsoluteWeightReading } from './services/cartService.js';
import { initMQTT } from './services/mqttService.js';

import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import shelfRoutes from './routes/shelfRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import simulatorRoutes from './routes/simulatorRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Socket.io initialization with CORS
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Register Socket.io with Cart Service
registerSocketIO(io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  if (!req.url.startsWith('/api/cart') && !req.url.startsWith('/api/auth/current')) {
    console.log(`[HTTP ${req.method}] ${req.url}`);
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/shelves', shelfRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/simulator', simulatorRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    project: 'Tap Take Go - Smart Retailing Store',
    timestamp: new Date().toISOString(),
    mongoConnected: store.isMongoConnected,
    activeShopper: store.data.activeGate.activeShopperId
  });
});

// Serve frontend build if dist exists
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) next();
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔌 [WebSocket] Client connected: ${socket.id}`);

  // Send initial state upon connection
  const activeCart = getActiveCart();
  socket.emit('cart_updated', activeCart);
  socket.emit('store_settings', store.data.settings);
  socket.emit('gate_status', store.data.activeGate);

  // Fast WebSocket path for real-time scale telemetry (low latency vs HTTP POST)
  socket.on('sensor_reading', async (data, ack) => {
    try {
      const { slot_id, weight, grams, weight_grams, pcs, stable, user_id, auto_cart } = data || {};
      const resolvedWeight = weight !== undefined ? weight : (grams !== undefined ? grams : weight_grams);
      if (resolvedWeight === undefined) {
        if (typeof ack === 'function') ack({ success: false, message: 'Missing weight' });
        return;
      }
      const result = await handleAbsoluteWeightReading({
        slotId: slot_id || 'KH1_1',
        weight: resolvedWeight,
        pcs,
        stable,
        userId: user_id || null,
        autoCart: auto_cart !== false
      });
      if (typeof ack === 'function') ack(result);
    } catch (err) {
      if (typeof ack === 'function') ack({ success: false, message: err.message });
    }
  });

  socket.on('disconnect', () => {
    // Client disconnected
  });
});

// Server bootstrap
async function bootstrap() {
  // 1. Try connecting to MongoDB if URI is provided
  if (process.env.MONGODB_URI) {
    await store.initMongo(process.env.MONGODB_URI);
  } else {
    console.log('ℹ️ [Database] Running with Local JSON Data Store (data/store.json).');
  }

  // 2. Initialize MQTT Broker & Client
  const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  await initMQTT(mqttBrokerUrl);

  // 3. Start Express HTTP Server
  server.listen(PORT, () => {
    console.log(`
=============================================================
  TAP TAKE GO - SMART RETAILING STORE BACKEND & IOT GATEWAY
=============================================================
🚀 HTTP Server running on: http://localhost:${PORT}
🔌 WebSocket (Socket.io) ready for real-time frontend events
📡 MQTT Gateway listening for ESP32/RFID/HX711 sensors
💳 SePay Webhook Endpoint: http://localhost:${PORT}/api/webhook/payment
=============================================================
    `);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
});
