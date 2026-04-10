# log-explorer

Log exploration and analysis skill for Mission Control. Search, filter, and analyze system and agent logs.

## Usage

```bash
# Get recent activities
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/activities?limit=50

# Search logs by type
curl -H "x-api-key: $API_KEY" "http://localhost:3000/api/activities?type=agent_task&limit=100"

# Get audit logs
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/audit-log?limit=100
```

## Features

- **Activity Feed**: Real-time stream of all system events
- **Audit Log**: Complete trail of administrative actions
- **Agent Logs**: Per-agent activity tracking
- **Log Search**: Filter by type, actor, time range, entity
- **Log Export**: Export logs in JSON or CSV format

## Log Types

| Type | Description |
|------|-------------|
| `agent_task` | Task assignment and completion events |
| `agent_status_change` | Agent online/offline transitions |
| `task_status_change` | Task status transitions |
| `user_login` | User authentication events |
| `system_config` | Configuration changes |
| `security_event` | Security-relevant events |

## Retention

Logs are retained based on retention settings:
- Activities: Configurable (default: 30 days)
- Audit log: Configurable (default: 90 days)
- Notifications: Configurable (default: 30 days)

Configure retention in Mission Control settings under "Data Retention".
