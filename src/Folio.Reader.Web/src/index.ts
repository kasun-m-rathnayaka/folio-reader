/**
 * Folio.Reader.Web - TypeScript Facade over pdf.js
 * Interop bridge between Blazor / .NET 10 and WebViewer canvas/overlay layers.
 */

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReadingPositionEvent {
  pageIndex: number;
  offsetPercent: number;
  zoom: number;
}

export interface TextSelectionEvent {
  pageIndex: number;
  selectedText: string;
  rects: NormalizedRect[];
}

export interface ReaderCommands {
  goTo(pageIndex: number, offsetPercent?: number): void;
  setTheme(themeName: 'light' | 'dark' | 'sepia'): void;
  drawOverlays(pageIndex: number, rects: NormalizedRect[], colorHex: string): void;
  setFollowSentence(pageIndex: number, rects: NormalizedRect[]): void;
  setOcrLayer(pageIndex: number, words: { text: string; bounds: NormalizedRect }[]): void;
}

console.log('[Folio.Reader.Web] Module initialized.');
