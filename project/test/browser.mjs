import { chromium } from 'playwright-core';
import { loadEnvFile } from 'node:process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const directory = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(directory, '../vela-web/backend/.env'));
assert.ok(process.env.DEMO_PASSWORD, 'DEMO_PASSWORD is required');
const output = path.join(directory, 'artifacts/browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [role, routes] of Object.entries({
    manager: ['/manager', '/manager/accounts', '/manager/courses', '/manager/enrollments', '/manager/payments', '/manager/payroll', '/manager/schedule'],
    teacher: ['/teacher', '/teacher/classes', '/teacher/schedule', '/teacher/income', '/teacher/tests'],
    student: ['/student', '/student/classes', '/student/enrollments', '/student/progress', '/student/tests']
  })) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:3000/login');
    await page.locator('input[type=email]').fill(`${role}@example.test`);
    await page.locator('input[type=password]').fill(process.env.DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(`**/${role}`, { timeout: 15000 });
    for (const route of routes) {
      await page.goto('http://localhost:3000' + route);
      await page.locator('main').waitFor();
      await page.waitForFunction(() => !document.querySelector('main')?.textContent.includes('Đang tải dữ liệu'));
      assert.equal(await page.locator('main .error').count(), 0, `UI error on ${route}`);
      assert.equal(await page.getByText('Không tìm thấy trang.', { exact: true }).count(), 0, route);
      await page.screenshot({ path: path.join(output, route.slice(1).replaceAll('/', '-') + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, [], `${role}: browser errors`);
    await context.close();
    console.log(`${role}: ${routes.length} pages checked`);
  }
} finally {
  await browser.close();
}
