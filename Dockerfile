# =============================
# Stage 1 — Build React Client
# =============================
FROM node:18 AS frontend
WORKDIR /app/client

# Copy and install frontend dependencies
COPY client/package*.json ./
RUN npm install

# Copy the rest of the frontend source
COPY client/ .

# Build the production-ready React app
RUN npm run build


# =============================
# Stage 2 — Backend Server
# =============================
FROM node:18

# Set up working directory
WORKDIR /app

# Copy backend package files and install deps
COPY package*.json ./
RUN npm install --production

# Copy backend source
COPY server.js .
#COPY setup.sh .

# Copy built frontend from Stage 1
COPY --from=frontend /app/client/build ./client/build

# Optional: set environment variables
ENV NODE_ENV=production
EXPOSE 3000

# Start the backend
CMD ["node", "server.js"]
