#!/bin/bash
echo "🔄 Restarting WebChat Services"

# Stop all node processes
echo "🛑 Stopping existing services..."
pkill -f "node server.js" 2>/dev/null || true
pkill -f "react-scripts start" 2>/dev/null || true

# Clean up old pid files
rm -f /opt/backend.pid /opt/frontend.pid
rm -f backend.pid frontend.pid

# Wait for ports to be free
sleep 3

# Check if ports are free
if netstat -tlnp | grep -q ":3001 "; then
    echo "⚠️ Port 3001 still in use, killing process..."
    fuser -k 3001/tcp 2>/dev/null || true
    sleep 2
fi

if netstat -tlnp | grep -q ":3000 "; then
    echo "⚠️ Port 3000 still in use, killing process..."
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 2
fi

# Start database services
echo "🗄️ Starting database services..."
docker-compose up -d postgres redis 2>/dev/null || echo "Docker services already running or not configured"

# Start backend
echo "🚀 Starting backend..."
cd backend
nohup npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../backend.pid
echo "✅ Backend started (PID: $BACKEND_PID)"
cd ..

# Wait for backend to start
sleep 5

# Start frontend
echo "🎨 Starting frontend..."
cd frontend
nohup npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../frontend.pid
echo "✅ Frontend started (PID: $FRONTEND_PID)"
cd ..

echo ""
echo "🎉 Services started successfully!"
echo "📍 Backend:  http://192.168.1.137:3001"
echo "📍 Frontend: http://192.168.1.137:3000"
echo "🌐 Public:   http://winwin2home.3bbddns.com:53630"
echo ""
echo "📋 Commands:"
echo "  ./logs.sh backend  - View backend logs"
echo "  ./logs.sh frontend - View frontend logs"
echo "  ./stop.sh          - Stop all services"
