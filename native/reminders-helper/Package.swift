// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "RemindersHelper",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "RemindersHelper",
            path: "Sources/RemindersHelper",
            exclude: ["Info.plist"],
            linkerSettings: [
                // Bare CLI binaries have no app bundle / Info.plist, so macOS has
                // nothing to show in the Reminders permission dialog and just
                // silently denies. Embedding a plist section in the Mach-O binary
                // itself gives TCC the NSRemindersUsageDescription it needs.
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "Sources/RemindersHelper/Info.plist"
                ])
            ]
        )
    ]
)
