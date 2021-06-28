import type { UserConfig, DefaultThemeOptions } from 'vuepress';
import type { SidebarConfig } from '@vuepress/theme-default';

const sidebar: SidebarConfig = {
  '/collection/': [
    {
      text: 'Java8源码阅读',
      children: [
        '/collection/ArrayDeque.md',
        '/collection/ArrayList.md',
        '/collection/TreeMap.md',
        '/collection/HashMap.md',
        '/collection/LinkedHashMap.md',
      ],
    },
  ],
  '/concurrent/': [
    {
      text: 'concurrent',
      children: [
        '/concurrent/RunnableFuture.md',
        '/concurrent/FutureTask.md',
        '/concurrent/ThreadLocal.md',
        '/concurrent/InheritableThreadLocal.md',
        '/concurrent/AbstractOwnableSynchronizer.md',
        '/concurrent/AbstractQueuedSynchronizer.md',
        '/concurrent/ConditionObject.md',
        '/concurrent/ConcurrentHashMap.md',
        '/concurrent/ExecutorService.md',
        '/concurrent/AbstractExecutorService.md',
        '/concurrent/ThreadPoolExecutor.md',
        '/concurrent/ReentrantReadWriteLock.md',
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
        text: 'Collection',
        link: '/collection/',
      },
      {
        text: 'Concurrent',
        link: '/concurrent/',
      },
      {
        text: 'VuePress',
        link: 'https://github.com/vuepress/vuepress-next',
      },
    ],
    sidebar: sidebar,
  },
  plugins: ['@vuepress/plugin-back-to-top', '@vuepress/plugin-medium-zoom'],
  bundler: process.env.NODE_ENV === 'production' ? '@vuepress/webpack' : '@vuepress/vite',
};

export = config;
