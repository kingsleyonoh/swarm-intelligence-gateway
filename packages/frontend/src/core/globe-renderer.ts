/**
 * GlobeRenderer — wraps globe.gl with lazy initialization.
 * Handles globe creation, marker updates, and cleanup.
 * WebGL initialization is deferred to init() for testability.
 */

import type { GlobeMarker } from './globe-types.js';

/** Earth texture — use night view for dramatic look, CDN fallback */
const EARTH_TEXTURE_URL =
  'https://unpkg.com/three-globe/example/img/earth-night.jpg';

/** Dark background matching header */
const BG_COLOR = '#1A1D26';

/** Copper-tinted atmosphere (hex for globe.gl compatibility) */
const ATMOSPHERE_COLOR = '#B5652B';

/** Auto-rotate resume delay in ms after user interaction */
const ROTATE_RESUME_DELAY = 3000;

/** Default point of view */
const DEFAULT_POV = { lat: 20, lng: 30, altitude: 2.5 };

/** Auto-rotate speed */
const AUTO_ROTATE_SPEED = 0.4;

/** HTML-escape for tooltip content */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convert hex color to comma-separated RGB string */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

interface GlobeInstance {
  globeImageUrl(url: string): GlobeInstance;
  backgroundColor(color: string): GlobeInstance;
  atmosphereColor(color: string): GlobeInstance;
  atmosphereAltitude(alt: number): GlobeInstance;
  showAtmosphere(show: boolean): GlobeInstance;
  pointsData(data: unknown[]): GlobeInstance;
  pointLat(accessor: string | ((d: unknown) => number)): GlobeInstance;
  pointLng(accessor: string | ((d: unknown) => number)): GlobeInstance;
  pointColor(accessor: string | ((d: unknown) => string)): GlobeInstance;
  pointAltitude(val: number | ((d: unknown) => number)): GlobeInstance;
  pointRadius(accessor: string | ((d: unknown) => number)): GlobeInstance;
  pointLabel(accessor: string | ((d: unknown) => string)): GlobeInstance;
  ringsData(data: unknown[]): GlobeInstance;
  ringLat(accessor: string | ((d: unknown) => number)): GlobeInstance;
  ringLng(accessor: string | ((d: unknown) => number)): GlobeInstance;
  ringColor(accessor: (d: unknown) => (t: number) => string): GlobeInstance;
  ringMaxRadius(val: number): GlobeInstance;
  ringPropagationSpeed(val: number): GlobeInstance;
  ringRepeatPeriod(val: number): GlobeInstance;
  width(w: number): GlobeInstance;
  height(h: number): GlobeInstance;
  pointOfView(pov: { lat: number; lng: number; altitude: number }): GlobeInstance;
  controls(): { autoRotate: boolean; autoRotateSpeed: number };
  _destructor?(): void;
}

type GlobeFactory = () => (element: HTMLElement) => GlobeInstance;

export class GlobeRenderer {
  private container: HTMLElement;
  private globe: GlobeInstance | null = null;
  private resizeHandler: (() => void) | null = null;
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerDownHandler: (() => void) | null = null;
  private pointerUpHandler: (() => void) | null = null;
  private currentMarkers: GlobeMarker[] = [];
  private newsMarkers: GlobeMarker[] = [];
  private heatmapEnabled = false;
  private heatmapThreshold = 0.5;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Initialize the globe — dynamically imports globe.gl */
  async init(): Promise<void> {
    const Globe = (await import('globe.gl')).default as unknown as GlobeFactory;

    this.globe = Globe()(this.container)
      .globeImageUrl(EARTH_TEXTURE_URL)
      .backgroundColor(BG_COLOR)
      .atmosphereColor(ATMOSPHERE_COLOR)
      .atmosphereAltitude(0.4)
      .showAtmosphere(true)
      .pointOfView(DEFAULT_POV)
      .width(this.container.clientWidth || 800)
      .height(this.container.clientHeight || 380);

    this.configurePoints();
    this.configureRings();
    this.configureAutoRotate();
    this.setupResizeHandler();
  }

  /** Whether the globe has been initialized */
  isInitialized(): boolean {
    return this.globe !== null;
  }

  /** Update the globe's prediction marker data */
  updateMarkers(markers: GlobeMarker[]): void {
    if (!this.globe) {
      throw new Error('GlobeRenderer not initialized — call init() first');
    }

    this.currentMarkers = markers;
    this.applyAllMarkers();
  }

  /** Update the globe's news/intelligence markers */
  updateNewsMarkers(markers: GlobeMarker[]): void {
    this.newsMarkers = markers;
    this.applyAllMarkers();
  }

  /** Merge prediction + news markers and update globe */
  private applyAllMarkers(): void {
    if (!this.globe) return;
    this.globe.pointsData([...this.currentMarkers, ...this.newsMarkers]);
    this.applyRings(); // rings only for prediction markers
  }

  /** Toggle heatmap mode — larger, slower rings when enabled */
  setHeatmapMode(enabled: boolean, threshold: number): void {
    this.heatmapEnabled = enabled;
    this.heatmapThreshold = threshold;
    this.applyRings();
  }

  private applyRings(): void {
    if (!this.globe) return;
    const markers = this.heatmapEnabled
      ? this.currentMarkers.filter((m) => m.size >= this.heatmapThreshold)
      : this.currentMarkers;

    const ringsData = markers.map((m) => ({
      lat: m.lat,
      lng: m.lng,
      color: m.color,
      maxR: this.heatmapEnabled ? m.size * 8 : m.size * 3,
      propagationSpeed: this.heatmapEnabled ? 1 : 2,
      repeatPeriod: this.heatmapEnabled ? 800 : 1500,
    }));
    this.globe.ringsData(ringsData);
  }

  /** Clean up the globe and all event listeners */
  destroy(): void {
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.pointerDownHandler) {
      this.container.removeEventListener('pointerdown', this.pointerDownHandler);
      this.pointerDownHandler = null;
    }

    if (this.pointerUpHandler) {
      this.container.removeEventListener('pointerup', this.pointerUpHandler);
      this.pointerUpHandler = null;
    }

    if (this.globe?._destructor) {
      this.globe._destructor();
    }

    this.globe = null;
  }

  /** Configure point layer accessors */
  private configurePoints(): void {
    if (!this.globe) return;

    this.globe
      .pointLat('lat')
      .pointLng('lng')
      .pointColor('color')
      .pointAltitude(0.015)
      .pointRadius('size')
      .pointLabel((d: unknown) => {
        const m = d as GlobeMarker;
        return `<div style="
          font-family: 'Figtree', sans-serif;
          background: rgba(26,29,38,0.92);
          color: #F6F1E9;
          padding: 8px 14px;
          border-radius: 4px;
          font-size: 13px;
          line-height: 1.4;
          border-left: 3px solid ${m.color};
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          pointer-events: none;
          max-width: 280px;
        ">
          <div style="font-weight:600; margin-bottom:2px;">${esc(m.label.split(':')[0] ?? '')}</div>
          <div style="color: rgba(246,241,233,0.6); font-size:12px;">${esc(m.label.split(':').slice(1).join(':').trim())}</div>
        </div>`;
      });
  }

  /** Configure pulsing ring layer accessors */
  private configureRings(): void {
    if (!this.globe) return;

    this.globe
      .ringLat('lat')
      .ringLng('lng')
      .ringColor((d: unknown) => {
        const ring = d as { color: string };
        return (t: number) => `rgba(${hexToRgb(ring.color)},${1 - t})`;
      })
      .ringMaxRadius(4)
      .ringPropagationSpeed(2)
      .ringRepeatPeriod(1500);
  }

  /** Configure auto-rotate with user interaction pause */
  private configureAutoRotate(): void {
    if (!this.globe) return;

    const controls = this.globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED;

    this.pointerDownHandler = () => {
      const ctrl = this.globe?.controls();
      if (ctrl) ctrl.autoRotate = false;
      if (this.rotateTimer) {
        clearTimeout(this.rotateTimer);
        this.rotateTimer = null;
      }
    };

    this.pointerUpHandler = () => {
      this.rotateTimer = setTimeout(() => {
        const ctrl = this.globe?.controls();
        if (ctrl) ctrl.autoRotate = true;
      }, ROTATE_RESUME_DELAY);
    };

    this.container.addEventListener('pointerdown', this.pointerDownHandler);
    this.container.addEventListener('pointerup', this.pointerUpHandler);
  }

  /** Setup window resize handler */
  private setupResizeHandler(): void {
    this.resizeHandler = () => {
      if (!this.globe) return;
      this.globe
        .width(this.container.clientWidth || 800)
        .height(this.container.clientHeight || 600);
    };

    window.addEventListener('resize', this.resizeHandler);
  }
}
