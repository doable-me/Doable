# Skill: Interactive Dashboard Builder

## Trigger Keywords
`dashboard`, `analytics dashboard`, `admin panel`, `data visualization`, `charts`, `KPI`, `metrics`, `real-time dashboard`, `monitoring`, `stats panel`, `reporting dashboard`

## Purpose
Generate beautiful, interactive dashboards with charts, KPI cards, real-time data visualization, and drag-and-drop layouts using React + Vite.

---

## Dependencies

```json
{
  "devDependencies": {},
  "dependencies": {
    "recharts": "^2.12.0",
    "react-grid-layout": "^1.4.4",
    "framer-motion": "^11.0.0"
  }
}
```

**Alternative chart libraries (use based on need):**
- `@nivo/core @nivo/line @nivo/bar @nivo/pie` — Complex animated charts
- `react-chartjs-2 chart.js` — Simple, lightweight charts
- `react-apexcharts apexcharts` — Financial/interactive charts

---

## Architecture

### File Structure
```
src/
├── App.tsx                    # Dashboard shell with grid layout
├── components/
│   ├── DashboardGrid.tsx      # Responsive drag-drop grid
│   ├── KPICard.tsx            # Metric card with trend indicator
│   ├── ChartCard.tsx          # Chart wrapper with title/actions
│   ├── LineChart.tsx          # Time series visualization
│   ├── BarChart.tsx           # Category comparison
│   ├── PieChart.tsx           # Distribution/proportion
│   ├── AreaChart.tsx          # Volume over time
│   ├── DataTable.tsx          # Tabular data display
│   └── widgets/
│       ├── RevenueChart.tsx
│       ├── UserGrowth.tsx
│       ├── ActivityFeed.tsx
│       └── ProgressRing.tsx
├── hooks/
│   ├── useDashboardData.ts    # Data fetching/mock
│   └── useGridLayout.ts      # Layout state persistence
├── themes/
│   └── dashboard.css          # Color schemes, tokens
└── utils/
    ├── format.ts              # Number/date formatters
    └── mock-data.ts           # Realistic sample data
```

---

## KPI Card Component

```tsx
import { motion } from 'framer-motion';

interface KPICardProps {
  title: string;
  value: string | number;
  change: number;        // percentage change
  trend: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  color?: string;        // gradient start color
}

export function KPICard({ title, value, change, trend, icon, color = '#6366f1' }: KPICardProps) {
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#6b7280';
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="kpi-card"
      style={{ '--accent': color } as React.CSSProperties}
    >
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        {icon && <span className="kpi-icon">{icon}</span>}
      </div>
      <div className="kpi-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="kpi-change" style={{ color: trendColor }}>
        <span className="trend-icon">{trendIcon}</span>
        <span>{Math.abs(change)}%</span>
        <span className="kpi-period">vs last period</span>
      </div>
    </motion.div>
  );
}
```

### KPI Card Styles
```css
.kpi-card {
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 12px rgba(0, 0, 0, 0.03);
  border: 1px solid #f1f5f9;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.kpi-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--accent, #6366f1);
}

.kpi-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.05);
  transform: translateY(-2px);
}

.kpi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.kpi-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.kpi-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  display: grid;
  place-items: center;
  color: var(--accent);
}

.kpi-value {
  font-size: 2rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
  margin-bottom: 0.5rem;
}

.kpi-change {
  font-size: 0.8125rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.kpi-period {
  color: #94a3b8;
  font-weight: 400;
  margin-left: 0.25rem;
}
```

---

## Dashboard Grid Layout

```tsx
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-grid-layout/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const defaultLayouts = {
  lg: [
    { i: 'kpi-1', x: 0, y: 0, w: 3, h: 2 },
    { i: 'kpi-2', x: 3, y: 0, w: 3, h: 2 },
    { i: 'kpi-3', x: 6, y: 0, w: 3, h: 2 },
    { i: 'kpi-4', x: 9, y: 0, w: 3, h: 2 },
    { i: 'chart-main', x: 0, y: 2, w: 8, h: 6 },
    { i: 'chart-side', x: 8, y: 2, w: 4, h: 6 },
    { i: 'table', x: 0, y: 8, w: 12, h: 5 },
  ],
  md: [
    { i: 'kpi-1', x: 0, y: 0, w: 5, h: 2 },
    { i: 'kpi-2', x: 5, y: 0, w: 5, h: 2 },
    { i: 'kpi-3', x: 0, y: 2, w: 5, h: 2 },
    { i: 'kpi-4', x: 5, y: 2, w: 5, h: 2 },
    { i: 'chart-main', x: 0, y: 4, w: 10, h: 6 },
    { i: 'chart-side', x: 0, y: 10, w: 10, h: 5 },
    { i: 'table', x: 0, y: 15, w: 10, h: 5 },
  ],
};

export function DashboardGrid({ children }: { children: React.ReactNode }) {
  const [layouts, setLayouts] = useState(defaultLayouts);

  return (
    <ResponsiveGridLayout
      className="dashboard-grid"
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
      cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
      rowHeight={50}
      isDraggable={true}
      isResizable={true}
      onLayoutChange={(_, allLayouts) => setLayouts(allLayouts)}
      draggableHandle=".drag-handle"
      margin={[16, 16]}
    >
      {children}
    </ResponsiveGridLayout>
  );
}
```

---

## Chart Components

### Line Chart (Recharts)
```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area } from 'recharts';

interface TimeSeriesProps {
  data: Array<{ date: string; value: number; [key: string]: any }>;
  lines?: Array<{ key: string; color: string; name: string }>;
  showGrid?: boolean;
  showArea?: boolean;
}

export function TimeSeriesChart({ data, lines = [{ key: 'value', color: '#6366f1', name: 'Value' }], showGrid = true, showArea = false }: TimeSeriesProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />}
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: 'none',
            borderRadius: '8px',
            color: '#f8fafc',
            fontSize: '13px',
          }}
        />
        {lines.map(({ key, color, name }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, stroke: color, strokeWidth: 2, fill: '#fff' }}
            name={name}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Donut/Pie Chart
```tsx
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

export function DonutChart({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

---

## Color Scheme & Theming

```css
:root {
  /* Dashboard background */
  --bg-dashboard: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-hover: #fafbfc;

  /* Text hierarchy */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;

  /* Chart colors (harmonious palette) */
  --chart-1: #6366f1;  /* Indigo */
  --chart-2: #8b5cf6;  /* Violet */
  --chart-3: #ec4899;  /* Pink */
  --chart-4: #f59e0b;  /* Amber */
  --chart-5: #10b981;  /* Emerald */
  --chart-6: #06b6d4;  /* Cyan */

  /* Status colors */
  --status-success: #10b981;
  --status-warning: #f59e0b;
  --status-danger: #ef4444;
  --status-info: #3b82f6;

  /* Borders & shadows */
  --border-light: #f1f5f9;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.08);

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
}

/* Dark mode */
[data-theme="dark"] {
  --bg-dashboard: #0f172a;
  --bg-card: #1e293b;
  --bg-card-hover: #334155;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #64748b;
  --border-light: #334155;
}
```

---

## Animation Patterns

### Staggered KPI Entry
```tsx
import { motion } from 'framer-motion';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function KPIRow({ metrics }: { metrics: KPICardProps[] }) {
  return (
    <motion.div className="kpi-row" variants={container} initial="hidden" animate="show">
      {metrics.map((metric) => (
        <motion.div key={metric.title} variants={item}>
          <KPICard {...metric} />
        </motion.div>
      ))}
    </motion.div>
  );
}
```

### Number Counter Animation
```tsx
import { useEffect, useState } from 'react';

export function AnimatedNumber({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return <span>{current.toLocaleString()}</span>;
}
```

---

## Data Formatting Utilities

```typescript
export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export function formatPercentage(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date));
}
```

---

## Mock Data Generator

```typescript
export function generateTimeSeriesData(days: number = 30): Array<{ date: string; value: number }> {
  const data = [];
  const now = new Date();
  let value = 1000 + Math.random() * 500;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    value += (Math.random() - 0.45) * 50; // Slight upward trend
    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.max(0, Math.round(value)),
    });
  }
  return data;
}

export function generateKPIData() {
  return [
    { title: 'Total Revenue', value: '$48,295', change: 12.5, trend: 'up' as const, color: '#6366f1' },
    { title: 'Active Users', value: '2,847', change: 8.2, trend: 'up' as const, color: '#10b981' },
    { title: 'Conversion Rate', value: '3.24%', change: -1.8, trend: 'down' as const, color: '#f59e0b' },
    { title: 'Avg Session', value: '4m 32s', change: 5.1, trend: 'up' as const, color: '#ec4899' },
  ];
}
```

---

## Critical Rules

1. **Use `ResponsiveContainer` wrapper for ALL charts** — charts without it won't resize properly
2. **Provide explicit height to chart containers** — Recharts needs a defined height (not auto)
3. **Use `react-grid-layout` for drag/resize** — not CSS Grid (which can't do user-driven rearrangement)
4. **Memoize chart data** — `useMemo()` on data transformations to prevent re-renders
5. **Debounce layout saves** — don't save grid layout on every pixel of drag
6. **Use dark tooltips on light dashboards** — high contrast for readability
7. **Limit chart data points** — max 50-100 points per line; aggregate larger datasets
8. **Animate on mount only** — don't re-animate on data refresh (jarring)
9. **Include loading skeletons** — show shimmer placeholders while data loads
10. **Color-blind friendly** — use patterns/shapes in addition to colors for accessibility
11. **Show "last updated" timestamps** — users need to know data freshness
12. **Use CSS variables for theming** — enables light/dark mode toggle instantly

---

## Dashboard Layout Best Practices

| Widget | Typical Size | Position |
|--------|-------------|----------|
| KPI Cards | 3×2 each (row of 4) | Top row |
| Main Chart | 8×6 | Left, below KPIs |
| Side Chart | 4×6 | Right, beside main |
| Data Table | 12×5 | Full width, bottom |
| Activity Feed | 4×8 | Right sidebar |
| Progress Ring | 2×3 | Corner widget |

---

## Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          layout: ['react-grid-layout'],
          animation: ['framer-motion'],
        },
      },
    },
  },
});
```
