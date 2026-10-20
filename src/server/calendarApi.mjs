export function createCalendarApi(aggregatorFor) {
  const range = args => {
    if (args.length !== 2 || args.some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) {
      throw Object.assign(new Error('Invalid date range'), { status: 400 })
    }
    const [start, end] = args.map(Date.parse)
    if (end <= start || end - start > 400 * 86400000) throw Object.assign(new Error('Invalid date range'), { status: 400 })
  }
  const methods = {
    getUnifiedEvents: (aggregator, ...args) => { range(args); return aggregator.getUnifiedEvents(...args) },
    refreshNow: (aggregator, ...args) => { range(args); return aggregator.getUnifiedEvents(...args, { force: true }) },
    getCachedEvents: aggregator => aggregator.getStartupCache(),
    getSourceStatus: aggregator => aggregator.getSourceStatus(),
    getAvailableCalendars: aggregator => aggregator.getAvailableCalendars()
  }
  return async (method, args, context) => {
    // Every call acts for a signed-in family member; without one there is no
    // Radicale account to read or write with.
    if (typeof context?.user !== 'string' || !context.user) throw Object.assign(new Error('Sign in required'), { status: 401 })
    if (!Object.hasOwn(methods, method)) throw Object.assign(new Error('Method not available in read-only calendar'), { status: 403 })
    if (!Array.isArray(args) || args.length > 2) throw Object.assign(new Error('Invalid arguments'), { status: 400 })
    return methods[method](aggregatorFor(context.user), ...args)
  }
}
