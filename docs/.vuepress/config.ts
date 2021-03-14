import type { UserConfig, DefaultThemeOptions } from 'vuepress';
import type { SidebarConfig } from '@vuepress/theme-default';

const sidebar: SidebarConfig = {
  '/guide/': [
    {
      isGroup: true,
      text: 'Java8源码阅读',
      children: ['/guide/README.md', '/guide/ArrayDeque.md'],
    },
  ],
};

const config: UserConfig<DefaultThemeOptions> = {
  lang: 'zh-cn',
  base: '/',
  bundlerConfig: {
    chainWebpack: (config) => {
      config.resolve.alias.set('@image', '/public/image/');
    },
  },
  title: '阅读笔记',
  head: [
    ['meta', { name: 'theme-color', content: '#3eaf7c' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }],
  ],
  themeConfig: {
    repo: '',
    editLinks: false,
    docsDir: '',
    editLinkText: '',
    lastUpdated: true,
    navbar: [
      {
        text: 'Guide',
        link: '/guide/',
      },
      {
        text: 'Config',
        link: '/config/',
      },
      {
        text: 'VuePress',
        link: 'https://v1.vuepress.vuejs.org',
      },
    ],
    sidebar: sidebar,
  },
  plugins: ['@vuepress/plugin-back-to-top', '@vuepress/plugin-medium-zoom'],
};

export = config;
