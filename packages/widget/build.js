const esbuild = require('esbuild');
const watch   = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/widget.ts'],
  bundle:      true,
  minify:      !watch,
  outfile:     'dist/widget.js',
  format:      'iife',
  platform:    'browser',
  target:      ['es2020', 'chrome80', 'firefox75', 'safari13'],
  // Expose nothing to global scope — widget auto-inits on DOMContentLoaded
  footer: {
    js: '// Sign In With XRPM Widget | MIT License | https://github.com/xrpmemes/xrpm-login',
  },
};

if (watch) {
  esbuild.context(config).then(ctx => {
    ctx.watch();
    console.log('Watching...');
  });
} else {
  esbuild.build(config).then(() => {
    console.log('Widget built → dist/widget.js');
  }).catch(() => process.exit(1));
}
