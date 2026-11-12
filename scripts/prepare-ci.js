// Se ejecuta en GitHub Actions antes de compilar.
// Rellena automáticamente tu usuario/repositorio para que no tengas que editarlo a mano.
const fs = require('fs');
const path = require('path');

const repo = process.env.GITHUB_REPOSITORY; // "usuario/onyx-client"
if (!repo) { console.log('GITHUB_REPOSITORY no definido: nada que hacer'); process.exit(0); }
const [owner, name] = repo.split('/');
const root = path.join(__dirname, '..');

const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.build.publish = [{ provider: 'github', owner, repo: name, releaseType: 'draft' }];
pkg.repository = `https://github.com/${repo}`;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));

const cfgFile = path.join(root, 'onyx.config.json');
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
if (!cfg.dataUrl || cfg.dataUrl.includes('TU-USUARIO')) cfg.dataUrl = `https://raw.githubusercontent.com/${owner}/onyx-data/main`;
if (!cfg.githubRepo || cfg.githubRepo.includes('TU-USUARIO')) cfg.githubRepo = repo;
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

console.log(`Configurado para ${repo}`);
console.log(`  datos: ${cfg.dataUrl}`);
