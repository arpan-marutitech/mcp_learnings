# Smart Weather + Travel Planner MCP

Node.js MCP server using `@modelcontextprotocol/sdk` and OpenWeather APIs.

## Features

- Current weather by city
- 5-day forecast (3-hour intervals)
- City geocoding (lat/lon)
- Static top destinations (India + Global)
- Weather-based travel suggestions
- Structured JSON responses with tool-level error handling

## Tech Stack

- Node.js (ESM)
- `@modelcontextprotocol/sdk`
- `axios`
- `dotenv`
- `zod`

## Project Files

- `index.js`: MCP server and tool implementations
- `.env.example`: Environment template
- `package.json`: Scripts and dependencies

## Environment Setup

Create a `.env` file in this folder:

```env
OPENWEATHER_API_KEY=your_openweather_api_key_here
```

## Install and Run

```bash
cd "D:\MCP Learning\mcp-weather"
npm install
npm start
```

The server runs on MCP stdio transport.

## MCP Server Config (Claude Desktop)

```json
{
  "mcpServers": {
    "smart-weather-travel-planner": {
      "command": "node",
      "args": ["D:\\MCP Learning\\mcp-weather\\index.js"],
      "cwd": "D:\\MCP Learning\\mcp-weather"
    }
  }
}
```

Restart Claude Desktop after editing config.

## Tools

- `getWeather(city)`
- `travel_getWeather(city)`
- `getTopDestinations()`
- `travel_getTopDestinations()`
- `suggestTravel(city)`
- `travel_suggestTravel(city)`
- `getCityCoordinates(city)`
- `travel_getCityCoordinates(city)`
- `getForecast(city)`
- `travel_getForecast(city)`

Note: `travel_*` tools are namespaced aliases to avoid collisions with built-in weather tools.

## Example Test Prompts

- `Use travel_getWeather with city "Mumbai"`
- `Use travel_getForecast with city "Bengaluru"`
- `Use travel_getCityCoordinates with city "Pune"`
- `Use travel_suggestTravel with city "Chennai"`
- `Use travel_getTopDestinations`

## Troubleshooting

- `OPENWEATHER_API_KEY is missing`: ensure `.env` exists in this folder and restart the MCP client.
- `401 Unauthorized`: API key invalid/revoked or not activated yet.
- Tools not visible in Claude: confirm server config path, include `cwd`, then fully restart Claude Desktop and open a new chat.
