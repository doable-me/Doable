import type { CurrentWeather, ForecastDay, HourlyForecast } from "../types/weather";

export const currentWeather: CurrentWeather = {
  location: "San Francisco",
  country: "US",
  temperature: 68,
  feelsLike: 65,
  condition: "Partly Cloudy",
  icon: "⛅",
  humidity: 72,
  windSpeed: 12,
  windDirection: "NW",
  uvIndex: 4,
  visibility: 10,
  pressure: 1013,
  high: 72,
  low: 58,
  sunrise: "6:42 AM",
  sunset: "7:28 PM",
};

export const forecast: ForecastDay[] = [
  { date: "Mar 16", dayName: "Sun", condition: "Sunny", icon: "☀️", high: 75, low: 60, precipitation: 0, humidity: 55 },
  { date: "Mar 17", dayName: "Mon", condition: "Partly Cloudy", icon: "⛅", high: 70, low: 58, precipitation: 10, humidity: 65 },
  { date: "Mar 18", dayName: "Tue", condition: "Rainy", icon: "🌧️", high: 62, low: 52, precipitation: 80, humidity: 88 },
  { date: "Mar 19", dayName: "Wed", condition: "Thunderstorm", icon: "⛈️", high: 58, low: 50, precipitation: 90, humidity: 92 },
  { date: "Mar 20", dayName: "Thu", condition: "Cloudy", icon: "☁️", high: 64, low: 54, precipitation: 20, humidity: 75 },
  { date: "Mar 21", dayName: "Fri", condition: "Partly Cloudy", icon: "⛅", high: 69, low: 57, precipitation: 15, humidity: 68 },
  { date: "Mar 22", dayName: "Sat", condition: "Sunny", icon: "☀️", high: 74, low: 59, precipitation: 5, humidity: 58 },
];

export const hourlyForecast: HourlyForecast[] = [
  { time: "Now", temperature: 68, condition: "Partly Cloudy", icon: "⛅", precipitation: 5 },
  { time: "11 AM", temperature: 70, condition: "Partly Cloudy", icon: "⛅", precipitation: 5 },
  { time: "12 PM", temperature: 72, condition: "Sunny", icon: "☀️", precipitation: 0 },
  { time: "1 PM", temperature: 73, condition: "Sunny", icon: "☀️", precipitation: 0 },
  { time: "2 PM", temperature: 74, condition: "Sunny", icon: "☀️", precipitation: 0 },
  { time: "3 PM", temperature: 72, condition: "Partly Cloudy", icon: "⛅", precipitation: 10 },
  { time: "4 PM", temperature: 70, condition: "Partly Cloudy", icon: "⛅", precipitation: 15 },
  { time: "5 PM", temperature: 68, condition: "Cloudy", icon: "☁️", precipitation: 20 },
  { time: "6 PM", temperature: 65, condition: "Cloudy", icon: "☁️", precipitation: 25 },
  { time: "7 PM", temperature: 63, condition: "Cloudy", icon: "☁️", precipitation: 30 },
  { time: "8 PM", temperature: 61, condition: "Cloudy", icon: "☁️", precipitation: 25 },
  { time: "9 PM", temperature: 59, condition: "Partly Cloudy", icon: "⛅", precipitation: 15 },
];
