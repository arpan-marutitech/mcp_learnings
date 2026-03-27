#!/usr/bin/env node
import axios from "axios";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.join(__dirname, ".env") });

const OPENWEATHER_API_KEY = (process.env.OPENWEATHER_API_KEY || "").trim();
const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";
const OPENWEATHER_GEO_URL = "https://api.openweathermap.org/geo/1.0/direct";

const TOP_DESTINATIONS = {
  india: [
    "Shimla",
    "Manali",
    "Goa",
    "Udaipur",
    "Jaipur",
    "Munnar",
    "Darjeeling",
    "Rishikesh"
  ],
  global: [
    "Bali",
    "Paris",
    "Zurich",
    "Tokyo",
    "Barcelona",
    "Queenstown",
    "Vancouver",
    "Cape Town"
  ]
};

const HILL_STATIONS = ["Manali", "Shimla", "Darjeeling", "Nainital", "Munnar"];
const INDOOR_DESTINATIONS = ["Dubai Mall", "Singapore Museums", "Tokyo Indoor Parks", "Bengaluru Cafes", "Istanbul Bazaars"];
const OUTDOOR_DESTINATIONS = ["Goa Beaches", "Andaman Islands", "Bali", "Phuket", "Santorini"];

function ensureApiKey() {
  if (!OPENWEATHER_API_KEY) {
    throw new Error("OPENWEATHER_API_KEY is missing. Add it to your environment or .env file.");
  }
}

function toToolResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
}

function toToolError(toolName, error) {
  let message;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status || "unknown";
    const statusText = error.response?.statusText || error.message;
    const apiMessage = error.response?.data?.message;

    message = `Request failed: ${status} ${statusText}`;
    if (apiMessage) {
      message += ` (${apiMessage})`;
    }

    if (status === 401) {
      message += " - Check OPENWEATHER_API_KEY in your .env file and make sure the key is active.";
    }
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = "Unknown error";
  }

  const data = {
    ok: false,
    tool: toolName,
    error: message
  };

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
}

async function fetchCurrentWeather(city) {
  ensureApiKey();

  const response = await axios.get(`${OPENWEATHER_BASE_URL}/weather`, {
    params: {
      q: city,
      appid: OPENWEATHER_API_KEY,
      units: "metric"
    },
    timeout: 10000
  });

  const weather = response.data;
  return {
    city: weather.name,
    country: weather.sys?.country || null,
    temperatureC: weather.main?.temp,
    condition: weather.weather?.[0]?.main || "Unknown",
    conditionDescription: weather.weather?.[0]?.description || "Unknown",
    humidity: weather.main?.humidity,
    feelsLikeC: weather.main?.feels_like
  };
}

async function fetchForecast(city) {
  ensureApiKey();

  const response = await axios.get(`${OPENWEATHER_BASE_URL}/forecast`, {
    params: {
      q: city,
      appid: OPENWEATHER_API_KEY,
      units: "metric"
    },
    timeout: 10000
  });

  const items = (response.data.list || []).map((item) => ({
    timestamp: item.dt_txt,
    temperatureC: item.main?.temp,
    condition: item.weather?.[0]?.main || "Unknown",
    humidity: item.main?.humidity,
    windSpeed: item.wind?.speed
  }));

  return {
    city: response.data.city?.name || city,
    country: response.data.city?.country || null,
    forecast: items
  };
}

async function fetchCoordinates(city) {
  ensureApiKey();

  const response = await axios.get(OPENWEATHER_GEO_URL, {
    params: {
      q: city,
      limit: 1,
      appid: OPENWEATHER_API_KEY
    },
    timeout: 10000
  });

  const [result] = response.data;
  if (!result) {
    throw new Error(`No coordinates found for city: ${city}`);
  }

  return {
    city: result.name,
    state: result.state || null,
    country: result.country,
    lat: result.lat,
    lon: result.lon
  };
}

function buildTravelSuggestion(weather) {
  const condition = (weather.condition || "").toLowerCase();

  if (typeof weather.temperatureC === "number" && weather.temperatureC >= 32) {
    return {
      reason: `Current temperature is ${weather.temperatureC}C, which is quite hot.`,
      category: "hill-stations",
      suggestions: HILL_STATIONS
    };
  }

  if (["rain", "drizzle", "thunderstorm"].some((x) => condition.includes(x))) {
    return {
      reason: `Current weather is ${weather.conditionDescription || weather.condition}, so indoor plans are safer.`,
      category: "indoor-destinations",
      suggestions: INDOOR_DESTINATIONS
    };
  }

  return {
    reason: `Weather looks pleasant (${weather.conditionDescription || weather.condition}) for outdoor travel.`,
    category: "beaches-outdoor",
    suggestions: OUTDOOR_DESTINATIONS
  };
}

const server = new McpServer({
  name: "smart-weather-travel-planner",
  version: "1.0.0"
});

function registerToolWithAlias(name, config, handler) {
  server.registerTool(name, config, handler);
  server.registerTool(`travel_${name}`, {
    ...config,
    description: `${config.description} (Namespaced alias for client compatibility)`
  }, handler);
}

registerToolWithAlias(
  "getWeather",
  {
    description: "Fetch current weather for a city using OpenWeather API.",
    inputSchema: {
      city: z.string().min(1).describe("City name, e.g., Mumbai")
    }
  },
  async ({ city }) => {
    try {
      const weather = await fetchCurrentWeather(city);
      return toToolResult({ ok: true, ...weather });
    } catch (error) {
      return toToolError("getWeather", error);
    }
  }
);

registerToolWithAlias(
  "getTopDestinations",
  {
    description: "Return a curated static list of top travel destinations from India and Global locations.",
    inputSchema: {}
  },
  async () => {
    try {
      return toToolResult({ ok: true, destinations: TOP_DESTINATIONS });
    } catch (error) {
      return toToolError("getTopDestinations", error);
    }
  }
);

registerToolWithAlias(
  "suggestTravel",
  {
    description: "Suggest travel plans for a city based on current weather: hot, rainy, or pleasant.",
    inputSchema: {
      city: z.string().min(1).describe("City name to evaluate travel suggestions")
    }
  },
  async ({ city }) => {
    try {
      const weather = await fetchCurrentWeather(city);
      const suggestion = buildTravelSuggestion(weather);

      return toToolResult({
        ok: true,
        city: weather.city,
        weather: {
          temperatureC: weather.temperatureC,
          condition: weather.condition,
          conditionDescription: weather.conditionDescription,
          humidity: weather.humidity
        },
        suggestion
      });
    } catch (error) {
      return toToolError("suggestTravel", error);
    }
  }
);

registerToolWithAlias(
  "getCityCoordinates",
  {
    description: "Get latitude and longitude for a city using OpenWeather Geocoding API.",
    inputSchema: {
      city: z.string().min(1).describe("City name, e.g., Bengaluru")
    }
  },
  async ({ city }) => {
    try {
      const coordinates = await fetchCoordinates(city);
      return toToolResult({ ok: true, ...coordinates });
    } catch (error) {
      return toToolError("getCityCoordinates", error);
    }
  }
);

registerToolWithAlias(
  "getForecast",
  {
    description: "Get 5-day weather forecast (3-hour intervals) for a city using OpenWeather API.",
    inputSchema: {
      city: z.string().min(1).describe("City name, e.g., Delhi")
    }
  },
  async ({ city }) => {
    try {
      const forecast = await fetchForecast(city);
      return toToolResult({ ok: true, ...forecast });
    } catch (error) {
      return toToolError("getForecast", error);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Smart Weather + Travel Planner MCP server started on stdio");
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
