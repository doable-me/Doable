import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Counter</h1>
        <div className="text-7xl font-mono font-bold text-indigo-600 mb-10">
          {count}
        </div>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => setCount(count - 1)}
            className="px-8 py-3 text-xl font-semibold rounded-xl bg-red-100 text-red-600 hover:bg-red-200 active:scale-95 transition-all"
          >
            −
          </button>
          <button
            onClick={() => setCount(0)}
            className="px-8 py-3 text-xl font-semibold rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Reset
          </button>
          <button
            onClick={() => setCount(count + 1)}
            className="px-8 py-3 text-xl font-semibold rounded-xl bg-green-100 text-green-600 hover:bg-green-200 active:scale-95 transition-all"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
