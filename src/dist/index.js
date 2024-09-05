export function headingsToSections(tree) {
    var _a;
    const stack = [];
    const children = [];
    function push(child) {
        const top = stack[stack.length - 1];
        if (top) {
            top.children.push(child);
        }
        else {
            children.push(child);
        }
    }
    function newSection(heading) {
        const { enumerator, enumerated, ...filtered } = heading;
        const next = { ...filtered, type: 'section', children: [] };
        while (stack[stack.length - 1] && stack[stack.length - 1].depth >= heading.depth)
            stack.pop();
        push(next);
        stack.push(next);
        return { enumerator, enumerated };
    }
    (_a = tree.children) === null || _a === void 0 ? void 0 : _a.forEach((child) => {
        if (child.type === 'heading') {
            const { enumerator, enumerated } = newSection(child);
            push({ type: 'heading', enumerator, enumerated, children: child.children });
        }
        else {
            push(child);
        }
    });
    tree.children = children;
}
