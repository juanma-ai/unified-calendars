import EventKit
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

enum Command {
    case fetch(start: Date, end: Date)
    case setDue(id: String, due: Date)
    case setCompleted(id: String, completed: Bool)
}

func parseArgs() -> (command: Command, output: URL?) {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let fallbackFormatter = ISO8601DateFormatter()
    // All-day items travel as plain calendar dates; they mean local midnight.
    let dateOnlyFormatter = ISO8601DateFormatter()
    dateOnlyFormatter.formatOptions = [.withFullDate]
    dateOnlyFormatter.timeZone = TimeZone.current

    func parseDate(_ value: String) -> Date? {
        formatter.date(from: value)
            ?? fallbackFormatter.date(from: value)
            ?? dateOnlyFormatter.date(from: value)
    }

    var start: Date?
    var end: Date?
    var setDueId: String?
    var due: Date?
    var completedChange: (id: String, completed: Bool)?
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
        case "--set-due":
            guard let value = iterator.next(), !value.isEmpty else {
                fail("--set-due requires a reminder identifier")
            }
            setDueId = value
        case "--due":
            guard let value = iterator.next(), let date = parseDate(value) else {
                fail("--due requires a valid ISO 8601 value")
            }
            due = date
        case "--complete":
            guard let value = iterator.next(), !value.isEmpty else {
                fail("--complete requires a reminder identifier")
            }
            completedChange = (id: value, completed: true)
        case "--uncomplete":
            guard let value = iterator.next(), !value.isEmpty else {
                fail("--uncomplete requires a reminder identifier")
            }
            completedChange = (id: value, completed: false)
        case "--output":
            guard let value = iterator.next(), !value.isEmpty else {
                fail("--output requires a file path")
            }
            output = URL(fileURLWithPath: value)
        default:
            break
        }
    }

    if let setDueId {
        guard let due else { fail("--set-due requires --due <ISO8601>") }
        return (.setDue(id: setDueId, due: due), output)
    }

    if let completedChange {
        return (.setCompleted(id: completedChange.id, completed: completedChange.completed), output)
    }

    guard let start, let end else {
        fail("Usage: reminders-helper --start <ISO8601> --end <ISO8601>"
            + " | --set-due <id> --due <ISO8601>"
            + " | --complete <id> | --uncomplete <id>")
    }
    return (.fetch(start: start, end: end), output)
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

func makeReminderOut(_ reminder: EKReminder, components: DateComponents, date: Date) -> ReminderOut {
    ReminderOut(
        id: reminder.calendarItemIdentifier,
        title: reminder.title ?? "(no title)",
        dueDate: ISO8601DateFormatter().string(from: date),
        allDay: components.hour == nil,
        isCompleted: reminder.isCompleted,
        listName: reminder.calendar.title,
        notes: reminder.notes
    )
}

func writeOutput<T: Encodable>(_ value: T, to outputURL: URL?) {
    do {
        let data = try JSONEncoder().encode(value)
        if let outputURL {
            try data.write(to: outputURL, options: .atomic)
        } else {
            FileHandle.standardOutput.write(data)
        }
    } catch {
        fail("json-encode-error: \(error.localizedDescription)")
    }
}

let (command, outputURL) = parseArgs()
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

switch command {
case let .fetch(rangeStart, rangeEnd):
    let calendars = store.calendars(for: .reminder)
    let predicate = store.predicateForReminders(in: calendars)

    let fetchSemaphore = DispatchSemaphore(value: 0)
    var results: [ReminderOut] = []

    store.fetchReminders(matching: predicate) { reminders in
        defer { fetchSemaphore.signal() }
        guard let reminders = reminders else { return }

        for reminder in reminders {
            guard let components = reminder.dueDateComponents,
                  let date = Calendar.current.date(from: components) else { continue }
            guard date >= rangeStart && date <= rangeEnd else { continue }

            results.append(makeReminderOut(reminder, components: components, date: date))
        }
    }
    fetchSemaphore.wait()

    writeOutput(results, to: outputURL)

case let .setDue(id, due):
    guard let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
        fail("not-found: no reminder with identifier \(id)")
    }

    // A reminder with no hour component is an all-day item; keep it that way so
    // moving it between days doesn't silently give it a time.
    let isAllDay = reminder.dueDateComponents?.hour == nil
    let fields: Set<Calendar.Component> = isAllDay
        ? [.year, .month, .day]
        : [.year, .month, .day, .hour, .minute, .second]
    let components = Calendar.current.dateComponents(fields, from: due)
    reminder.dueDateComponents = components

    do {
        try store.save(reminder, commit: true)
    } catch {
        fail("save-failed: \(error.localizedDescription)")
    }

    guard let saved = reminder.dueDateComponents,
          let savedDate = Calendar.current.date(from: saved) else {
        fail("save-failed: reminder has no due date after saving")
    }

    writeOutput(makeReminderOut(reminder, components: saved, date: savedDate), to: outputURL)

case let .setCompleted(id, completed):
    guard let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
        fail("not-found: no reminder with identifier \(id)")
    }

    reminder.isCompleted = completed

    do {
        try store.save(reminder, commit: true)
    } catch {
        fail("save-failed: \(error.localizedDescription)")
    }

    guard let saved = reminder.dueDateComponents,
          let savedDate = Calendar.current.date(from: saved) else {
        fail("save-failed: reminder has no due date after saving")
    }

    writeOutput(makeReminderOut(reminder, components: saved, date: savedDate), to: outputURL)
}
