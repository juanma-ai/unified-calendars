export function createCalendarApi(aggregator) {
  const range = args => {
    if (args.length !== 2 || args.some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) {
      throw Object.assign(new Error('Invalid date range'), { status: 400 })
    }
    const [start, end] = args.map(Date.parse)
    if (end <= start || end - start > 400 * 86400000) throw Object.assign(new Error('Invalid date range'), { status: 400 })
  }
  const methods = {
    getUnifiedEvents: (...args) => { range(args); return aggregator.getUnifiedEvents(...args) },
    refreshNow: (...args) => { range(args); return aggregator.getUnifiedEvents(...args, { force: true }) },
    getCachedEvents: () => aggregator.getStartupCache(),
    getSourceStatus: () => aggregator.getSourceStatus(),
    getAvailableCalendars: () => aggregator.getAvailableCalendars()
  }
  return async (method, args) => {
    if (!Object.hasOwn(methods, method)) throw Object.assign(new Error('Method not available in read-only calendar'), { status: 403 })
    if (!Array.isArray(args) || args.length > 2) throw Object.assign(new Error('Invalid arguments'), { status: 400 })
    return methods[method](...args)
  }
}
