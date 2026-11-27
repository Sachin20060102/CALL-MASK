import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

const scanTargets = [
  'backend/src',
  'backend/prisma',
  'backend/package.json',
  'web/src',
  'web/package.json',
  'web/index.html',
  'android/app/src',
  'android/app/build.gradle',
  '.env.example',
  'docker-compose.yml',
];

const ignoreDirs = new Set(['node_modules', 'dist', 'build', '.gradle', '.git']);

const forbiddenPatterns = [
  { label: 'banned DB table wallet_accounts', regex: /\bwallet_accounts\b/i },
  { label: 'banned DB table wallet_transactions', regex: /\bwallet_transactions\b/i },
  { label: 'banned DB table payment_orders', regex: /\bpayment_orders\b/i },
  { label: 'banned DB table pricing_rules', regex: /\bpricing_rules\b/i },
  { label: 'banned payment order route', regex: /\/payments\/(create-order|verify)/i },
  { label: 'banned wallet route', regex: /\/wallet(\/transactions|\/packages|\b)/i },
  { label: 'banned pricing route', regex: /\/pricing\/(countries|rates|estimate)/i },
  { label: 'payment gateway SDK or keyword', regex: /\b(razorpay|stripe|paypal|braintree|play-billing|billingclient|recharge|topup|top-up)\b/i },
  { label: 'wallet or user billing terminology', regex: /\b(wallet|credit_package|creditPackage|userBilling|perMinuteBilling|rateCalculator|paymentReceipt|refundSystem)\b/i },
];

const violations = [];

function walk(targetPath) {
  const fullPath = path.join(rootDir, targetPath);
  if (!fs.existsSync(fullPath)) return;
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of forbiddenPatterns) {
        if (rule.regex.test(line)) {
          violations.push({
            file: targetPath,
            line: index + 1,
            rule: rule.label,
            snippet: line.trim().slice(0, 140),
          });
        }
      }
    });
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(fullPath)) {
      if (ignoreDirs.has(entry)) continue;
      walk(path.join(targetPath, entry));
    }
  }
}

for (const target of scanTargets) {
  walk(target);
}

// Also verify .env.example keeps telephony disabled by default
const envExamplePath = path.join(rootDir, '.env.example');
if (fs.existsSync(envExamplePath)) {
  const envText = fs.readFileSync(envExamplePath, 'utf8');
  if (!/^TELEPHONY_ENABLED=false$/m.test(envText)) {
    violations.push({
      file: '.env.example',
      line: 1,
      rule: 'TELEPHONY_ENABLED must default to false',
      snippet: 'Missing TELEPHONY_ENABLED=false',
    });
  }
}

if (violations.length > 0) {
  console.error('Spec compliance check FAILED. Found prohibited items:');
  for (const v of violations) {
    console.error(` - ${v.file}:${v.line} [${v.rule}]: ${v.snippet}`);
  }
  process.exit(1);
}

console.log('Spec compliance check PASSED: zero user payment/wallet/billing artifacts found, telephony disabled by default.');
