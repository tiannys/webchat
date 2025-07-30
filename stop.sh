#!/bin/bash
echo "🛑 Stopping WebChat services..."

# Stop Node.js processes
if [ -f backend.pid ]; then
    kill $(cat backend.pid) 2>/dev/null || true
    rm backend.pid
    echo "✅ Backend stopped"
fi

if [ -f frontend.pid ]; then
    kill $(cat frontend.pid) 2>/dev/null || true
    rm frontend.pid
    echo "✅ Frontend stopped"
fi

# Stop Docker services
docker-compose down
echo "✅ Database stopped"
