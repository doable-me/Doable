import { useState } from "react";
import { currentWeather, forecast, hourlyForecast } from "../data/mockWeather";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-white/60 text-xs font-medium uppercase tracking-wider">{label}</span>
      <span className="text-white text-xl font-bold">{value}</span>
      {sub && <span className="text-white/50 text-xs">{sub}</span>}
    </div>
  );
}

function UVBar({ index }: { index: number }) {
  const level = index <= 2 ? "Low" : index <= 5 ? "Moderate" : index <= 7 ? "High" : index <= 10 ? "Very High" : "Extreme";
  const color = index <= 2 ? "bg-green-400" : index <= 5 ? "bg-yellow-400" : index <= 7 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex flex-col gap-2">
      <span className="text-white/60 text-xs font-medium uppercase tracking-wider">UV Index</span>
      <span className="text-white text-xl font-bold">{index} <span className="text-sm font-normal text-white/70">{level}</span></span>
      <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${(index / 11) * 100}%` }} />
      </div>
    </div>
  );
}

export default function WeatherDashboard() {
  const [unit, setUnit] = useState<"F" | "C">("F");

  const toC = (f: number) => Math.round((f - 32) * 5 / 9);
  const convert = (f: number) => unit === "F" ? f : toC(f);
  const deg = (n: number) => `${convert(n)}°${unit}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">
              📍 {currentWeather.location}, {currentWeather.country}
            </h1>
            <p className="text-white/50 text-sm mt-0.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <button
            onClick={() => setUnit(u => u === "F" ? "C" : "F")}
            className="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors backdrop-blur-sm border border-white/10"
          >
            °F / °C
          </button>
        </div>

        {/* Current Weather Hero */}
        <div className="bg-gradient-to-br from-blue-500/30 to-indigo-600/30 backdrop-blur-md rounded-3xl border border-white/10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-6">
              <span className="text-8xl leading-none select-none">{currentWeather.icon}</span>
              <div>
                <div className="text-white text-7xl font-thin tracking-tight">{deg(currentWeather.temperature)}</div>
                <div className="text-white/70 text-lg mt-1">{currentWeather.condition}</div>
                <div className="text-white/50 text-sm mt-0.5">
                  Feels like {deg(currentWeather.feelsLike)} · H:{deg(currentWeather.high)} L:{deg(currentWeather.low)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:w-64">
              <StatCard label="Humidity" value={`${currentWeather.humidity}%`} sub="Dew point 54°F" />
              <StatCard label="Wind" value={`${currentWeather.windSpeed} mph`} sub={currentWeather.windDirection} />
              <StatCard label="Visibility" value={`${currentWeather.visibility} mi`} />
              <StatCard label="Pressure" value={`${currentWeather.pressure}`} sub="hPa" />
            </div>
          </div>

          {/* Sunrise/Sunset */}
          <div className="mt-6 flex gap-6 pt-5 border-t border-white/10">
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <span className="text-xl">🌅</span>
              <div>
                <div className="text-white/40 text-xs">Sunrise</div>
                <div className="text-white font-medium">{currentWeather.sunrise}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <span className="text-xl">🌇</span>
              <div>
                <div className="text-white/40 text-xs">Sunset</div>
                <div className="text-white font-medium">{currentWeather.sunset}</div>
              </div>
            </div>
            <div className="ml-auto">
              <UVBar index={currentWeather.uvIndex} />
            </div>
          </div>
        </div>

        {/* Hourly Forecast */}
        <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-5">
          <h2 className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-4">Hourly Forecast</h2>
          <div className="overflow-x-auto">
            <div className="flex gap-3 pb-2 min-w-max">
              {hourlyForecast.map((h) => (
                <div
                  key={h.time}
                  className={`flex flex-col items-center gap-2 px-4 py-3 rounded-2xl min-w-[64px] transition-colors ${
                    h.time === "Now" ? "bg-blue-500/40 border border-blue-400/40" : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="text-white/60 text-xs font-medium">{h.time}</span>
                  <span className="text-2xl leading-none select-none">{h.icon}</span>
                  <span className="text-white font-semibold text-sm">{deg(h.temperature)}</span>
                  {h.precipitation > 0 && (
                    <span className="text-blue-300 text-xs">{h.precipitation}%</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 7-Day Forecast */}
        <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-5">
          <h2 className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-4">7-Day Forecast</h2>
          <div className="space-y-1">
            {forecast.map((day, i) => (
              <div
                key={day.date}
                className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-colors hover:bg-white/5 ${
                  i === 0 ? "bg-white/5" : ""
                }`}
              >
                <div className="w-10 text-white font-semibold text-sm">{day.dayName}</div>
                <div className="text-white/40 text-xs w-14 hidden sm:block">{day.date}</div>
                <span className="text-2xl leading-none select-none w-8">{day.icon}</span>
                <span className="text-white/60 text-sm flex-1 hidden md:block">{day.condition}</span>

                {/* Precipitation */}
                <div className="flex items-center gap-1 w-14 justify-end">
                  {day.precipitation > 0 && (
                    <>
                      <span className="text-blue-400 text-xs">💧</span>
                      <span className="text-blue-300 text-xs">{day.precipitation}%</span>
                    </>
                  )}
                </div>

                {/* Temp bar */}
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-white/50 text-sm w-10 text-right">{deg(day.low)}</span>
                  <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full"
                      style={{
                        marginLeft: `${((day.low - 45) / 40) * 100}%`,
                        width: `${((day.high - day.low) / 40) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-white font-semibold text-sm w-10">{deg(day.high)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-white/20 text-xs pb-2">Demo data · San Francisco, CA</p>
      </div>
    </div>
  );
}
