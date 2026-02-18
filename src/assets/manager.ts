import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rename,
  stat,
  writeFile
} from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { URL, fileURLToPath, pathToFileURL } from 'url';
import https from 'https';
import * as tar from 'tar';
import {
  ASSET_ARCHIVES,
  ASSET_SCHEMA_VERSION,
  EXPECTED_RUNTIME_FILES,
  type AssetArchiveSpec
} from './manifest.js';

export interface RuntimeAssetPaths {
  cacheRoot: string;
  runtimeDir: string;
  mathJaxPath: string;
  mermaidPath: string;
  mathJaxDir: string;
  mathJaxFontDir: string;
}

export interface AssetInstallResult {
  installed: boolean;
  runtimeDir: string;
}

const MAX_REDIRECTS = 5;

const normalizePath = (pathValue: string): string => resolve(pathValue);

const parseIntegrity = (
  integrity: string
): {
  algorithm: string;
  expected: string;
} => {
  const [algorithm, expected] = integrity.split('-', 2);
  if (!algorithm || !expected) {
    throw new Error(`Invalid integrity value: ${integrity}`);
  }
  return { algorithm, expected };
};

const computeDigestBase64 = async (filePath: string, algorithm: string): Promise<string> => {
  const content = await readFile(filePath);
  return createHash(algorithm).update(content).digest('base64');
};

const withNoThrowCleanup = async (pathValue: string): Promise<void> => {
  await rm(pathValue, { recursive: true, force: true }).catch(() => {});
};

const ensureDir = async (dirPath: string): Promise<void> => {
  await mkdir(dirPath, { recursive: true });
};

const toFileUrl = (pathValue: string): string => pathToFileURL(pathValue).href;

const hasFile = async (pathValue: string): Promise<boolean> => {
  try {
    const stats = await stat(pathValue);
    return stats.isFile();
  } catch {
    return false;
  }
};

const defaultCacheRoot = (): string => {
  const custom = process.env.CONVPDF_CACHE_DIR;
  if (custom) return normalizePath(custom);

  if (process.platform === 'win32') {
    const appData = process.env.LOCALAPPDATA ?? process.env.APPDATA;
    if (appData) return join(appData, 'convpdf', 'cache');
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'convpdf');
  }

  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) return join(xdg, 'convpdf');

  return join(homedir(), '.cache', 'convpdf');
};

const runtimeDirFor = (cacheRoot: string): string =>
  join(cacheRoot, `runtime-${ASSET_SCHEMA_VERSION}`);

const resolveRuntimePaths = (cacheRootInput?: string): RuntimeAssetPaths => {
  const cacheRoot = normalizePath(cacheRootInput ?? defaultCacheRoot());
  const runtimeDir = runtimeDirFor(cacheRoot);
  return {
    cacheRoot,
    runtimeDir,
    mathJaxPath: join(runtimeDir, 'mathjax', 'tex-chtml.js'),
    mermaidPath: join(runtimeDir, 'mermaid', 'mermaid.min.js'),
    mathJaxDir: join(runtimeDir, 'mathjax'),
    mathJaxFontDir: join(runtimeDir, 'mathjax-newcm-font')
  };
};

const downloadToFile = async (
  urlValue: string,
  targetPath: string,
  redirectCount = 0
): Promise<void> => {
  const requestUrl = new URL(urlValue);

  await ensureDir(dirname(targetPath));

  await new Promise<void>((resolveDownload, rejectDownload) => {
    const request = https.get(requestUrl, (response) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        if (redirectCount >= MAX_REDIRECTS) {
          rejectDownload(new Error(`Too many redirects while downloading ${urlValue}`));
          return;
        }
        const redirected = new URL(response.headers.location, requestUrl);
        response.resume();
        void downloadToFile(redirected.toString(), targetPath, redirectCount + 1)
          .then(resolveDownload)
          .catch(rejectDownload);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        rejectDownload(new Error(`Failed to download ${urlValue}: HTTP ${statusCode}`));
        return;
      }

      const output = createWriteStream(targetPath);
      void pipeline(response, output).then(resolveDownload).catch(rejectDownload);
    });

    request.on('error', rejectDownload);
  });
};

const assertIntegrity = async (archivePath: string, spec: AssetArchiveSpec): Promise<void> => {
  const { algorithm, expected } = parseIntegrity(spec.integrity);
  const actual = await computeDigestBase64(archivePath, algorithm);
  if (actual !== expected) {
    throw new Error(`Integrity check failed for ${spec.id}`);
  }
};

const extractArchive = async (
  archivePath: string,
  spec: AssetArchiveSpec,
  destinationRoot: string
): Promise<void> => {
  if (spec.id === 'mathjax') {
    const target = join(destinationRoot, 'mathjax');
    await ensureDir(target);
    await tar.x({ file: archivePath, cwd: target, strip: 1 });
    return;
  }

  if (spec.id === 'mathjax-font') {
    const target = join(destinationRoot, 'mathjax-newcm-font');
    await ensureDir(target);
    await tar.x({ file: archivePath, cwd: target, strip: 1 });
    return;
  }

  const target = join(destinationRoot, 'mermaid');
  await ensureDir(target);
  await tar.x({
    file: archivePath,
    cwd: target,
    strip: 2,
    filter: (entryPath: string) => entryPath === 'package/dist/mermaid.min.js'
  });
};

const assertRuntimeFiles = async (runtimeDir: string): Promise<void> => {
  for (const filePath of EXPECTED_RUNTIME_FILES) {
    const absolute = join(runtimeDir, filePath);
    if (!(await hasFile(absolute))) {
      throw new Error(`Missing runtime asset file: ${absolute}`);
    }
  }

  const fontDir = join(runtimeDir, 'mathjax-newcm-font', 'chtml', 'woff2');
  const entries = await readdir(fontDir).catch(() => []);
  if (!entries.some((entry) => entry.endsWith('.woff2'))) {
    throw new Error(`Missing runtime font files in: ${fontDir}`);
  }
};

export const getRuntimeAssetPaths = (cacheDir?: string): RuntimeAssetPaths =>
  resolveRuntimePaths(cacheDir);

export const isRuntimeInstalled = async (cacheDir?: string): Promise<boolean> => {
  const paths = resolveRuntimePaths(cacheDir);
  try {
    await assertRuntimeFiles(paths.runtimeDir);
    return true;
  } catch {
    return false;
  }
};

export const verifyRuntimeAssets = async (cacheDir?: string): Promise<RuntimeAssetPaths> => {
  const paths = resolveRuntimePaths(cacheDir);
  await assertRuntimeFiles(paths.runtimeDir);
  return paths;
};

export const installRuntimeAssets = async (
  cacheDir?: string,
  force = false
): Promise<AssetInstallResult> => {
  const paths = resolveRuntimePaths(cacheDir);

  if (!force && (await isRuntimeInstalled(paths.cacheRoot))) {
    return { installed: false, runtimeDir: paths.runtimeDir };
  }

  await ensureDir(paths.cacheRoot);
  const tempRoot = await mkdtemp(join(paths.cacheRoot, '.convpdf-assets-'));
  const tempRuntimeDir = join(tempRoot, `runtime-${ASSET_SCHEMA_VERSION}`);
  const downloadsDir = join(tempRoot, 'downloads');

  try {
    await ensureDir(tempRuntimeDir);
    await ensureDir(downloadsDir);

    for (const spec of ASSET_ARCHIVES) {
      const archivePath = join(downloadsDir, `${spec.id}.tgz`);
      await downloadToFile(spec.tarballUrl, archivePath);
      await assertIntegrity(archivePath, spec);
      await extractArchive(archivePath, spec, tempRuntimeDir);
    }

    await assertRuntimeFiles(tempRuntimeDir);

    const stagedTarget = `${paths.runtimeDir}.staging`;
    await withNoThrowCleanup(stagedTarget);
    await rename(tempRuntimeDir, stagedTarget);
    await withNoThrowCleanup(paths.runtimeDir);
    await rename(stagedTarget, paths.runtimeDir);

    return { installed: true, runtimeDir: paths.runtimeDir };
  } finally {
    await withNoThrowCleanup(tempRoot);
  }
};

export const cleanRuntimeAssets = async (cacheDir?: string): Promise<void> => {
  const { runtimeDir } = resolveRuntimePaths(cacheDir);
  await withNoThrowCleanup(runtimeDir);
};

export const listCacheEntries = async (cacheDir?: string): Promise<string[]> => {
  const { cacheRoot } = resolveRuntimePaths(cacheDir);
  try {
    return await readdir(cacheRoot);
  } catch {
    return [];
  }
};

export const toRuntimeAssetFileUrls = (cacheDir?: string): { mathjax: string; mermaid: string } => {
  const { mathJaxPath, mermaidPath } = resolveRuntimePaths(cacheDir);
  return {
    mathjax: toFileUrl(mathJaxPath),
    mermaid: toFileUrl(mermaidPath)
  };
};

export const resolveAssetCacheDir = (cacheDir?: string): string =>
  resolveRuntimePaths(cacheDir).cacheRoot;

export const fileUrlToPath = (urlValue: string): string => fileURLToPath(urlValue);

export const makeTempDir = async (): Promise<string> => mkdtemp(join(tmpdir(), 'convpdf-'));

export const exists = async (pathValue: string): Promise<boolean> => {
  try {
    await access(pathValue);
    return true;
  } catch {
    return false;
  }
};

export const writeRuntimeMetadata = async (
  cacheDir: string,
  metadata: Record<string, unknown>
): Promise<void> => {
  const target = join(resolveRuntimePaths(cacheDir).runtimeDir, 'convpdf-assets.json');
  await writeFile(target, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
};
