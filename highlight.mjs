export function highlightLiteralMatch(literalNodes, literalStart, literalStop, match) {
  const start = match.index;
  const stop = match.index + match[0].length;
  // Special case match only in single node;
  switch (literalNodes.length) {
    case 1:
      const [node] = literalNodes;
      return [
        { type: "text", value: node.value.slice(0, start - literalStart) },
        {
          type: "strong",
          children: [
            {
              type: "text",
              value: node.value.slice(start - literalStart, stop - literalStart),
            },
          ],
        },
        {
          type: "text",
          value: node.value.slice(stop - literalStart, node.value.length),
        },
      ];
      break;
    case 0:
      return [];
    default:
      const [first, ...tail] = literalNodes;
      const interior = tail.slice(0, tail.length - 1);
      const last = tail[tail.length - 1];

      const lastStart = literalStop - last.value.length;
      return [
        { type: "text", value: first.value.slice(0, start - literalStart) },
        {
          type: "strong",
          children: [
            {
              type: "text",
              value: first.value.slice(
                start - literalStart,
                first.value.length,
              ),
            },
          ],
        },
        ...interior,
        {
          type: "strong",
          children: [
            {
              type: "text",
              value: last.value.slice(0, stop - lastStart),
            },
          ],
        },
        {
          type: "text",
          value: last.value.slice(stop - lastStart, last.value.length),
        },
      ];
  }
}
