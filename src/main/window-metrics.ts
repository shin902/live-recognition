export interface WindowConfig {
  WIDTH: number;
  HEIGHT: number;
  MARGIN_BOTTOM: number;
}

export interface DisplayInfo {
  workAreaSize: {
    width: number;
    height: number;
  };
  scaleFactor: number;
}

export const computeWindowBounds = (
  display: DisplayInfo,
  config: WindowConfig,
): { width: number; height: number; x: number; y: number } => {
  const scaleFactor = Math.max(display.scaleFactor, 1);
  const width = Math.round(config.WIDTH * scaleFactor);
  const height = Math.round(config.HEIGHT * scaleFactor);
  const marginBottom = Math.round(config.MARGIN_BOTTOM * scaleFactor);
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;

  return {
    width,
    height,
    x: Math.round((screenWidth - width) / 2),
    y: screenHeight - height - marginBottom,
  };
};
