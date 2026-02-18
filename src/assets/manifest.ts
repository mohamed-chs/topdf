export interface AssetArchiveSpec {
  id: 'mathjax' | 'mathjax-font' | 'mermaid';
  tarballUrl: string;
  integrity: string;
}

export const ASSET_SCHEMA_VERSION = 'v1';

export const ASSET_ARCHIVES: ReadonlyArray<AssetArchiveSpec> = [
  {
    id: 'mathjax',
    tarballUrl: 'https://registry.npmjs.org/mathjax/-/mathjax-4.1.0.tgz',
    integrity:
      'sha512-53eDXzxk40pS2sdI6KDCPoreY95ADaGygbi41ExKmn3FYQ+QIdpquIU90eppecelzQjf74kpScyeplVPccnIJw=='
  },
  {
    id: 'mathjax-font',
    tarballUrl:
      'https://registry.npmjs.org/@mathjax/mathjax-newcm-font/-/mathjax-newcm-font-4.1.0.tgz',
    integrity:
      'sha512-n10AwYubUa2hyOzxSRzkwRrgCVns083zkentryXICMPKaWT/watfvK2sUk5D9Bow9mpDfoqb5EWApuUvqnlzaw=='
  },
  {
    id: 'mermaid',
    tarballUrl: 'https://registry.npmjs.org/mermaid/-/mermaid-11.12.3.tgz',
    integrity:
      'sha512-wN5ZSgJQIC+CHJut9xaKWsknLxaFBwCPwPkGTSUYrTiHORWvpT8RxGk849HPnpUAQ+/9BPRqYb80jTpearrHzQ=='
  }
];

export const EXPECTED_RUNTIME_FILES: ReadonlyArray<string> = [
  'mathjax/tex-chtml.js',
  'mathjax/output/chtml.js',
  'mathjax-newcm-font/chtml.js',
  'mermaid/mermaid.min.js'
];
