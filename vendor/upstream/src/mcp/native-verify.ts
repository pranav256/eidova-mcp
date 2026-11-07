/**
 * The check an agent runs on a native screen before it reports the screen done.
 * The mobile kits and the SwiftUI and React Native guides end with it, because a
 * typecheck passes on a screen whose labels are drawn twice or invisible, and only
 * a rendered screenshot shows that. [BD-1317, BD-1319]
 */

/** The platform a native check targets. */
export type NativeTarget = "swiftui" | "react-native";

/** The numbered check, as markdown, headed by one line. */
export function nativeVerifyText(target: NativeTarget): string {
  const build = target === "react-native"
    ? "1. Build and run the app in a simulator or on a device. A typecheck alone is not a build."
    : "1. Build the app with the iphonesimulator SDK (`xcodebuild`, or `xcrun swiftc` with an `-ios<version>-simulator` target) and run it in a simulator. A typecheck alone is not a build. If `xcrun` says the iphonesimulator SDK cannot be located, the command line tools are selected instead of Xcode: run the command with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.";
  const shadow = target === "react-native"
    ? "4. A shadow on a view with no background colour is drawn under every child, text included. Give the view a background, or put the shadow on a background view."
    : "4. A `.shadow()` on a container with no background is drawn under every child, text included. Put the shadow on the background shape instead.";
  return [
    "Check the screen on a device before you report it done:",
    "",
    build,
    "2. Take a screenshot of every state you built: empty, selected, disabled and dark mode.",
    "3. Read each screenshot. Every label shows once and reads clearly: no text drawn twice, no button whose label matches its fill, no clipped or overlapping text, no chart or card spilling over its neighbour. Fix what fails and take the screenshot again.",
    shadow,
    "5. Measure the spacing: run `axe describe-ui --udid <simulator id>` on each screen and pass the JSON to Better Design's `inspect-spacing` as `nativeStates`. Fix what it reports, then measure again. If AXe is missing, install it with `brew install cameroncooke/axe/axe`, or say that spacing was not measured.",
    ...(target === "swiftui"
      ? ["6. Where `review-ui-code` is available, send it the path of every .swift file you wrote, with no content. Fix every serious finding, then send the files again."]
      : []),
  ].join("\n");
}
