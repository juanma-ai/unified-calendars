// Electron wraps handler errors as "Error invoking remote method '…': Error: <message>".
// Every surface that shows an IPC failure to the user unwraps it the same way.
export function getIpcErrorMessage(error) {
  const message = error?.message ?? ''
  const match = /Error:\s*(.*)$/.exec(message)
  return (match?.[1] || message || 'Something went wrong').trim()
}
