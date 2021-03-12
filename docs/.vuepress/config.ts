import type { UserConfig, DefaultThemeOptions } from 'vuepress';

const config: UserConfig<DefaultThemeOptions> = {
  bundlerConfig: {
    chainWebpack: (config) => {
      config.resolve.alias.set('@image', '/public/image/');
    },
  },
  title: '阅读笔记',
  description: '',
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
    lastUpdated: false,
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
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          isGroup: true,
          children: ['', 'using-vue'],
        },
      ],
    },
  },
  plugins: ['@vuepress/plugin-back-to-top', '@vuepress/plugin-medium-zoom'],
};
export = config;
