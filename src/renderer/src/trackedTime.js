// The implementation lives in src/shared because the tray needs it too, and main must not
// import out of the renderer. This re-export keeps every existing renderer import working.
export * from '../../shared/trackedTime.js'
