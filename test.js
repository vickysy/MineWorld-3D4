const fs = require('fs');
const html = fs.readFileSync('game3d.html', 'utf8');
const scriptContent = html.match(/<script>([\s\S]*?)<\/script>/)[1];
try {
  new Function(scriptContent);
  console.log("OK");
} catch (e) {
  console.error("Syntax Error:", e);
}
