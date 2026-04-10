// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  // Navigation
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  // Attendance / Time
  "clock.fill": "access-time",
  "clock": "access-time",
  "calendar": "calendar-today",
  "calendar.badge.clock": "event",
  // GPS / Location
  "location.fill": "location-on",
  "location": "location-on",
  "location.slash.fill": "location-off",
  "map.fill": "map",
  "map": "map",
  // Person
  "person.fill": "person",
  "person": "person",
  "person.circle.fill": "account-circle",
  // Status
  "checkmark.circle.fill": "check-circle",
  "xmark.circle.fill": "cancel",
  "pause.circle.fill": "pause-circle-filled",
  "play.circle.fill": "play-circle-filled",
  // Truck / Operation specific
  "truck.box.fill": "local-shipping",
  "truck.fill": "local-shipping",
  "shippingbox.fill": "inventory",
  "shippingbox": "inventory",
  "arrow.up.box.fill": "upload",
  "arrow.down.box.fill": "download",
  "flag.fill": "flag",
  "flag.checkered": "sports-score",
  "road.lanes": "route",
  "car.fill": "directions-car",
  "fuelpump.fill": "local-gas-station",
  "speedometer": "speed",
  "exclamationmark.triangle.fill": "warning",
  "info.circle.fill": "info",
  "doc.text.fill": "description",
  "doc.text": "description",
  // Misc
  "list.bullet": "list",
  "gear": "settings",
  "bell.fill": "notifications",
  "arrow.right.square.fill": "logout",
  "wifi": "wifi",
  "link": "link",
  "building.2.fill": "business",
  "wifi.slash": "wifi-off",
  "qrcode": "qr-code-scanner",
  "qrcode.viewfinder": "qr-code-scanner",
  "camera.fill": "camera-alt",
  "camera": "camera-alt",
  "plus.circle.fill": "add-circle",
  "minus.circle.fill": "remove-circle",
  "arrow.clockwise": "refresh",
  "xmark": "close",
  "checkmark": "check",
} as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
