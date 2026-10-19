import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render the shared SVG component as DOM primitives without native bindings.
mock.module("react-native-svg", () => ({
    default: ({ accessibilityRole, accessibilityLabel, ...props }) =>
        createElement("svg", {
            ...props,
            role: accessibilityRole,
            "aria-label": accessibilityLabel,
        }),
    Circle: "circle",
    Defs: "defs",
    LinearGradient: "linearGradient",
    Path: "path",
    Rect: "rect",
    Stop: "stop",
}));
const { PosLogo, AdminLogo } = await import("@indyzai/pos-ui-native/branding");

test("multiple POS brand marks keep their own SVG gradients", () => {
    const markup = renderToStaticMarkup(
        createElement(
            "div",
            null,
            createElement(PosLogo, { color: "#1B6EF3" }),
            createElement(AdminLogo, { color: "#4052C2" }),
        ),
    );
    const ids = Array.from(markup.matchAll(/id="([^"]+)"/g), ([, id]) => id);
    const references = Array.from(
        markup.matchAll(/url\(#([^)]+)\)/g),
        ([, id]) => id,
    );
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(references.every((id) => ids.includes(id))).toBe(true);
    const [firstLogo, secondLogo] = markup.split("</svg>");
    const firstIds = Array.from(
        firstLogo.matchAll(/id="([^"]+)"/g),
        ([, id]) => id,
    );
    expect(firstIds.every((id) => !secondLogo.includes(id))).toBe(true);
});
