import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip
);

const PRIMARY_COLOR = '#4db6ac';
const PRIMARY_FILL = 'rgba(77, 182, 172, 0.1)';

export class ChartInitializer {
  private observer: MutationObserver | null = null;
  private charts = new Map<HTMLCanvasElement, Chart>();

  attach(container: HTMLElement) {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            const canvases = node.querySelectorAll<HTMLCanvasElement>(
              'canvas.c-chart-canvas'
            );
            canvases.forEach((c) => this.initCanvas(c));

            // Also check if the node itself is a canvas
            if (
              node instanceof HTMLCanvasElement &&
              node.classList.contains('c-chart-canvas')
            ) {
              this.initCanvas(node);
            }
          }
        }
      }
    });

    this.observer.observe(container, { childList: true, subtree: true });

    // Init any already-present canvases
    container
      .querySelectorAll<HTMLCanvasElement>('canvas.c-chart-canvas')
      .forEach((c) => this.initCanvas(c));
  }

  reattach(container: HTMLElement) {
    this.observer?.disconnect();
    this.observer = null;
    this.attach(container);
  }

  detach() {
    this.observer?.disconnect();
    this.observer = null;
    this.charts.forEach((chart) => chart.destroy());
    this.charts.clear();
  }

  private initCanvas(canvas: HTMLCanvasElement) {
    if (this.charts.has(canvas)) return;

    // Chart config is stored as JSON in the canvas fallback text,
    // since Angular's sanitizer strips data-* attributes from [innerHTML].
    let type: 'area' | 'bar';
    let labels: string[];
    let values: number[];

    try {
      const config = JSON.parse(canvas.textContent ?? '');
      type = config.type;
      labels = config.labels;
      values = config.values;
    } catch {
      return;
    }

    if (!labels?.length || !values?.length) return;

    // Clear fallback text before Chart.js init
    canvas.textContent = '';

    const chart = new Chart(canvas, {
      type: type === 'bar' ? 'bar' : 'line',
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderColor: PRIMARY_COLOR,
            backgroundColor:
              type === 'bar' ? PRIMARY_COLOR : PRIMARY_FILL,
            fill: type !== 'bar',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: PRIMARY_COLOR
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            titleFont: { size: 12 },
            bodyFont: { size: 12 },
            padding: 8,
            cornerRadius: 6
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#6b7280' }
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { size: 11 }, color: '#6b7280' }
          }
        }
      }
    });

    this.charts.set(canvas, chart);
  }
}
