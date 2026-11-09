# ==========================================
# STAGE 1: Build Frontend (React + Vite)
# ==========================================
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ==========================================
# STAGE 2: Production Server (Node.js + MQTT + WebSockets)
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy server dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --only=production

# Copy server code
COPY server/ ./

# Copy built frontend assets from stage 1 into client/dist
COPY --from=client-builder /app/client/dist /app/client/dist

# Expose HTTP/WebSockets port (5000) and embedded MQTT port (1883)
EXPOSE 5000
EXPOSE 1883

# Start backend server
CMD ["node", "src/index.js"]
