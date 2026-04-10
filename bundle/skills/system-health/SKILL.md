# system-health

System health monitoring skill for Mission Control agents. Checks CPU, memory, disk usage, and system uptime.

## Usage

```bash
# Check system health
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/status?action=health

# Full system overview
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/status?action=overview

# Run diagnostics (admin only)
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/diagnostics
```

## What It Checks

- CPU usage and load average
- Memory usage (used/available)
- Disk space on all mounted filesystems
- System uptime
- Running processes count
- Network connectivity

## Alerts

Configure alerts in Mission Control settings for:
- CPU usage > 80%
- Memory usage > 85%
- Disk usage > 90%
- System uptime < 1 hour (unexpected restart)

## Integration

This skill integrates with Mission Control's scheduler to run periodic health checks and log results to the activity feed.
