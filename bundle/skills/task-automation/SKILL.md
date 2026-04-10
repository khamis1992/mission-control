# task-automation

Task automation and workflow skill for Mission Control. Create automated task workflows, chains, and conditional task routing.

## Usage

```bash
# List recurring tasks
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/recurring

# Create recurring task
curl -X POST -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Daily report generation",
    "template": "Generate system status report",
    "schedule": "every day at 9am",
    "priority": "medium"
  }' \
  http://localhost:3000/api/recurring

# Trigger task dispatch manually
curl -X POST -H "x-api-key: $API_KEY" \
  -d '{"task_ids": [1, 2, 3]}' \
  http://localhost:3000/api/tasks/dispatch
```

## Natural Language Scheduling

Create recurring tasks using natural language:
- "every morning at 9am"
- "every weekday at 6pm"
- "every 2 hours"
- "every Monday at 10am"
- "at the start of each month"

The scheduler parses natural language to cron expressions automatically.

## Workflow Patterns

### Sequential Chain
Tasks execute in order, each waiting for the previous to complete.

### Parallel Group
Multiple tasks execute simultaneously when triggered.

### Conditional Routing
Tasks are assigned to agents based on:
- Agent availability
- Task priority
- Agent specialty/tags
- Current workload

## Task States

| State | Description |
|-------|-------------|
| `inbox` | New task, awaiting routing |
| `assigned` | Assigned to an agent |
| `in_progress` | Agent is working |
| `review` | Awaiting review |
| `quality_review` | Under Aegis quality gate |
| `done` | Completed |
| `failed` | Task failed |
| `cancelled` | Task cancelled |

## Auto-Routing

Enable auto-routing in settings to automatically assign inbox tasks based on:
- Priority (high priority → most available agent)
- Category/tags matching agent specialties
- Round-robin for equal priority
