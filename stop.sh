#!/bin/bash

# Kill ngrok tunnel
pkill ngrok

# Kill Vite development server
pkill -f "vite"

# Kill WebSocket server
pkill -f "node server.js"

echo "Shutdown complete."