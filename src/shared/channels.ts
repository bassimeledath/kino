export const Channels = {
  SOURCES_LIST: 'sources:list',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_STATUS: 'recording:status',
  CURSOR_DATA: 'cursor:data',
  EXPORT_START: 'export:start',
  EXPORT_PROGRESS: 'export:progress',
  EXPORT_DONE: 'export:done',
  PERMISSIONS_CHECK: 'permissions:check',
  // Toolbar phase transitions
  TOOLBAR_START_RECORDING: 'toolbar:start-recording',
  TOOLBAR_STOP_RECORDING: 'toolbar:stop-recording',
  TOOLBAR_RECORDING_TIMER: 'toolbar:recording-timer',
} as const
