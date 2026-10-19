// Builds MeshCommander's web pages from the upstream GitHub source.
//
// Upstream compiles its pages with a Windows-only tool (WebSite Compiler) whose
// source is not published. This reproduces what that tool does for the pages
// shipped in the npm package:
//
// - Removes `###BEGIN###{Feature}` ... `###END###{Feature}` blocks whose
//   condition is false. `{!Feature}` negates; blocks nest.
// - Inlines stylesheets as <style> and moves every script, external or inline,
//   into one <script> after the document, in source order.
// - Inlines images referenced by double-quoted CSS url("...") and HTML src="...".
// - Substitutes the enabled feature list for /*###WEBCOMPILERFEATURES###*/.
//
// The checks rebuild the npm 0.9.5-a pages from the matching source commit
// and compare them with the published files.
//
// usage: node compile-ui.mjs SOURCE_DIRECTORY OUTPUT_DIRECTORY
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Feature sets recorded in the npm 0.9.5-a pages (`webcompilerfeatures`), in
// their recorded order. The variants differ only in the computer list's
// source and in-band file transfer.
const variants = {
  // Computer list stored in the browser.
  default: [
    'AgentPresence', 'Alarms', 'AuditLog', 'Certificates', 'ComputerSelector', 'ComputerSelector-Local',
    'ComputerSelectorToolbar', 'ContextMenus', 'Desktop', 'DesktopFocus', 'DesktopInband', 'DesktopInbandFiles',
    'Desktop-Multi', 'DesktopRecorder', 'DesktopRotation', 'Desktop-Settings', 'EventLog', 'EventSubscriptions',
    'FileSaver', 'HardwareInfo', 'IDER', 'IDERDebug', 'IDERStats', 'Inflate', 'Look-Commander', 'Mode-WebSite',
    'NetAuth', 'NetworkSettings', 'PowerControl', 'PowerControl-Advanced', 'RemoteAccess', 'Scripting',
    'Scripting-Editor', 'SessionRecording', 'Storage', 'SystemDefense', 'Terminal', 'Terminal-Enumation-All',
    'Terminal-FxEnumation-All', 'TerminalReplay', 'TerminalSize', 'USBSetup', 'VersionWarning', 'Wireless',
    'WsmanBrowser',
  ],
  // Computer list supplied by the URL.
  remote: [
    'AgentPresence', 'Alarms', 'AuditLog', 'Certificates', 'ComputerSelector', 'ComputerSelector-Remote',
    'ComputerSelectorToolbar', 'ContextMenus', 'Desktop', 'DesktopFocus', 'DesktopInband', 'Desktop-Multi',
    'DesktopRecorder', 'DesktopRotation', 'Desktop-Settings', 'EventLog', 'EventSubscriptions', 'FileSaver',
    'HardwareInfo', 'IDER', 'IDERDebug', 'IDERStats', 'Inflate', 'Look-Commander', 'Mode-WebSite', 'NetAuth',
    'NetworkSettings', 'PowerControl', 'PowerControl-Advanced', 'RemoteAccess', 'Scripting', 'Scripting-Editor',
    'SessionRecording', 'Storage', 'SystemDefense', 'Terminal', 'Terminal-Enumation-All', 'Terminal-FxEnumation-All',
    'TerminalReplay', 'TerminalSize', 'USBSetup', 'VersionWarning', 'Wireless', 'WsmanBrowser',
  ],
};

// Names absent from the upstream compiler's feature registry; it leaves their
// markers and contents in place.
const unregistered = new Set(['Look-Intel']);

const marker = /^\s*(?:<!--|\/\/)\s*###(BEGIN|END)###\{([^}]*)\}/;
const mimeTypes = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };

function preprocess(text, features) {
  const conditions = [];
  const kept = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(marker);
    if (m && !unregistered.has(m[2].replace(/^!/, ''))) {
      if (m[1] === 'BEGIN') {
        const negated = m[2].startsWith('!');
        conditions.push(features.has(negated ? m[2].slice(1) : m[2]) !== negated);
      } else {
        conditions.pop();
      }
      continue;
    }
    if (conditions.every(Boolean)) kept.push(line);
  }
  return kept.join('\n');
}

function compilePage(source, page, featureList) {
  const features = new Set(featureList);
  const read = (file) => readFileSync(join(source, file), 'utf8').replace(/^﻿/, '');
  const dataUri = (file) => `data:${mimeTypes[file.split('.').pop().toLowerCase()]};base64,${readFileSync(join(source, file)).toString('base64')}`;
  const inlineImages = (text) => text
    .replace(/url\("(images[^"]*\/[^"]+)"\)/g, (all, file) => existsSync(join(source, file)) ? `url("${dataUri(file)}")` : all)
    .replace(/src="(images[^"]*\/[^"]+)"/g, (all, file) => existsSync(join(source, file)) ? `src="${dataUri(file)}"` : all);
  // Translated pages use a translated copy of a script when one exists. The
  // language code ends at the first hyphen, so zh-chs uses English scripts.
  const language = page.match(/^index_([a-z]+)/)?.[1];
  const localized = (file) => {
    const translated = language && file.replace(/\.js$/, `_${language}.js`);
    return translated && existsSync(join(source, translated)) ? translated : file;
  };

  const scripts = [];
  let html = preprocess(read(page), features)
    .replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, (_, file) => `<style>${preprocess(read(file), features)}</style>`);
  html = inlineImages(html).replace(/<style type="text\/css">/g, '<style>');
  html = html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, file) => {
    scripts.push(preprocess(read(localized(file)), features));
    return '';
  });
  html = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/g, (_, body) => {
    scripts.push(body);
    return '';
  });
  const featureLiteral = featureList.map((name) => `'${name}'`).join(',');
  const script = scripts.join('').replace('/*###WEBCOMPILERFEATURES###*/', featureLiteral);
  return `﻿${html}\n<script>${script}</script>\n`;
}

const [source, output] = process.argv.slice(2);
if (!source || !output) {
  console.error('usage: node compile-ui.mjs SOURCE_DIRECTORY OUTPUT_DIRECTORY');
  process.exit(2);
}
// index.html -> default.htm and remote.htm; index_de.html -> default-de.htm and remote-de.htm.
mkdirSync(output, { recursive: true });
const pages = readdirSync(source).filter((file) => /^index(_[a-z-]+)?\.html$/.test(file));
if (pages.length === 0) throw new Error(`No index*.html pages in ${source}`);
for (const page of pages) {
  const suffix = page.slice('index'.length, -'.html'.length).replace('_', '-');
  for (const [variant, features] of Object.entries(variants)) {
    writeFileSync(join(output, `${variant}${suffix}.htm`), compilePage(source, page, features));
  }
}
console.log(`Compiled ${pages.length * Object.keys(variants).length} pages`);
