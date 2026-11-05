// 打包后把安装包改成一眼能看懂的名字：写明是 M 芯片还是英特尔芯片、普通 Windows 电脑还是骁龙笔记本
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "release");
const rules = [
  [/^TabPilot-(.+)-arm64\.dmg$/, (v) => `TabPilot-Mac-M芯片版-${v}.dmg`],
  [/^TabPilot-(.+)-x64\.dmg$/, (v) => `TabPilot-Mac-英特尔芯片版-${v}.dmg`],
  [/^TabPilot-Setup-(.+)-x64\.exe$/, (v) => `TabPilot-Windows版-大多数电脑选这个-${v}.exe`],
  [/^TabPilot-Setup-(.+)-arm64\.exe$/, (v) => `TabPilot-Windows版-骁龙笔记本专用-${v}.exe`],
];
for (const f of fs.readdirSync(dir)) {
  for (const [re, name] of rules) {
    const m = f.match(re);
    if (m) {
      fs.renameSync(path.join(dir, f), path.join(dir, name(m[1])));
      console.log(`${f} -> ${name(m[1])}`);
    }
  }
}
