// Mac: firma «ad-hoc» (gratis, sin certificado de Apple) justo después de crear la app y antes del .dmg/.zip.
// Sin ninguna firma, los Mac con chip de Apple dicen que Kopi Client «está dañado» y no dejan abrirlo.
// Con esta firma sale el aviso normal de desarrollador no identificado («Abrir igualmente»).
// electron-builder 25 no hace la firma ad-hoc por sí solo, por eso se hace aquí con codesign.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • firma ad-hoc  ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
};
