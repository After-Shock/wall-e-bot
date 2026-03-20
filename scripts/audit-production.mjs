import { execFileSync } from 'node:child_process';

const ALLOWLIST = new Map([
  ['discord.js', 'Tracked separately via staged Discord stack upgrade plan.'],
  ['@discordjs/rest', 'Transitive through discord.js pending staged upgrade.'],
  ['@discordjs/ws', 'Transitive through discord.js pending staged upgrade.'],
  ['undici', 'Transitive through discord.js pending staged upgrade.'],
  ['qs', 'Low severity transitive issue pending upstream/dependency refresh.'],
]);

const severityRank = new Map([
  ['info', 0],
  ['low', 1],
  ['moderate', 2],
  ['high', 3],
  ['critical', 4],
]);

function isDirectOnly(vulnerability) {
  return vulnerability?.isDirect === true;
}

function getSeverityRank(severity) {
  return severityRank.get(severity ?? 'info') ?? 0;
}

let raw;
try {
  raw = execFileSync(
    'npm',
    ['audit', '--workspaces', '--omit=dev', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (error) {
  raw = error.stdout;
}

const report = JSON.parse(raw);
const vulnerabilities = Object.values(report.vulnerabilities ?? {});

const blocking = vulnerabilities.filter((vulnerability) => {
  const severity = getSeverityRank(vulnerability.severity);

  if (isDirectOnly(vulnerability) && severity >= getSeverityRank('high')) {
    return true;
  }

  if (severity >= getSeverityRank('moderate') && !ALLOWLIST.has(vulnerability.name)) {
    return true;
  }

  return false;
});

console.log('Production audit summary:');
for (const vulnerability of vulnerabilities) {
  const note = ALLOWLIST.get(vulnerability.name);
  const status = blocking.includes(vulnerability) ? 'BLOCK' : note ? 'ALLOW' : 'INFO';
  console.log(`- [${status}] ${vulnerability.name} (${vulnerability.severity})`);
  if (note) {
    console.log(`  ${note}`);
  }
}

if (blocking.length > 0) {
  console.error('\nBlocking production vulnerabilities detected.');
  process.exit(1);
}

console.log('\nNo blocking production vulnerabilities detected.');
