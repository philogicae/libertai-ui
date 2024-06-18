const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', redirect: '/new' },
      { path: 'vocal', component: () => import('pages/VocalChat.vue') },
      {
        path: 'new',
        name: 'new-chat',
        component: () => import('pages/NewChat.vue'),
      },
      // chat view with chat id
      {
        path: 'chat/:id',
        name: 'chat',
        component: () => import('pages/Chat.vue'),
      },
      // { path: 'tokens', component: () => import('pages/TokensInfo.vue') },
      // {
      //   path: 'tokens/:address',
      //   name: 'tokens-detail',
      //   component: () => import('pages/TokensDetail.vue'),
      // },
      // knowledge db
      {
        path: 'knowledge-db',
        component: () => import('src/pages/KnowledgeBase.vue'),
      },
      {
        path: 'persona-management',
        component: () => import('src/pages/PersonaManagement.vue'),
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
