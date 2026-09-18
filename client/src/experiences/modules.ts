export const MODULES = ['Earth', 'Game', 'Analytics', 'System', 'AI', 'Energy', 'Network', 'Security', 'Files', 'Navigation'] as const;
export type ModuleName = typeof MODULES[number];
export const MODULE_HINTS: Record<ModuleName, string> = {
  Earth: 'Drag or grab to rotate · Spread to zoom · Select a location',
  Game: 'Move hand or pointer to aim · Pinch or click to fire · Defend the core for 60 seconds',
  Analytics: 'Swipe to change dataset · Select to inspect · Grab to rotate · Zoom to expand range',
  System: 'Swipe through subsystems · Select to run a diagnostic',
  AI: 'Choose a local command · Select to process · Voice indicator is a visual simulation',
  Energy: 'Swipe to change mode · Select to switch a subsystem · Grab to rotate the core',
  Network: 'Swipe through network topologies · Select a node to reroute traffic',
  Security: 'Aim at a contact · Select to scan · Swipe to change scan mode',
  Files: 'Swipe to browse · Select to preview · Select again to open · Grab to move a tile',
  Navigation: 'Swipe to change destination · Select to plot a route · Grab to orbit the map',
};
