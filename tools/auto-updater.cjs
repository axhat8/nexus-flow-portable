/**
 * NEXUS FLOW - HYBRID LOCAL AUTO-UPDATER
 * 
 * Automatically synchronizes the local hybrid terminal with GitHub on launch.
 * Traders run the local terminal on their PC while the engine executes on Render.
 * 
 * Update Strategies:
 * 1. Git Pull (if trader cloned via git)
 * 2. GitHub Archive Sync (if trader extracted a portable zip)
 * 
 * Preserves all trader-specific private configs (render-edge-url.txt, states, tokens).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'updater-config.json');
const COMMIT_FILE = path.join(PROJECT_ROOT, '.current-commit');

// Files that must NEVER be overwritten during an update
const PROTECTED_FILES = new Set([
  'render-edge-url.txt',
  path.join('public', 'render-edge-url.txt'),
  path.join('dist', 'render-edge-url.txt'),
  path.join('engine', 'hft-engine-state.json'),
  '.env',
  '.env.local'
]);

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {}
  return { githubRepo: '', branch: 'main', autoUpdateOnLaunch: true };
}

function fetchJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'NexusFlow-AutoUpdater',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location, timeoutMs));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

function downloadFile(url, destPath, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, {
      headers: { 'User-Agent': 'NexusFlow-AutoUpdater' },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        return resolve(downloadFile(res.headers.location, destPath, timeoutMs));
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    });
    req.on('timeout', () => { req.destroy(); file.close(); reject(new Error('Timeout')); });
    req.on('error', err => { file.close(); reject(err); });
  });
}

function copyRecursive(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    const relativePath = path.relative(PROJECT_ROOT, destPath);

    // Skip node_modules or protected trader configuration files
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (PROTECTED_FILES.has(relativePath) || PROTECTED_FILES.has(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyRecursive(srcPath, destPath);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch {}
    }
  }
}

async function runAutoUpdater() {
  const config = readConfig();

  // 1. If Git repository is present, use native git pull (fastest & most reliable)
  if (fs.existsSync(path.join(PROJECT_ROOT, '.git'))) {
    try {
      console.log('[*] Git repository detected. Checking GitHub for updates...');
      const stdout = execSync('git pull origin ' + (config.branch || 'main'), {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      if (stdout.includes('Already up to date')) {
        console.log('[✓] Nexus Flow is up to date.');
      } else {
        console.log('[✓] Successfully updated local terminal from GitHub!');
        console.log('[*] Verifying dependencies...');
        execSync('npm install --no-audit --no-fund', { cwd: PROJECT_ROOT, stdio: 'inherit' });
      }
      return;
    } catch {
      console.log('[*] Git pull unavailable. Proceeding to direct update check...');
    }
  }

  // 2. Direct GitHub sync (for portable extracted folders without git)
  const repo = config.githubRepo || process.env.GITHUB_REPO;
  if (!repo || !repo.includes('/')) {
    // No repo configured yet; proceed to launch immediately
    return;
  }

  const branch = config.branch || 'main';
  console.log(`[*] Checking for updates on GitHub (${repo}@${branch})...`);

  try {
    const commitData = await fetchJson(`https://api.github.com/repos/${repo}/commits/${branch}`, 4000);
    const remoteSha = commitData?.sha;
    if (!remoteSha) {
      console.log('[*] Could not verify remote commit. Starting terminal...');
      return;
    }

    let localSha = '';
    if (fs.existsSync(COMMIT_FILE)) {
      localSha = fs.readFileSync(COMMIT_FILE, 'utf8').trim();
    }

    if (localSha && localSha === remoteSha) {
      console.log(`[✓] Nexus Flow is up to date (${remoteSha.slice(0, 7)}).`);
      return;
    }

    console.log(`[⚡] New update detected on GitHub (${remoteSha.slice(0, 7)})!`);
    console.log('[*] Downloading updated files, please wait...');

    const tempZip = path.join(os.tmpdir(), `nexus-update-${Date.now()}.zip`);
    const tempExtractDir = path.join(os.tmpdir(), `nexus-extract-${Date.now()}`);

    const zipUrl = `https://github.com/${repo}/archive/refs/heads/${branch}.zip`;
    await downloadFile(zipUrl, tempZip, 30000);

    // Extract using native tar.exe (built-in on Windows 10/11)
    fs.mkdirSync(tempExtractDir, { recursive: true });
    try {
      execSync(`tar -xf "${tempZip}" -C "${tempExtractDir}"`, { stdio: 'ignore' });
    } catch {
      // Fallback to powershell Expand-Archive
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${tempExtractDir}' -Force"`, { stdio: 'ignore' });
    }

    // Locate extracted root directory (usually repo-main)
    const extractedEntries = fs.readdirSync(tempExtractDir, { withFileTypes: true });
    const subDir = extractedEntries.find(e => e.isDirectory());
    const sourceDir = subDir ? path.join(tempExtractDir, subDir.name) : tempExtractDir;

    // Check if package.json changed
    let pkgChanged = false;
    const oldPkg = path.join(PROJECT_ROOT, 'package.json');
    const newPkg = path.join(sourceDir, 'package.json');
    if (fs.existsSync(oldPkg) && fs.existsSync(newPkg)) {
      pkgChanged = fs.readFileSync(oldPkg, 'utf8') !== fs.readFileSync(newPkg, 'utf8');
    }

    // Apply file updates while preserving protected config
    copyRecursive(sourceDir, PROJECT_ROOT);
    fs.writeFileSync(COMMIT_FILE, remoteSha, 'utf8');

    // Clean up temporary files
    try { fs.unlinkSync(tempZip); } catch {}
    try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch {}

    console.log(`[✓] Successfully updated to commit ${remoteSha.slice(0, 7)}!`);

    if (pkgChanged) {
      console.log('[*] Dependencies changed. Running npm install...');
      execSync('npm install --no-audit --no-fund', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    }
  } catch (err) {
    console.log(`[*] Update check notice: ${err.message || 'Offline'}. Launching terminal...`);
  }
}

// Autonomous execution
if (require.main === module) {
  runAutoUpdater()
    .then(() => process.exit(0))
    .catch(() => process.exit(0)); // Never block startup on error
}

module.exports = { runAutoUpdater };
