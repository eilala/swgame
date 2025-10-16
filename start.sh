#!/bin/bash

# Kill Vite development server
pkill -f "vite"

# Kill WebSocket server
pkill -f "node server.js"

echo "Cleanup complete."

# Start the WebSocket server in the background
npm run server &

# Wait a moment for the server to start
sleep 2

# Start the development server in the background
npm run dev &

# Wait a moment for Vite to start
sleep 2