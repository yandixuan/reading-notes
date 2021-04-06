import type { UserConfig, DefaultThemeOptions } from 'vuepress';
import type { SidebarConfig } from '@vuepress/theme-default';

const sidebar: SidebarConfig = {
  '/guide/': [
    {
      isGroup: true,
      text: 'Java8源码阅读',
      children: [
        '/guide/README.md',
        '/guide/ArrayDeque.md',
        '/guide/ArrayList.md',
        '/guide/TreeMap.md',
        '/guide/HashMap.md',
        '/guide/LinkedHashMap.md',
      ],
    },
  ],
};

const config: UserConfig<DefaultThemeOptions> = {
  lang: 'zh-cn',
  base: '/',
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
  bundler: process.env.NODE_ENV === 'production' ? '@vuepress/webpack' : '@vuepress/vite',
};

export = config;
