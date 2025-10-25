import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(__dirname, '..');

const files = [
  'public/rustoria-vh/lockpick.html',
  'public/rustoria-vh/keypad.html',
  'public/rustoria-vh/safe.html',
  'public/rustoria-vh/wire.html',
  'public/rustoria-vh/inside.html',
  'public/rustoria_v404/minigameWater.html',
  'public/rustoria_v404/minigameDigit.html',
  'public/rustoria_v404/minigameLockpick.html',
  'public/rustoria_v404/minigameChemicalGather.html',
  'public/rustoria_v404/shop.html',
  'public/rustoria_v404/refine.html',
  'public/rustoria_v404/skill.html'
];

describe('Standalone minigame HTML entries', () => {
  files.forEach((relativePath) => {
    it(`verifies ${relativePath}`, () => {
      const filePath = resolve(projectRoot, relativePath);
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('script type="module" src="js/app.js"');
      expect(content).toMatch(/window\.postMessage\(buildMessage\(\), '\*'\)/);
    });
  });
});
