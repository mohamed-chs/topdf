import { pathToFileURL } from 'url';
import type { AssetMode } from '../types.js';
import { getRuntimeAssetPaths, isRuntimeInstalled, resolveAssetCacheDir } from './manager.js';

export const CDN_MATHJAX_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js';
export const CDN_MERMAID_SRC = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

export interface AssetResolutionInput {
  mode?: AssetMode;
  cacheDir?: string;
  allowNetworkFallback?: boolean;
  serverBaseUrl?: string;
}

export interface RuntimeAssetResolution {
  mathJaxSrc: string;
  mermaidSrc: string;
  mathJaxBaseUrl?: string;
  mathJaxFontBaseUrl?: string;
  warning?: string;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const toServerRuntimeUrls = (
  serverBaseUrl: string
): {
  mathJaxSrc: string;
  mermaidSrc: string;
  mathJaxBaseUrl: string;
  mathJaxFontBaseUrl: string;
} => {
  const base = trimTrailingSlash(serverBaseUrl);
  return {
    mathJaxSrc: `${base}/__convpdf_assets/mathjax/tex-chtml.js`,
    mermaidSrc: `${base}/__convpdf_assets/mermaid/mermaid.min.js`,
    mathJaxBaseUrl: `${base}/__convpdf_assets/mathjax`,
    mathJaxFontBaseUrl: `${base}/__convpdf_assets/mathjax-newcm-font`
  };
};

export const resolveRuntimeAssetSources = async (
  input: AssetResolutionInput
): Promise<RuntimeAssetResolution> => {
  const mode = input.mode ?? 'auto';
  const allowNetworkFallback = input.allowNetworkFallback ?? true;

  if (mode === 'cdn') {
    return {
      mathJaxSrc: CDN_MATHJAX_SRC,
      mermaidSrc: CDN_MERMAID_SRC
    };
  }

  const installed = await isRuntimeInstalled(input.cacheDir);
  if (installed) {
    const paths = getRuntimeAssetPaths(input.cacheDir);
    if (input.serverBaseUrl) {
      const urls = toServerRuntimeUrls(input.serverBaseUrl);
      return urls;
    }

    const mathJaxSrc = pathToFileURL(paths.mathJaxPath).href;
    const mermaidSrc = pathToFileURL(paths.mermaidPath).href;
    return {
      mathJaxSrc,
      mermaidSrc,
      mathJaxBaseUrl: mathJaxSrc.replace(/\/tex-chtml\.js$/, ''),
      mathJaxFontBaseUrl: trimTrailingSlash(pathToFileURL(paths.mathJaxFontDir).href)
    };
  }

  if (!allowNetworkFallback) {
    throw new Error(
      `Local runtime assets are required but missing. Run: convpdf assets install --cache-dir "${resolveAssetCacheDir(
        input.cacheDir
      )}"`
    );
  }

  const warning =
    mode === 'local'
      ? 'Local runtime assets were not found. Falling back to CDN assets.'
      : undefined;

  return {
    mathJaxSrc: CDN_MATHJAX_SRC,
    mermaidSrc: CDN_MERMAID_SRC,
    warning: allowNetworkFallback ? warning : undefined
  };
};
