# cost-tracking

Cost tracking and budget management skill for Mission Control. Monitor token usage, estimate costs, and set budget alerts.

## Usage

```bash
# Get token usage summary
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/tokens/summary

# Get cost breakdown by model
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/tokens/by-model

# Get cost trends
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/tokens/trends?period=30d

# Get agent-specific costs
curl -H "x-api-key: $API_KEY" http://localhost:3000/api/tokens/by-agent
```

## Token Usage Tracking

Tracks token usage across:
- All models (Claude, GPT, Gemini, etc.)
- Per-agent consumption
- Per-project costs
- Session-level granularity

## Cost Estimation

Costs are estimated based on:
- Input tokens (model-specific rates)
- Output tokens (model-specific rates)
- Context window overhead

## Budget Alerts

Configure alerts for:
- Daily budget threshold
- Weekly budget threshold
- Per-agent spending limits
- Project-specific budgets

## Cost Reports

Generate reports:
- Daily/weekly/monthly summaries
- Cost trends over time
- Agent comparison
- Project breakdown
- Model distribution

## API Response Format

```json
{
  "total_cost": 123.45,
  "total_tokens": 1000000,
  "by_model": {
    "claude-3-5-sonnet": { "cost": 100.00, "tokens": 500000 },
    "gpt-4o": { "cost": 23.45, "tokens": 500000 }
  },
  "period": "30d"
}
```
