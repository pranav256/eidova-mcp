/**
 * A working home screen built from a SwiftUI kit, which the local server writes
 * beside the kit. Agents rarely composed the kit's parts on their own and hand
 * built plainer screens, so the kit hands them a finished screen to change in
 * place, as the React kit does with its starting App.tsx. [BD-1349]
 */

import type { KitFile } from "./write-kit-files";

/** Where the starter goes in an app with no root view yet. */
export const SWIFTUI_STARTER_ROOT_PATH = "ContentView.swift";
/** Where it goes when the app already has a ContentView. */
export const SWIFTUI_STARTER_PATH = "StarterScreen.swift";

const SCREEN_TEXT = "a working home screen built from this kit: one glass summary card with a progress ring, the streak and the week, a list where each item has its own colour and a done state, and a reminder switch, over a lit background.";
const KEEP_TEXT = "Change it in place with the edit tool. Never delete it or rewrite it from scratch: replace the items, titles, icons and copy with the real ones, and adapt the sections to the request. Keep its order, its colour per item, its done state and its glass. Keep the round + button in the header, because it is the screen's add action, and keep the week as the capsule bars in the summary card: never replace them with a Swift Charts chart.";

/** What the kit reply says, by the path the starter went to. */
export function swiftUiStarterNote(written: string[]): string | null {
  if (written.includes(SWIFTUI_STARTER_ROOT_PATH)) return `\`ContentView.swift\` already holds ${SCREEN_TEXT} It is the app's root view. ${KEEP_TEXT}`;
  if (written.includes(SWIFTUI_STARTER_PATH)) return `\`StarterScreen.swift\` holds ${SCREEN_TEXT} Show it from your root view with \`StarterScreen().dsTheme(for: colorScheme)\`. ${KEEP_TEXT}`;
  return null;
}

/** The starter, written only when the app folder lacks it, so a developer's edits are never replaced. */
export function swiftUiStarterFile(): KitFile {
  return {
    path: SWIFTUI_STARTER_ROOT_PATH,
    content: ROOT_VIEW + STARTER_SOURCE,
    onlyIfMissing: true,
    fallback: { path: SWIFTUI_STARTER_PATH, content: STARTER_SOURCE },
  };
}

// The root view the starter carries when it is the app's first ContentView.
const ROOT_VIEW = String.raw`// The app's root view, written by Better Design from this kit.
import SwiftUI

struct ContentView: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        StarterScreen().dsTheme(for: colorScheme)
    }
}

`;

const STARTER_SOURCE = String.raw`// Starter home screen, written by Better Design from this kit.
// Show it from your root view, then change it in place: replace the items,
// titles and copy with the real ones. Keep the order: the summary, the list
// the person acts on, the history, the settings.
import SwiftUI

struct StarterScreen: View {
    @Environment(\.dsTheme) private var theme
    @State private var items = StarterItem.samples
    @State private var remindersOn = true

    private var done: Int { items.filter(\.isDone).count }
    private var progress: Double { items.isEmpty ? 0 : Double(done) / Double(items.count) }

    var body: some View {
        ZStack {
            // Glass needs a lit surface behind it, not white on white.
            LinearGradient(
                colors: [theme.colors.primary.opacity(0.22), StarterItem.tints[3].opacity(0.12), theme.colors.background],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    summary
                    list
                    reminder
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 40)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                    .dsFont(15, weight: .medium)
                    .foregroundStyle(theme.colors.mutedForeground)
                Text("Today")
                    .dsFont(34, weight: .bold, relativeTo: .largeTitle)
                    .foregroundStyle(theme.colors.foreground)
            }
            Spacer()
            Button {
                // Add an item.
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(theme.colors.foreground)
                    .frame(width: 44, height: 44)
            }
            .glassEffect(.regular.interactive(), in: .circle)
            .accessibilityLabel("Add")
        }
    }

    // One summary card: the ring, what is left in words, the streak and the week.
    private var summary: some View {
        VStack(alignment: .leading, spacing: 14) {
            ringRow
            Divider().overlay(theme.colors.mutedForeground.opacity(0.15))
            week
        }
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 26))
    }

    private var ringRow: some View {
        HStack(spacing: 18) {
            ZStack {
                Circle().stroke(theme.colors.mutedForeground.opacity(0.18), lineWidth: 10)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(theme.colors.primary, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(Int((progress * 100).rounded()))%")
                    .dsFont(17, weight: .semibold)
                    .foregroundStyle(theme.colors.foreground)
                    .monospacedDigit()
            }
            .frame(width: 64, height: 64)
            .animation(.snappy, value: progress)
            VStack(alignment: .leading, spacing: 4) {
                Text("\(items.count - done) left for today")
                    .dsFont(20, weight: .semibold)
                    .foregroundStyle(theme.colors.foreground)
                Text(done == items.count ? "All done. See you tomorrow." : "Keep the streak going")
                    .dsFont(15)
                    .foregroundStyle(theme.colors.mutedForeground)
            }
            Spacer(minLength: 0)
            streak
        }
    }

    // The streak sits beside the progress as a badge, so the card stays one row tall.
    private var streak: some View {
        VStack(spacing: 0) {
            Label("5", systemImage: "flame.fill")
                .dsFont(17, weight: .bold)
                .monospacedDigit()
            Text("day streak").dsFont(11, weight: .medium)
        }
        .foregroundStyle(StarterItem.tints[2])
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(StarterItem.tints[2].opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // The list the person acts on comes right under the summary.
    private var list: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Your list").dsFont(20, weight: .semibold).foregroundStyle(theme.colors.foreground)
                Spacer()
                Text("\(done) of \(items.count) done").dsFont(15).foregroundStyle(theme.colors.mutedForeground).monospacedDigit()
            }
            ForEach($items) { $item in
                StarterRow(item: $item)
            }
        }
    }

    private var week: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("This week").dsFont(15, weight: .semibold).foregroundStyle(theme.colors.foreground)
                Spacer()
                Text("4 full days").dsFont(13).foregroundStyle(theme.colors.mutedForeground)
            }
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(Array(StarterItem.week.enumerated()), id: \.offset) { index, day in
                    let isToday = index == StarterItem.week.count - 1
                    let share = isToday ? progress : day.share
                    VStack(spacing: 5) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(StarterItem.tints[2])
                            .opacity(share >= 1 ? 1 : 0)
                        ZStack(alignment: .bottom) {
                            Capsule().fill(theme.colors.mutedForeground.opacity(0.14))
                            Capsule()
                                .fill(theme.colors.primary.opacity(isToday || share >= 1 ? 1 : 0.45))
                                .frame(height: max(10, 52 * share))
                        }
                        .frame(width: 24, height: 52)
                        Text(day.label)
                            .dsFont(11, weight: isToday ? .bold : .regular)
                            .foregroundStyle(isToday ? theme.colors.primary : theme.colors.mutedForeground)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    // A setting stays compact and last.
    private var reminder: some View {
        HStack(spacing: 14) {
            Image(systemName: "bell.fill")
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(StarterItem.tints[4], in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("Daily reminder").dsFont(16, weight: .semibold).foregroundStyle(theme.colors.foreground)
                Text("Every day at 8:00").dsFont(13).foregroundStyle(theme.colors.mutedForeground)
            }
            Spacer()
            Toggle("Daily reminder", isOn: $remindersOn).labelsHidden().tint(theme.colors.primary)
        }
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 22))
    }
}

/// One item the person checks off: its own colour on a solid icon tile, and a
/// done state shown three ways.
private struct StarterRow: View {
    @Environment(\.dsTheme) private var theme
    @Binding var item: StarterItem

    var body: some View {
        Button {
            withAnimation(.snappy) { item.isDone.toggle() }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: item.symbol)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(item.tint.gradient, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .dsFont(16, weight: .semibold)
                        .strikethrough(item.isDone)
                        .foregroundStyle(theme.colors.foreground.opacity(item.isDone ? 0.55 : 1))
                    Text(item.detail)
                        .dsFont(13)
                        .foregroundStyle(theme.colors.mutedForeground)
                }
                Spacer()
                Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 26))
                    .foregroundStyle(item.isDone ? item.tint : theme.colors.mutedForeground.opacity(0.6))
                    .contentTransition(.symbolEffect(.replace))
            }
            .padding(14)
            .glassEffect(.regular.tint(item.isDone ? item.tint.opacity(0.22) : .clear).interactive(), in: .rect(cornerRadius: 20))
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.success, trigger: item.isDone)
        .accessibilityValue(item.isDone ? "Done" : "Not done")
    }
}

/// Sample data, part-way through the day. Replace it with the real items.
struct StarterItem: Identifiable {
    let id = UUID()
    var title: String
    var detail: String
    var symbol: String
    var tint: Color
    var isDone: Bool

    static let tints: [Color] = [.blue, .green, .orange, .purple, .pink]

    static let samples: [StarterItem] = [
        StarterItem(title: "First item", detail: "Short detail line", symbol: "drop.fill", tint: tints[0], isDone: true),
        StarterItem(title: "Second item", detail: "Short detail line", symbol: "figure.walk", tint: tints[1], isDone: true),
        StarterItem(title: "Third item", detail: "Short detail line", symbol: "book.fill", tint: tints[2], isDone: false),
        StarterItem(title: "Fourth item", detail: "Short detail line", symbol: "brain.head.profile", tint: tints[3], isDone: false),
        StarterItem(title: "Fifth item", detail: "Short detail line", symbol: "moon.fill", tint: tints[4], isDone: false),
    ]

    static let week: [(label: String, share: Double)] = [
        ("Mon", 1), ("Tue", 0.6), ("Wed", 1), ("Thu", 1), ("Fri", 0.8), ("Sat", 1), ("Sun", 0),
    ]
}
`;
