import { svgEl } from '../dom';
import { formatCompact } from '../../lib/format';

export interface MultiSeriesInput {
  label: string;
  values: Array<number | null>;
  color?: string;
}

export interface MultiSeriesChartOptions {
  series: MultiSeriesInput[];
  labels: string[];
  height?: number;
  stacked?: boolean;
  step?: boolean;
  valueLabel?: string;
  format?: (value: number) => string;
}

const DEFAULT_COLORS = [
  'var(--accent)',
  'var(--cyan)',
  'var(--green)',
  'var(--violet)',
  '#f472b6',
  '#facc15',
  'var(--faint)',
];

function linePath(
  values: Array<number | null>,
  x: (index: number) => number,
  y: (value: number) => number,
  step: boolean,
): string {
  let path = '';
  let open = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      open = false;
      continue;
    }
    if (!open) {
      path += `M ${x(index)} ${y(value)}`;
      open = true;
    } else if (step) {
      path += ` H ${x(index)} V ${y(value)}`;
    } else {
      path += ` L ${x(index)} ${y(value)}`;
    }
  }
  return path;
}

export function multiSeriesChart({
  series,
  labels,
  height = 190,
  stacked = false,
  step = false,
  valueLabel = 'Value',
  format = formatCompact,
}: MultiSeriesChartOptions): SVGSVGElement {
  const width = 640;
  const padding = { top: 16, right: 16, bottom: 28, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const pointCount = Math.max(
    labels.length,
    ...series.map((item) => item.values.length),
    0,
  );

  const svg = svgEl('svg', {
    class: 'line-chart multi-chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${valueLabel} history`,
  });

  if (!series.length || pointCount === 0) {
    svg.append(
      svgEl(
        'text',
        {
          x: width / 2,
          y: height / 2,
          'text-anchor': 'middle',
          class: 'chart-empty',
        },
        'No history yet',
      ),
    );
    return svg;
  }

  let min = 0;
  let max = 0;
  if (stacked) {
    for (let index = 0; index < pointCount; index += 1) {
      let total = 0;
      for (const item of series) total += Math.max(0, item.values[index] ?? 0);
      if (total > max) max = total;
    }
    if (max === 0) max = 1;
  } else {
    min = Number.POSITIVE_INFINITY;
    max = Number.NEGATIVE_INFINITY;
    for (const item of series) {
      for (const value of item.values) {
        if (value === null || value === undefined || !Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (min === max) {
      const delta = Math.abs(min) * 0.1 || 1;
      min -= delta;
      max += delta;
    }
    min -= (max - min) * 0.05;
    max += (max - min) * 0.05;
  }

  const x = (index: number): number =>
    padding.left +
    (pointCount === 1 ? plotWidth / 2 : (index / (pointCount - 1)) * plotWidth);
  const y = (value: number): number =>
    padding.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  for (let grid = 0; grid <= 3; grid += 1) {
    const gy = padding.top + (grid / 3) * plotHeight;
    const gridValue = max - (grid / 3) * (max - min);
    svg.append(
      svgEl('line', {
        x1: padding.left,
        x2: width - padding.right,
        y1: gy,
        y2: gy,
        class: 'chart-gridline',
      }),
      svgEl(
        'text',
        {
          x: padding.left - 8,
          y: gy + 4,
          'text-anchor': 'end',
          class: 'chart-axis-label',
        },
        format(gridValue),
      ),
    );
  }

  if (stacked) {
    const cumulative = new Array<number>(pointCount).fill(0);
    series.forEach((item, seriesIndex) => {
      const color = item.color ?? DEFAULT_COLORS[seriesIndex % DEFAULT_COLORS.length] ?? 'var(--accent)';
      const bottom = [...cumulative];
      for (let index = 0; index < pointCount; index += 1) {
        cumulative[index] = (cumulative[index] ?? 0) + Math.max(0, item.values[index] ?? 0);
      }
      let area = `M ${x(0)} ${y(cumulative[0] ?? 0)}`;
      for (let index = 1; index < pointCount; index += 1) {
        area += ` L ${x(index)} ${y(cumulative[index] ?? 0)}`;
      }
      for (let index = pointCount - 1; index >= 0; index -= 1) {
        area += ` L ${x(index)} ${y(bottom[index] ?? 0)}`;
      }
      area += ' Z';
      svg.append(
        svgEl('path', {
          d: area,
          fill: color,
          'fill-opacity': '0.2',
          stroke: color,
          'stroke-width': '1.5',
        }),
      );
    });
  } else {
    series.forEach((item, seriesIndex) => {
      const color = item.color ?? DEFAULT_COLORS[seriesIndex % DEFAULT_COLORS.length] ?? 'var(--accent)';
      const path = linePath(item.values, x, y, step);
      if (path) {
        svg.append(
          svgEl('path', {
            d: path,
            fill: 'none',
            stroke: color,
            'stroke-width': '2',
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
          }),
        );
      }
    });
  }

  if (labels.length) {
    svg.append(
      svgEl(
        'text',
        {
          x: padding.left,
          y: height - 8,
          'text-anchor': 'start',
          class: 'chart-axis-label',
        },
        labels[0] ?? '',
      ),
      svgEl(
        'text',
        {
          x: width - padding.right,
          y: height - 8,
          'text-anchor': 'end',
          class: 'chart-axis-label',
        },
        labels[labels.length - 1] ?? '',
      ),
    );
  }

  return svg;
}

export interface LineChartOptions {
  values: number[];
  labels: string[];
  height?: number;
  color?: string;
  valueLabel?: string;
  format?: (value: number) => string;
}

export function lineChart({
  values,
  labels,
  height = 170,
  color = 'var(--accent)',
  valueLabel = 'Value',
  format = formatCompact,
}: LineChartOptions): SVGSVGElement {
  const width = 640;
  const padding = { top: 16, right: 16, bottom: 28, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const svg = svgEl('svg', {
    class: 'line-chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${valueLabel} history`,
  });

  if (values.length === 0) {
    svg.append(
      svgEl(
        'text',
        {
          x: width / 2,
          y: height / 2,
          'text-anchor': 'middle',
          class: 'chart-empty',
        },
        'No history yet',
      ),
    );
    return svg;
  }

  const numeric = values.map((value) => (Number.isFinite(value) ? value : 0));
  let min = Math.min(...numeric);
  let max = Math.max(...numeric);
  if (min === max) {
    const delta = Math.abs(min) * 0.1 || 1;
    min -= delta;
    max += delta;
  }
  const span = max - min;
  min -= span * 0.05;
  max += span * 0.05;

  const x = (index: number): number =>
    padding.left +
    (numeric.length === 1 ? plotWidth / 2 : (index / (numeric.length - 1)) * plotWidth);
  const y = (value: number): number =>
    padding.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  for (let grid = 0; grid <= 3; grid += 1) {
    const gy = padding.top + (grid / 3) * plotHeight;
    const gridValue = max - (grid / 3) * (max - min);
    svg.append(
      svgEl('line', {
        x1: padding.left,
        x2: width - padding.right,
        y1: gy,
        y2: gy,
        class: 'chart-gridline',
      }),
      svgEl(
        'text',
        {
          x: padding.left - 8,
          y: gy + 4,
          'text-anchor': 'end',
          class: 'chart-axis-label',
        },
        format(gridValue),
      ),
    );
  }

  const points = numeric.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const areaPoints = `${padding.left},${padding.top + plotHeight} ${points} ${
    width - padding.right
  },${padding.top + plotHeight}`;

  svg.append(
    svgEl('polygon', { points: areaPoints, fill: color, 'fill-opacity': '0.10' }),
    svgEl('polyline', {
      points,
      fill: 'none',
      stroke: color,
      'stroke-width': '2.5',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }),
  );

  numeric.forEach((value, index) => {
    const circle = svgEl('circle', {
      cx: x(index),
      cy: y(value),
      r: numeric.length > 60 ? 1.4 : 2.6,
      fill: color,
    });
    circle.append(svgEl('title', {}, `${labels[index] ?? ''}: ${format(value)}`));
    svg.append(circle);
  });

  if (labels.length) {
    svg.append(
      svgEl(
        'text',
        {
          x: padding.left,
          y: height - 8,
          'text-anchor': 'start',
          class: 'chart-axis-label',
        },
        labels[0] ?? '',
      ),
      svgEl(
        'text',
        {
          x: width - padding.right,
          y: height - 8,
          'text-anchor': 'end',
          class: 'chart-axis-label',
        },
        labels[labels.length - 1] ?? '',
      ),
    );
  }

  return svg;
}
