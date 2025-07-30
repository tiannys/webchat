#!/bin/bash
case "$1" in
    backend)
        echo "📋 Backend Logs (Ctrl+C to exit)"
        echo "================================"
        tail -f backend.log 2>/dev/null || echo "No backend logs yet"
        ;;
    frontend)
        echo "📋 Frontend Logs (Ctrl+C to exit)"
        echo "================================="
        tail -f frontend.log 2>/dev/null || echo "No frontend logs yet"
        ;;
    all)
        echo "📋 All Logs"
        echo "==========="
        echo "--- Backend ---"
        tail -20 backend.log 2>/dev/null || echo "No backend logs"
        echo ""
        echo "--- Frontend ---"
        tail -20 frontend.log 2>/dev/null || echo "No frontend logs"
        ;;
    *)
        echo "Usage: $0 {backend|frontend|all}"
        ;;
esac
