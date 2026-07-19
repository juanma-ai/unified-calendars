import EventKit
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

func parseArgs() -> (start: Date, end: Date, output: URL?) {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let fallbackFormatter = ISO8601DateFormatter()

    func parseDate(_ value: String) -> Date? {
        formatter.date(from: value) ?? fallbackFormatter.date(from: value)
    }

    var start: Date?
    var end: Date?
    var output: URL?
    var iterator = CommandLine.arguments.dropFirst().makeIterator()

    while let arg = iterator.next() {
        switch arg {
        case "--start":
            guard let value = iterator.next(), let date = parseDate(value) else {
                fail("--start requires a valid ISO 8601 value")
            }
            start = date
        case "--end":
            guard let value = iterator.next(), let date = parseDate(value) else {
                fail("--end requires a valid ISO 8601 value")
            }
            end = date
        case "--output":
            guard let value = iterator.next(), !value.isEmpty else {
                fail("--output requires a file path")
            }
            output = URL(fileURLWithPath: value)
        default:
            break
        }
    }

    guard let s = start, let e = end else {
        fail("Usage: reminders-helper --start <ISO8601> --end <ISO8601>")
    }
    return (s, e, output)
}

struct ReminderOut: Codable {
    let id: String
    let title: String
    let dueDate: String
    let allDay: Bool
    let isCompleted: Bool
    let listName: String
    let notes: String?
}

let (rangeStart, rangeEnd, outputURL) = parseArgs()
let store = EKEventStore()

let accessSemaphore = DispatchSemaphore(value: 0)
var accessGranted = false
var accessError: Error?

if #available(macOS 14.0, *) {
    store.requestFullAccessToReminders { granted, error in
        accessGranted = granted
        accessError = error
        accessSemaphore.signal()
    }
} else {
    store.requestAccess(to: .reminder) { granted, error in
        accessGranted = granted
        accessError = error
        accessSemaphore.signal()
    }
}
accessSemaphore.wait()

if !accessGranted {
    let message = accessError?.localizedDescription ?? "Reminders access was not granted"
    fail("permission-denied: \(message)")
}

let calendars = store.calendars(for: .reminder)
let predicate = store.predicateForReminders(in: calendars)

let fetchSemaphore = DispatchSemaphore(value: 0)
var results: [ReminderOut] = []

store.fetchReminders(matching: predicate) { reminders in
    defer { fetchSemaphore.signal() }
    guard let reminders = reminders else { return }

    let outputFormatter = ISO8601DateFormatter()

    for reminder in reminders {
        guard let components = reminder.dueDateComponents,
              let date = Calendar.current.date(from: components) else { continue }
        guard date >= rangeStart && date <= rangeEnd else { continue }

        results.append(ReminderOut(
            id: reminder.calendarItemIdentifier,
            title: reminder.title ?? "(no title)",
            dueDate: outputFormatter.string(from: date),
            allDay: components.hour == nil,
            isCompleted: reminder.isCompleted,
            listName: reminder.calendar.title,
            notes: reminder.notes
        ))
    }
}
fetchSemaphore.wait()

do {
    let data = try JSONEncoder().encode(results)
    if let outputURL {
        try data.write(to: outputURL, options: .atomic)
    } else {
        FileHandle.standardOutput.write(data)
    }
} catch {
    fail("json-encode-error: \(error.localizedDescription)")
}
