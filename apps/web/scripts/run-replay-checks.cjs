/* eslint @typescript-eslint/no-require-imports: off */
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { runReplayUnitChecks } = require("../src/lib/replay/checks.ts");
const result = runReplayUnitChecks();
if (!result?.ok) throw new Error("Replay unit checks did not pass");
process.stdout.write("Replay unit checks passed.\n");
