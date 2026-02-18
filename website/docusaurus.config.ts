import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'A0',
  tagline: 'A scripting language designed for autonomous agents',
  favicon: 'img/favicon.ico',

  url: 'https://thomasrohde.github.io',
  baseUrl: process.env.NODE_ENV === 'production' ? '/Agent0/' : '/',

  organizationName: 'ThomasRohde',
  projectName: 'Agent0',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/ThomasRohde/Agent0/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en'],
        indexBlog: false,
        docsRouteBasePath: '/docs',
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'A0',
      logo: {
        alt: 'A0 Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/ThomasRohde/Agent0',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Getting Started', to: '/docs/getting-started/installation'},
            {label: 'Language Reference', to: '/docs/language/data-types'},
            {label: 'CLI Reference', to: '/docs/cli/overview'},
          ],
        },
        {
          title: 'Reference',
          items: [
            {label: 'Built-in Tools', to: '/docs/tools/overview'},
            {label: 'Standard Library', to: '/docs/stdlib/overview'},
            {label: 'Error Reference', to: '/docs/errors/diagnostic-codes'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'GitHub', href: 'https://github.com/ThomasRohde/Agent0'},
            {label: 'Examples', to: '/docs/examples/'},
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} A0 Project. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
