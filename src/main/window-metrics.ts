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

/**
 * ウィンドウの位置とサイズを計算する
 * workAreaSizeは既にスケーリングを考慮した論理ピクセル値のため、scaleFactorによる乗算は不要
 * @param display - ディスプレイ情報（workAreaSize, scaleFactor）
 * @param config - ウィンドウ設定（WIDTH, HEIGHT, MARGIN_BOTTOM）
 * @returns ウィンドウの幅、高さ、x座標、y座標
 */
export const computeWindowBounds = (
  display: DisplayInfo,
  config: WindowConfig
): { width: number; height: number; x: number; y: number } => {
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  const width = config.WIDTH;
  const height = config.HEIGHT;
  const marginBottom = config.MARGIN_BOTTOM;

  return {
    width,
    height,
    x: Math.round((screenWidth - width) / 2),
    y: screenHeight - height - marginBottom,
  };
};
