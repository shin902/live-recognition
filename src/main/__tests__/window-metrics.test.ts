import { describe, it, expect } from 'vitest';
import { computeWindowBounds, DisplayInfo, WindowConfig } from '../window-metrics';

describe('computeWindowBounds', () => {
  const config: WindowConfig = {
    WIDTH: 600,
    HEIGHT: 60,
    MARGIN_BOTTOM: 20,
  };

  it('should calculate correct bounds for standard 1920x1080 display', () => {
    const display: DisplayInfo = {
      workAreaSize: { width: 1920, height: 1080 },
      scaleFactor: 1,
    };

    const result = computeWindowBounds(display, config);

    expect(result).toEqual({
      width: 600,
      height: 60,
      x: 660, // (1920 - 600) / 2
      y: 1000, // 1080 - 60 - 20
    });
  });

  it('should calculate correct bounds for Retina display (scaleFactor 2.0)', () => {
    // workAreaSizeは既に論理ピクセルなので、scaleFactorに依存しない
    const display: DisplayInfo = {
      workAreaSize: { width: 1440, height: 900 },
      scaleFactor: 2,
    };

    const result = computeWindowBounds(display, config);

    expect(result).toEqual({
      width: 600,
      height: 60,
      x: 420, // (1440 - 600) / 2
      y: 820, // 900 - 60 - 20
    });
  });

  it('should handle small screen where window fits exactly', () => {
    const display: DisplayInfo = {
      workAreaSize: { width: 600, height: 100 },
      scaleFactor: 1,
    };

    const result = computeWindowBounds(display, config);

    expect(result).toEqual({
      width: 600,
      height: 60,
      x: 0, // (600 - 600) / 2
      y: 20, // 100 - 60 - 20
    });
  });

  it('should prevent negative y coordinate on very small screen', () => {
    const display: DisplayInfo = {
      workAreaSize: { width: 800, height: 70 },
      scaleFactor: 1,
    };

    const result = computeWindowBounds(display, config);

    expect(result).toEqual({
      width: 600,
      height: 60,
      x: 100, // (800 - 600) / 2
      y: 0, // max(0, 70 - 60 - 20) = max(0, -10) = 0
    });
  });

  it('should handle 4K display', () => {
    const display: DisplayInfo = {
      workAreaSize: { width: 3840, height: 2160 },
      scaleFactor: 1,
    };

    const result = computeWindowBounds(display, config);

    expect(result).toEqual({
      width: 600,
      height: 60,
      x: 1620, // (3840 - 600) / 2
      y: 2080, // 2160 - 60 - 20
    });
  });

  it('should use custom config values', () => {
    const customConfig: WindowConfig = {
      WIDTH: 800,
      HEIGHT: 100,
      MARGIN_BOTTOM: 50,
    };
    const display: DisplayInfo = {
      workAreaSize: { width: 1920, height: 1080 },
      scaleFactor: 1,
    };

    const result = computeWindowBounds(display, customConfig);

    expect(result).toEqual({
      width: 800,
      height: 100,
      x: 560, // (1920 - 800) / 2
      y: 930, // 1080 - 100 - 50
    });
  });
});
