/**
 * GlobeRenderer — wraps globe.gl with lazy initialization.
 * Handles globe creation, marker updates, and cleanup.
 * WebGL initialization is deferred to init() for testability.
 */

import type { GlobeMarker } from './globe-types.js';

/** Earth texture CDN URL */
const EARTH_TEXTURE_URL =
  'https://unpkg.com/three-globe@2.35.0/example/img/earth-blue-marble.jpg';

/** Dark background matching header */
const BG_COLOR = '#1A1D26';

/** Copper-tinted atmosphere */
const ATMOSPHERE_COLOR = 'rgba(181, 101, 43, 0.6)';

/** Auto-rotate resume delay in ms after user interaction */
const ROTATE_RESUME_DELAY = 3000;

/** Default point of view */
const DEFAULT_POV = { lat: 20, lng: 30, altitude: 2.5 };

/** Auto-rotate speed */
const AUTO_ROTATE_SPEED = 0.4;

interface GlobeInstance {
  globeImageUrl(url: string): GlobeInstance;
  backgroundColor(color: string): GlobeInstance;
  atmosphereColor(color: string): GlobeInstance;
  atmosphereAltitude(alt: number): GlobeInstance;
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
      .atmosphereAltitude(0.25)
      .pointOfView(DEFAULT_POV)
      .width(this.container.clientWidth || 800)
      .height(this.container.clientHeight || 600);

    this.configurePoints();
    this.configureAutoRotate();
    this.setupResizeHandler();
  }

  /** Whether the globe has been initialized */
  isInitialized(): boolean {
    return this.globe !== null;
  }

  /** Update the globe's marker data */
  updateMarkers(markers: GlobeMarker[]): void {
    if (!this.globe) {
      throw new Error('GlobeRenderer not initialized — call init() first');
    }

    this.globe.pointsData(markers);

    // Add pulsing rings for markers
    const ringsData = markers.map((m) => ({
      lat: m.lat,
      lng: m.lng,
      color: m.color,
      maxR: m.size * 3,
      propagationSpeed: m.pulseSpeed ?? 1,
      repeatPeriod: 1500,
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
      .pointAltitude(0.02)
      .pointRadius('size')
      .pointLabel('label');
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
