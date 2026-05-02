// Auto-loaded by Next.js's Babel pipeline when .babelrc.json references it.
// Adds data-source="filepath:line:col" attribute to every JSXOpeningElement so
// the visual-edit overlay in the editor can map a clicked DOM node back to its
// source location.
//
// CommonJS (.cjs) is required because Next.js's Babel pipeline loads plugins
// with a synchronous require() — ESM is not supported in this codepath.
//
// Trade-off: dropping a .babelrc.json into a Next.js project switches Next
// from SWC (Rust-native, fast) to Babel (JS-native, slower). The user can
// delete .babelrc.json + .doable/babel-plugin-source-annotations.cjs to revert
// to SWC at the cost of losing visual-edit click-to-edit.

module.exports = function ({ types: t }) {
  return {
    name: "doable-source-annotations",
    visitor: {
      JSXOpeningElement(path, state) {
        const node = path.node;
        const filename = state.file?.opts?.filename ?? "<unknown>";
        const root = state.file?.opts?.root ?? state.file?.opts?.cwd ?? "";
        let rel = filename;
        if (root && filename.startsWith(root)) {
          rel = filename.slice(root.length).replace(/^[\\/]/, "");
        }
        rel = rel.replace(/\\/g, "/");
        // Skip node_modules / .next / .doable
        if (rel.includes("node_modules") || rel.includes(".next") || rel.includes(".doable")) return;
        const loc = node.loc?.start;
        if (!loc) return;
        // Don't double-annotate
        for (const attr of node.attributes) {
          if (attr.type === "JSXAttribute" && attr.name?.name === "data-source") return;
        }
        node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier("data-source"),
            t.stringLiteral(`${rel}:${loc.line}:${loc.column}`),
          ),
        );
      },
    },
  };
};
