# polycentric-docs-examples

The TypeScript shown on the docs' [Examples page](../content/developer/examples.md). Each snippet
is a `// #region <name>` in `src/`, pulled into the page by the code region plugin
(`../plugins/code-region`). CI can test the code in this package, so that doc examples don't drift
from the rest of the codebase.
