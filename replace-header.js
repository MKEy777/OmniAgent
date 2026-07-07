const fs = require('fs');
const path = require('path');

const filePath = path.resolve(process.cwd(), 'packages/coding-agent/src/modes/interactive/interactive-mode.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Find the old header block - match from "// Render opencode-style" to the line with "this.builtInHeader = new Text(...);"
const startMarker = '\t\t\t// Render opencode-style blocky logo banner';
const endMarker = 'this.builtInHeader = new Text(`\\n${renderedLogo}\\n\\n${hint}\\n`, 1, 0);';

const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
  console.error('Could not find start marker');
  console.error('Looking for:', JSON.stringify(startMarker));
  process.exit(1);
}

const afterStart = content.slice(startIdx);
const endIdx = afterStart.indexOf(endMarker);
if (endIdx === -1) {
  console.error('Could not find end marker');
  process.exit(1);
}

const oldBlockEnd = startIdx + endIdx + endMarker.length;

const newBlock =
`\t\t\t// Render opencode-style logo + keyboard shortcut panel
\t\t\tif (this.options.verbose || !this.settingsManager.getQuietStartup()) {
\t\t\t\t// OpenCode-style logo: ⌬ Hello YM
\t\t\t\t// "⌋ Hello" gray, "YM" blue
\t\t\t\tconst gray = chalk.hex("#9CA3AF").bold;
\t\t\t\tconst blue = chalk.hex("#2563EB").bold;
\t\t\t\tconst logo = \`\${gray("⌬ Hello")} \${blue("YM")}\`;

\t\t\t\t// Full keyboard shortcut panel (opencode-style)
\t\t\t\tconst shortcuts = [
\t\t\t\t\tkeyHint("app.interrupt", "Cancel / Abort"),
\t\t\t\t\tkeyHint("app.clear", "Clear editor"),
\t\t\t\t\tkeyHint("app.exit", "Exit when empty"),
\t\t\t\t\trawKeyHint("enter", "Send message"),
\t\t\t\t\tkeyHint("app.editor.external", "External editor"),
\t\t\t\t\trawKeyHint("/", "Commands"),
\t\t\t\t\trawKeyHint("!", "Bash mode"),
\t\t\t\t\tkeyHint("app.model.select", "Model selection"),
\t\t\t\t\tkeyHint("app.thinking.toggle", "Toggle thinking"),
\t\t\t\t\tkeyHint("app.tools.expand", "Toggle tools"),
\t\t\t\t\tkeyHint("app.message.followUp", "Queue follow-up"),
\t\t\t\t\tkeyHint("app.session.new", "New session"),
\t\t\t\t].join("\\n");

\t\t\t\tthis.builtInHeader = new Text(\`\\n\${logo}\\n\\n\${shortcuts}\\n\`, 1, 0);`;

content = content.slice(0, startIdx) + newBlock + content.slice(oldBlockEnd);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully replaced the header block');
