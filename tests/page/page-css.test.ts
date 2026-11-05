import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { cssRules, declarations, selectorsOf } from '../support/css.ts';
import { REPO } from '../support/run-command.ts';

const DIMENSION_RULE = /#dims|#dimB|#dimL|\.dim(?:-btn|-pop)?(?![\w-])/;
const HARD_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
const COLORS = ['color', 'background', 'background-color', 'border', 'border-color', 'outline'];
const FONTS = ['font', 'font-family', 'font-size'];

test('the dimension button and list take each color from a theme token, and their font from the panel', () => {
  const rules = cssRules(readFileSync(join(REPO, 'src/page/page.css'), 'utf8')).filter((rule) =>
    selectorsOf(rule).some((selector) => DIMENSION_RULE.test(selector)),
  );
  for (const rule of rules) {
    const found = declarations(rule.body);
    for (const name of COLORS) expect(found.get(name) ?? '', `${name} in ${rule.selector}`).not.toMatch(HARD_COLOR);
    for (const name of FONTS) expect(found.has(name), `${name} in ${rule.selector}`).toBe(false);
  }
  expect(rules.length).toBeGreaterThanOrEqual(10);
});
