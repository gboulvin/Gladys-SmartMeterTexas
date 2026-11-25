// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code,
// and the store rules that are easiest to miss.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/meters.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES, MESSAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
    (item) => item.fields ?? [],
  ),
  ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
];

// First Gladys release accepting each manifest field (older cores reject it).
const MIN_GLADYS = {
  categories: [4, 86, 0],
  widgets: [5, 1, 0],
  scene_triggers: [5, 1, 0],
  scene_actions: [5, 1, 0],
  keywords: [5, 3, 0],
  countries: [5, 3, 0],
};

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('gladys_version covers every declared field', () => {
  for (const [field, version] of Object.entries(MIN_GLADYS)) {
    if (manifest[field] !== undefined) {
      assert.ok(
        isAtLeast(minGladysVersion(), version),
        `${field} requires gladys_version >= ${version.join('.')}`,
      );
    }
  }
});

test('the integration is tagged cloud, energy, and available in the United States', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['energy']);
  assert.deepEqual(manifest.countries, ['US']);
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const normalized = manifest.keywords.map((k) => k.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'keywords are unique');
});

test('manifest actions, scene actions and widgets match their handlers', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.ok(!(field.key in DEFAULT_CONFIG));
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `${field.key} is missing from DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of ${field.key}`);
    }
  }
  const password = manifest.config_schema.find((field) => field.key === 'password');
  assert.equal(password.type, 'secret', 'the password is never sent back to the browser');
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('every text of the manifest is translated in English, French, German and Spanish', () => {
  const missing = [];
  const visit = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, `${path}[${i}]`));
      return;
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (typeof node.en === 'string') {
      for (const lang of LANGUAGES) {
        if (typeof node[lang] !== 'string' || node[lang] === '') {
          missing.push(`${path}.${lang}`);
        }
      }
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      visit(child, `${path}.${key}`);
    }
  };
  visit(manifest, 'manifest');
  assert.deepEqual(missing, []);
});

test('every runtime message is translated, with the same placeholders', () => {
  for (const [key, message] of Object.entries(MESSAGES)) {
    assert.deepEqual(Object.keys(message), LANGUAGES, `${key} languages`);
    const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const lang of LANGUAGES) {
      assert.deepEqual(placeholders(message[lang]), placeholders(message.en), `${key}.${lang}`);
    }
  }
});

test('store length limits: description, widget label and description', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
  for (const widget of manifest.widgets) {
    for (const text of Object.values(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30);
    }
    for (const text of Object.values(widget.description)) {
      assert.ok(text.length <= 100, `widget description: ${text.length}`);
    }
  }
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
});

test('placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object');
    assert.ok(field.placeholder.en);
  }
});

test('timeouts stay within the 5-120 s the core accepts', () => {
  for (const item of [...manifest.actions, ...manifest.scene_actions]) {
    assert.ok(item.timeout_seconds >= 5 && item.timeout_seconds <= 120, item.key);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the user documentation exists in the four languages', async () => {
  for (const lang of LANGUAGES) {
    const doc = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    assert.ok(doc.length >= 300, `docs/${lang}.md is too short`);
  }
});
