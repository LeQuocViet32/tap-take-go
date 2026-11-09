import aedes from 'aedes';
import net from 'net';
import mqtt from 'mqtt';
import { handleWeightChange, handleCustomerEntry, registerMQTTPublisher } from './cartService.js';

let aedesInstance = null;
let brokerServer = null;
let clientInstance = null;

export async function initMQTT(brokerUrl = 'mqtt://127.0.0.1:1883', port = 1883) {
  // Step 1: Attempt to start embedded Aedes broker if port 1883 is free
  try {
    aedesInstance = aedes();
    brokerServer = net.createServer(aedesInstance.handle);

    await new Promise((resolve) => {
      brokerServer.listen(port, () => {
        console.log(`📡 [MQTT Broker] Embedded Aedes broker running on port ${port}`);
        resolve();
      });

      brokerServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`ℹ️ [MQTT Broker] Port ${port} is already in use (e.g. Mosquitto active). Using existing broker.`);
        } else {
          console.warn(`⚠️ [MQTT Broker] Server notice: ${err.message}`);
        }
        resolve();
      });
    });
  } catch (err) {
    console.warn(`[MQTT] Broker start notice:`, err.message);
  }

  // Small delay to ensure port socket is accepting connections
  await new Promise((r) => setTimeout(r, 200));

  // Step 2: Connect MQTT Client to broker
  try {
    clientInstance = mqtt.connect(brokerUrl, {
      reconnectPeriod: 3000,
      connectTimeout: 5000
    });

    clientInstance.on('connect', () => {
      console.log(`🔌 [MQTT Client] Connected to MQTT broker at ${brokerUrl}`);
      // Subscriptions
      clientInstance.subscribe('store/sensor/weight', (err) => {
        if (!err) console.log(' Subscribed to topic: store/sensor/weight');
      });
      clientInstance.subscribe('store/gate/entry', (err) => {
        if (!err) console.log(' Subscribed to topic: store/gate/entry');
      });
      clientInstance.subscribe('store/gate/exit', (err) => {
        if (!err) console.log(' Subscribed to topic: store/gate/exit');
      });
    });

    clientInstance.on('message', async (topic, message) => {
      try {
        const payloadStr = message.toString();
        let payload = {};
        try {
          payload = JSON.parse(payloadStr);
        } catch {
          payload = { raw: payloadStr };
        }

        console.log(`📥 [MQTT Message] Topic [${topic}]:`, payload);

        if (topic === 'store/sensor/weight') {
          // Payload format: { "slot_id": "NODE_01", "weight_change": -390, "user_id": "usr_123" }
          const { slot_id, weight_change, user_id, card_id } = payload;
          if (slot_id !== undefined && weight_change !== undefined) {
            await handleWeightChange(slot_id, Number(weight_change), user_id || card_id || null);
          }
        } else if (topic === 'store/gate/entry') {
          // Hardware RFID scanner sends: { "rfid_card_id": "RFID_88A1B2" }
          const { rfid_card_id } = payload;
          if (rfid_card_id) {
            await handleCustomerEntry(rfid_card_id);
          }
        }
      } catch (err) {
        console.error('Error handling MQTT message:', err);
      }
    });

    clientInstance.on('error', (err) => {
      console.warn('⚠️ [MQTT Client] Notice:', err.message);
    });

    // Register publisher
    registerMQTTPublisher((topic, payload) => {
      if (clientInstance && clientInstance.connected) {
        clientInstance.publish(topic, JSON.stringify(payload));
      }
    });
  } catch (err) {
    console.error('Failed to setup MQTT client:', err);
  }
}

export function publishMQTT(topic, payload) {
  if (clientInstance && clientInstance.connected) {
    clientInstance.publish(topic, JSON.stringify(payload));
  }
}
