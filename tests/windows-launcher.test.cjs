const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const launcherPath = path.join(root, "Configurateur de Bijoux Rosebuds.exe");
const launcherSource = fs.readFileSync(path.join(root, "launcher", "Program.cs"), "utf8");
const shortcutScript = fs.readFileSync(path.join(root, "install-configurateur.ps1"), "utf8");
const installerSource = fs.readFileSync(
  path.join(root, "FICHIER D'INSTALLATION", "CODE SOURCE INSTALLEUR", "Configurateur de Bijoux v0.6-260923.iss"),
  "utf8"
);

assert(fs.existsSync(launcherPath), "Le véritable exécutable Windows doit être compilé.");
const executable = fs.readFileSync(launcherPath);
assert(executable.length > 10000, "Le lanceur Windows semble incomplet.");
assert(executable[0] === 0x4d && executable[1] === 0x5a, "Le lanceur doit être un exécutable PE Windows commençant par MZ.");
assert(launcherSource.includes("TcpListener"), "Le lanceur EXE doit héberger directement le serveur local.");
assert(!launcherSource.includes("relancer-viewer.bat"), "Le lanceur EXE ne doit pas appeler l'ancien fichier BAT.");
assert(shortcutScript.includes("$targetExe"), "Les raccourcis réparés doivent cibler l'EXE.");
assert(!shortcutScript.includes("$targetBat"), "Les raccourcis ne doivent plus cibler un BAT.");
assert(installerSource.includes("{#AppExecutable}"), "L'installateur doit embarquer le véritable EXE.");
assert(!installerSource.includes('Filename: "{app}\\relancer-viewer.bat"'), "L'installateur ne doit pas lancer le BAT.");

console.log("Windows EXE launcher regression test OK");
