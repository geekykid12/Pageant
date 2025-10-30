# Stage 1: Build the React frontend
FROM node:18-slim AS build
WORKDIR /app/client

COPY client/package.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# Stage 2: Create the production image
FROM node:18-slim
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN useradd --create-home --shell /bin/bash appuser
WORKDIR /home/appuser/pageant-scoring-system

# Copy backend dependencies and install
COPY package.json ./
RUN npm install --omit=dev

# Copy backend source code
COPY server.js ./

# Copy the built frontend from the build stage
COPY --from=build /app/client/build ./client/build

# Set correct ownership for the app directory
RUN chown -R appuser:appuser .

# Switch to the non-root user
USER appuser

# Expose the application port
EXPOSE 3000

# Define the command to start the server
CMD ["node", "server.js"]