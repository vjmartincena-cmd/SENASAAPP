const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');

const bundled = html
    .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
    .replace('<script src="app.js"></script>', `<script>\n${js}\n</script>`);

fs.writeFileSync('SENASA_App_Movil.html', bundled);
console.log('Generado exitosamente: SENASA_App_Movil.html');
