import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(distDir)) {
  console.error('Error: La carpeta dist no existe. Ejecuta npm run build primero.');
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
const cssFile = files.find(f => f.startsWith('index-') && f.endsWith('.css'));

if (!jsFile || !cssFile) {
  console.error('Error: No se encontraron los archivos bundle en dist/assets.');
  process.exit(1);
}

let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');

// Reemplazar CSS externo por inline <style> (usando función para evitar expansión de caracteres especiales)
html = html.replace(
  new RegExp(`<link rel="stylesheet"[^>]*href="\\/assets\\/${cssFile.replace('.', '\\.')}"[^>]*>`, 'i'),
  () => `<style>\n${cssContent}\n</style>`
);

// Reemplazar JS externo por inline <script> (usando función para evitar expansión de caracteres especiales como $&)
html = html.replace(
  new RegExp(`<script type="module"[^>]*src="\\/assets\\/${jsFile.replace('.', '\\.')}"[^>]*><\\/script>`, 'i'),
  () => `<script type="module" crossorigin>\n${jsContent}\n</script>`
);

// Eliminar tags PWA/SW si se abre desde file:// local para evitar errores de registro
html = html.replace(/<link rel="manifest"[^>]*>/i, '');
html = html.replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/i, '');

// Guardar en las ubicaciones standalone
const targets = [
  'SENASA_App_Standalone.html',
  'SENASA_Cria_App_Movil.html',
  'SENASA_Cria_App_Movil_Vertical.html',
  path.join('dist', 'SENASA_App_Standalone.html')
];

for (const target of targets) {
  fs.writeFileSync(path.join(__dirname, target), html, 'utf8');
  console.log(`Generado exitosamente: ${target}`);
}
