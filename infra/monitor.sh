#!/bin/bash
# AnimApp Monitoring Script

echo "🚀 AnimApp Container Monitor"
echo "=================================="

# Function to show container status
show_status() {
    echo "📊 Container Status:"
    docker-compose -f docker-compose.local-comfyui.yml ps
    echo ""
}

# Function to show recent logs
show_recent_logs() {
    echo "📋 Recent Activity (last 10 lines per service):"
    echo "--- Backend ---"
    docker-compose -f docker-compose.local-comfyui.yml logs --tail=5 backend | tail -5
    echo "--- Worker ---" 
    docker-compose -f docker-compose.local-comfyui.yml logs --tail=5 worker | tail -5
    echo "--- Database ---"
    docker-compose -f docker-compose.local-comfyui.yml logs --tail=3 db | tail -3
    echo ""
}

# Function to show queue status
show_queue_status() {
    echo "🔄 Queue Status:"
    docker exec animapp-worker rq info --url redis://redis:6379/0 2>/dev/null || echo "RQ info unavailable"
    echo ""
}

# Function to show recent jobs
show_recent_jobs() {
    echo "💼 Recent Jobs:"
    docker exec animapp-db psql -U animapp -d animapp -c "SELECT id, status, created_at FROM jobs ORDER BY id DESC LIMIT 5;" 2>/dev/null || echo "Database unavailable"
    echo ""
}

# Main monitoring loop
case "$1" in
    "watch")
        echo "👀 Watching all logs (press Ctrl+C to exit)..."
        docker-compose -f docker-compose.local-comfyui.yml logs -f --tail=20
        ;;
    "status")
        show_status
        show_queue_status  
        show_recent_jobs
        ;;
    "logs")
        show_recent_logs
        ;;
    *)
        echo "Usage: $0 {watch|status|logs}"
        echo ""
        echo "Commands:"
        echo "  watch  - Live tail all container logs"
        echo "  status - Show container status, queue, and recent jobs" 
        echo "  logs   - Show recent logs from all services"
        echo ""
        echo "Examples:"
        echo "  ./monitor.sh watch"
        echo "  ./monitor.sh status"
        ;;
esac