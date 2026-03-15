export interface CurrentWeather {
  location: string;
  country: string;
  temperature: number;
  feelsLike: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  uvIndex: number;
  visibility: number;
  pressure: number;
  high: number;
  low: number;
  sunrise: string;
  sunset: string;
}

export interface ForecastDay {
  date: string;
  dayName: string;
  condition: string;
  icon: string;
  high: number;
  low: number;
  precipitation: number;
  humidity: number;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  condition: string;
  icon: string;
  precipitation: number;
}
